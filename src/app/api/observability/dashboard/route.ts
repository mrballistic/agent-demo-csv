/**
 * Observability dashboard API endpoint
 * Provides metrics for p50/p95 run latency, token usage, error rates, and queue depth
 * Implements requirement 8.2 for observability and cost tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { telemetryService } from '@/lib/telemetry';
import { runQueue } from '@/lib/run-queue';
import {
  ErrorFactory,
  classifyError,
  createErrorTelemetry,
} from '@/lib/error-handler';

export interface DashboardMetrics {
  // Run latency metrics
  runLatency: {
    p50: number;
    p95: number;
    avg: number;
    count: number;
  };

  // Token usage metrics
  tokenUsage: {
    totalInput: number;
    totalOutput: number;
    avgInputPerRun: number;
    avgOutputPerRun: number;
    costEstimate: number; // USD estimate
  };

  // Run status metrics
  runStats: {
    started: number;
    completed: number;
    failed: number;
    cancelled: number;
    successRate: number;
  };

  // Queue metrics
  queueMetrics: {
    currentDepth: number;
    maxDepth: number;
    avgWaitTime: number;
    avgRunTime: number;
  };

  // Error metrics
  errorMetrics: {
    totalErrors: number;
    errorRate: number;
    errorsByType: Record<string, number>;
    retryableErrors: number;
  };

  // System health
  systemHealth: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    memoryUsage?: number;
  };

  // Time range
  timeRange: {
    start: string;
    end: string;
    durationMs: number;
  };
}

const startTime = Date.now();

// Token pricing (GPT-4o rates as of 2024)
const TOKEN_PRICING = {
  input: 0.0025 / 1000, // $0.0025 per 1K input tokens
  output: 0.01 / 1000, // $0.01 per 1K output tokens
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const timeRangeParam = searchParams.get('timeRange') || '24h';

    // Parse time range
    const timeRangeMs = parseTimeRange(timeRangeParam);
    const endTime = Date.now();
    const startTimeRange = endTime - timeRangeMs;

    // Get run latency metrics
    const runLatencyStats = telemetryService.getMetricStats(
      'analysis_duration',
      timeRangeMs
    );

    // Get token usage metrics
    const inputTokenStats = telemetryService.getMetricStats(
      'openai_tokens_input',
      timeRangeMs
    );
    const outputTokenStats = telemetryService.getMetricStats(
      'openai_tokens_output',
      timeRangeMs
    );

    // Calculate cost estimate
    const costEstimate =
      inputTokenStats.sum * TOKEN_PRICING.input +
      outputTokenStats.sum * TOKEN_PRICING.output;

    // Get run status metrics from audit events
    const runEvents = telemetryService.getAuditEvents(timeRangeMs);
    const runStarted = runEvents.filter(
      e => e.data.action === 'analysis_request'
    ).length;
    const runCompleted = runEvents.filter(
      e =>
        e.data.action === 'analysis_completion' &&
        e.data.details?.success === true
    ).length;
    const runFailed = runEvents.filter(
      e =>
        e.data.action === 'analysis_completion' &&
        e.data.details?.success === false
    ).length;
    const runCancelled = runEvents.filter(
      e => e.data.action === 'run_cancelled'
    ).length;

    // Get queue metrics
    const queueStats = runQueue.getStats();
    const queueWaitStats = telemetryService.getMetricStats(
      'queue_wait_time',
      timeRangeMs
    );

    // Get error metrics
    const errorStats = telemetryService.getErrorStats(timeRangeMs);
    const totalRequests = runStarted;
    const errorRate =
      totalRequests > 0 ? (errorStats.totalErrors / totalRequests) * 100 : 0;

    // Determine system health
    const systemHealth = determineSystemHealth(
      errorRate,
      queueStats.queued,
      runLatencyStats.p95
    );

    const metrics: DashboardMetrics = {
      runLatency: {
        p50: Math.round(runLatencyStats.p50),
        p95: Math.round(runLatencyStats.p95),
        avg: Math.round(runLatencyStats.avg),
        count: runLatencyStats.count,
      },

      tokenUsage: {
        totalInput: inputTokenStats.sum,
        totalOutput: outputTokenStats.sum,
        avgInputPerRun: Math.round(inputTokenStats.avg),
        avgOutputPerRun: Math.round(outputTokenStats.avg),
        costEstimate: Math.round(costEstimate * 100) / 100, // Round to cents
      },

      runStats: {
        started: runStarted,
        completed: runCompleted,
        failed: runFailed,
        cancelled: runCancelled,
        successRate:
          runStarted > 0 ? Math.round((runCompleted / runStarted) * 100) : 0,
      },

      queueMetrics: {
        currentDepth: queueStats.queued,
        maxDepth: queueStats.maxDepth,
        avgWaitTime: Math.round(
          queueWaitStats.avg || queueStats.averageWaitTime
        ),
        avgRunTime: Math.round(queueStats.averageRunTime),
      },

      errorMetrics: {
        totalErrors: errorStats.totalErrors,
        errorRate: Math.round(errorRate * 100) / 100,
        errorsByType: errorStats.errorsByType,
        retryableErrors: errorStats.retryableErrors,
      },

      systemHealth: (() => {
        const memUsage = getMemoryUsage();
        return {
          status: systemHealth,
          uptime: Date.now() - startTime,
          ...(memUsage !== undefined && { memoryUsage: memUsage }),
        };
      })(),

      timeRange: {
        start: new Date(startTimeRange).toISOString(),
        end: new Date(endTime).toISOString(),
        durationMs: timeRangeMs,
      },
    };

    return NextResponse.json(metrics);
  } catch (error) {
    const appError = classifyError(error);
    const errorTelemetry = createErrorTelemetry(
      appError,
      'observability_dashboard'
    );

    telemetryService.logError(errorTelemetry, {
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/observability/dashboard',
    });

    return NextResponse.json(
      { error: 'Failed to fetch dashboard metrics' },
      { status: 500 }
    );
  }
}

/**
 * Parse time range parameter into milliseconds
 */
function parseTimeRange(timeRange: string): number {
  const ranges: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };

  return ranges[timeRange] ?? ranges['24h'] ?? 24 * 60 * 60 * 1000;
}

/**
 * Determine system health based on key metrics
 */
function determineSystemHealth(
  errorRate: number,
  queueDepth: number,
  p95Latency: number
): 'healthy' | 'degraded' | 'unhealthy' {
  // Unhealthy conditions
  if (errorRate > 10 || queueDepth > 15 || p95Latency > 60000) {
    return 'unhealthy';
  }

  // Degraded conditions
  if (errorRate > 5 || queueDepth > 10 || p95Latency > 30000) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Get memory usage if available
 */
function getMemoryUsage(): number | undefined {
  try {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return Math.round(usage.heapUsed / 1024 / 1024); // MB
    }
  } catch {
    // Ignore errors in browser environment
  }
  return undefined;
}
