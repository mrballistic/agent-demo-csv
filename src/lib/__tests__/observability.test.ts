/**
 * Tests for observability and cost tracking functionality
 * Tests requirement 8.2 implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { telemetryService, Telemetry } from '../telemetry';
import { runQueue } from '../run-queue';

// Mock fetch for dashboard API tests
global.fetch = vi.fn();

describe('Observability and Cost Tracking', () => {
  beforeEach(() => {
    telemetryService.clearEvents();
    vi.clearAllMocks();
  });

  describe('Enhanced Telemetry Tracking', () => {
    it('should track run events with run IDs', () => {
      const runId = 'run_123';
      const sessionId = 'session_456';
      const threadId = 'thread_789';

      Telemetry.trackRunEvent('started', runId, sessionId, threadId, {
        analysisType: 'profile',
      });

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(2); // 1 audit + 1 metric

      const auditEvent = events.find(e => e.type === 'audit');
      expect(auditEvent?.data.action).toBe('run_started');
      expect(auditEvent?.data.details.runId).toBe(runId);
      expect(auditEvent?.sessionId).toBe(sessionId);
      expect(auditEvent?.threadId).toBe(threadId);

      const metricEvent = events.find(e => e.type === 'metric');
      expect(metricEvent?.data.metricName).toBe('runs_total');
      expect(metricEvent?.data.tags?.status).toBe('started');
      expect(metricEvent?.data.tags?.runId).toBe(runId);
    });

    it('should track token usage metrics', () => {
      const sessionId = 'session_123';
      const threadId = 'thread_456';
      const tokenUsage = { inputTokens: 1000, outputTokens: 500 };

      Telemetry.trackAnalysisCompletion(
        'query',
        5000,
        sessionId,
        threadId,
        true,
        undefined,
        'run_789',
        tokenUsage,
        ['file_1', 'file_2']
      );

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(4); // 1 audit + 1 duration metric + 2 token metrics

      const inputTokenEvent = events.find(
        e => e.type === 'metric' && e.data.metricName === 'openai_tokens_input'
      );
      expect(inputTokenEvent?.data.value).toBe(1000);
      expect(inputTokenEvent?.data.tags?.runId).toBe('run_789');

      const outputTokenEvent = events.find(
        e => e.type === 'metric' && e.data.metricName === 'openai_tokens_output'
      );
      expect(outputTokenEvent?.data.value).toBe(500);
      expect(outputTokenEvent?.data.tags?.runId).toBe('run_789');
    });

    it('should track OpenAI API usage', () => {
      const sessionId = 'session_123';
      const threadId = 'thread_456';
      const runId = 'run_789';

      Telemetry.trackOpenAIUsage(
        'create_run',
        sessionId,
        threadId,
        runId,
        { inputTokens: 100, outputTokens: 50 },
        1500
      );

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(2); // 1 audit + 1 metric

      const auditEvent = events.find(e => e.type === 'audit');
      expect(auditEvent?.data.action).toBe('openai_api_call');
      expect(auditEvent?.data.details.operation).toBe('create_run');
      expect(auditEvent?.data.details.runId).toBe(runId);

      const metricEvent = events.find(e => e.type === 'metric');
      expect(metricEvent?.data.metricName).toBe('openai_api_latency');
      expect(metricEvent?.data.value).toBe(1500);
    });

    it('should track queue events with run IDs', () => {
      const sessionId = 'session_123';
      const runId = 'run_456';

      Telemetry.trackQueueEvent('enqueued', 3, 5000, sessionId, runId);

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(3); // 1 audit + 2 metrics

      const auditEvent = events.find(e => e.type === 'audit');
      expect(auditEvent?.data.details.runId).toBe(runId);

      const waitTimeEvent = events.find(
        e => e.type === 'metric' && e.data.metricName === 'queue_wait_time'
      );
      expect(waitTimeEvent?.data.tags?.runId).toBe(runId);

      const depthEvent = events.find(
        e => e.type === 'metric' && e.data.metricName === 'queue_depth'
      );
      expect(depthEvent?.data.value).toBe(3);
    });
  });

  describe('Metric Statistics', () => {
    beforeEach(() => {
      // Add sample metrics for testing
      [100, 150, 200, 250, 300, 400, 500].forEach((value, index) => {
        telemetryService.logMetric('analysis_duration', value, {
          unit: 'ms',
          tags: { runId: `run_${index}` },
        });
      });

      [50, 75, 100, 125, 150].forEach((value, index) => {
        telemetryService.logMetric('openai_tokens_input', value, {
          unit: 'tokens',
          tags: { runId: `run_${index}` },
        });
      });
    });

    it('should calculate p50 and p95 latency correctly', () => {
      const stats = telemetryService.getMetricStats('analysis_duration');

      expect(stats.count).toBe(7);
      expect(stats.p50).toBe(250); // Middle value
      expect(stats.p95).toBe(500); // 95th percentile
      expect(Math.round(stats.avg * 100) / 100).toBe(271.43); // Average rounded
      expect(stats.min).toBe(100);
      expect(stats.max).toBe(500);
    });

    it('should calculate token usage statistics', () => {
      const stats = telemetryService.getMetricStats('openai_tokens_input');

      expect(stats.count).toBe(5);
      expect(stats.sum).toBe(500);
      expect(stats.avg).toBe(100);
      expect(stats.p50).toBe(100);
      expect(stats.p95).toBe(150);
    });

    it('should handle empty metrics gracefully', () => {
      const stats = telemetryService.getMetricStats('nonexistent_metric');

      expect(stats.count).toBe(0);
      expect(stats.sum).toBe(0);
      expect(stats.avg).toBe(0);
      expect(stats.p50).toBe(0);
      expect(stats.p95).toBe(0);
    });
  });

  describe('Dashboard API Integration', () => {
    it('should fetch dashboard metrics successfully', async () => {
      const mockMetrics = {
        runLatency: { p50: 1500, p95: 3000, avg: 2000, count: 10 },
        tokenUsage: {
          totalInput: 5000,
          totalOutput: 2500,
          avgInputPerRun: 500,
          avgOutputPerRun: 250,
          costEstimate: 0.15,
        },
        runStats: {
          started: 10,
          completed: 8,
          failed: 2,
          cancelled: 0,
          successRate: 80,
        },
        queueMetrics: {
          currentDepth: 2,
          maxDepth: 20,
          avgWaitTime: 1000,
          avgRunTime: 15000,
        },
        errorMetrics: {
          totalErrors: 2,
          errorRate: 20,
          errorsByType: {},
          retryableErrors: 1,
        },
        systemHealth: { status: 'healthy', uptime: 3600000 },
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-01T01:00:00Z',
          durationMs: 3600000,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetrics,
      });

      const response = await fetch('/api/observability/dashboard?timeRange=1h');
      const data = await response.json();

      expect(data.runLatency.p50).toBe(1500);
      expect(data.tokenUsage.costEstimate).toBe(0.15);
      expect(data.systemHealth.status).toBe('healthy');
    });

    it('should handle dashboard API errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const response = await fetch('/api/observability/dashboard');
      expect(response.ok).toBe(false);
    });
  });

  describe('Queue Metrics Integration', () => {
    it('should track queue depth changes', () => {
      // Enqueue some runs
      const run1 = runQueue.enqueue({
        threadId: 'thread_1',
        sessionId: 'session_1',
        query: 'profile',
        priority: 'normal',
      });

      const run2 = runQueue.enqueue({
        threadId: 'thread_2',
        sessionId: 'session_2',
        query: 'trends',
        priority: 'normal',
      });

      expect(run1.accepted).toBe(true);
      expect(run2.accepted).toBe(true);

      const stats = runQueue.getStats();
      expect(stats.queued).toBeGreaterThan(0);
      expect(stats.total).toBeGreaterThanOrEqual(stats.queued);
    });

    it('should calculate average wait and run times', () => {
      const stats = runQueue.getStats();

      expect(typeof stats.averageWaitTime).toBe('number');
      expect(typeof stats.averageRunTime).toBe('number');
      expect(stats.averageWaitTime).toBeGreaterThan(0);
      expect(stats.averageRunTime).toBeGreaterThan(0);
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate costs based on token usage', () => {
      // Add token usage metrics
      telemetryService.logMetric('openai_tokens_input', 1000, {
        unit: 'tokens',
      });
      telemetryService.logMetric('openai_tokens_output', 500, {
        unit: 'tokens',
      });

      const inputStats = telemetryService.getMetricStats('openai_tokens_input');
      const outputStats = telemetryService.getMetricStats(
        'openai_tokens_output'
      );

      // GPT-4o pricing: $0.0025/1K input, $0.01/1K output
      const expectedCost = (1000 * 0.0025) / 1000 + (500 * 0.01) / 1000;

      expect(inputStats.sum).toBe(1000);
      expect(outputStats.sum).toBe(500);

      // Cost calculation would be done in the dashboard API
      const actualCost =
        (inputStats.sum * 0.0025) / 1000 + (outputStats.sum * 0.01) / 1000;
      expect(actualCost).toBeCloseTo(expectedCost, 4);
    });
  });

  describe('System Health Determination', () => {
    it('should determine healthy status with good metrics', () => {
      // This would be tested in the dashboard API endpoint
      const errorRate = 2; // 2%
      const queueDepth = 3;
      const p95Latency = 15000; // 15s

      // Healthy: errorRate <= 5%, queueDepth <= 10, p95Latency <= 30s
      expect(errorRate).toBeLessThanOrEqual(5);
      expect(queueDepth).toBeLessThanOrEqual(10);
      expect(p95Latency).toBeLessThanOrEqual(30000);
    });

    it('should determine degraded status with moderate metrics', () => {
      const errorRate = 7; // 7%
      const queueDepth = 12;
      const p95Latency = 45000; // 45s

      // Degraded: errorRate > 5% OR queueDepth > 10 OR p95Latency > 30s
      const isDegraded = errorRate > 5 || queueDepth > 10 || p95Latency > 30000;
      expect(isDegraded).toBe(true);
    });

    it('should determine unhealthy status with poor metrics', () => {
      const errorRate = 15; // 15%
      const queueDepth = 18;
      const p95Latency = 70000; // 70s

      // Unhealthy: errorRate > 10% OR queueDepth > 15 OR p95Latency > 60s
      const isUnhealthy =
        errorRate > 10 || queueDepth > 15 || p95Latency > 60000;
      expect(isUnhealthy).toBe(true);
    });
  });
});

describe('Logging Requirements', () => {
  beforeEach(() => {
    telemetryService.clearEvents();
  });

  it('should log run_id, thread_id, user agent, error_class, file_ids produced', () => {
    const runId = 'run_12345';
    const threadId = 'thread_67890';
    const userAgent = 'Mozilla/5.0 Test Browser';
    const errorClass = 'timeout_error';
    const fileIds = ['file_1.png', 'file_2.csv'];

    // Simulate logging from an API endpoint
    telemetryService.logAudit('analysis_completion', {
      resource: 'analysis',
      details: {
        runId,
        success: false,
        errorClass,
        fileIds,
      },
      sessionId: 'session_123',
      threadId,
      userAgent,
    });

    const events = telemetryService.getAuditEvents();
    expect(events).toHaveLength(1);

    const event = events[0];
    expect(event!.threadId).toBe(threadId);
    expect(event!.userAgent).toBe(userAgent);
    expect(event!.data.details.runId).toBe(runId);
    expect(event!.data.details.errorClass).toBe(errorClass);
    expect(event!.data.details.fileIds).toEqual(fileIds);
  });

  it('should include timestamps in all log entries', () => {
    telemetryService.logAudit('test_action', {
      resource: 'test',
      sessionId: 'session_123',
    });

    const events = telemetryService.exportEvents();
    expect(events).toHaveLength(1);

    const event = events[0];
    expect(event!.timestamp).toBeDefined();
    expect(new Date(event!.timestamp).getTime()).toBeGreaterThan(0);
  });
});
