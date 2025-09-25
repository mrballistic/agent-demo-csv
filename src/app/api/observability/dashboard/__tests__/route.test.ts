/**
 * Tests for the observability dashboard API endpoint
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { telemetryService } from '@/lib/telemetry';
import { runQueue } from '@/lib/run-queue';

// Mock the dependencies
vi.mock('@/lib/telemetry');
vi.mock('@/lib/run-queue');

describe('/api/observability/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock telemetry service methods
    vi.mocked(telemetryService.getMetricStats).mockImplementation(
      (metricName: string) => {
        const mockStats = {
          analysis_duration: {
            count: 10,
            sum: 25000,
            avg: 2500,
            min: 1000,
            max: 5000,
            p50: 2000,
            p95: 4500,
          },
          openai_tokens_input: {
            count: 10,
            sum: 5000,
            avg: 500,
            min: 100,
            max: 1000,
            p50: 450,
            p95: 900,
          },
          openai_tokens_output: {
            count: 10,
            sum: 2500,
            avg: 250,
            min: 50,
            max: 500,
            p50: 225,
            p95: 450,
          },
          queue_wait_time: {
            count: 8,
            sum: 8000,
            avg: 1000,
            min: 500,
            max: 2000,
            p50: 900,
            p95: 1800,
          },
        };

        return (
          mockStats[metricName as keyof typeof mockStats] || {
            count: 0,
            sum: 0,
            avg: 0,
            min: 0,
            max: 0,
            p50: 0,
            p95: 0,
          }
        );
      }
    );

    vi.mocked(telemetryService.getAuditEvents).mockReturnValue([
      {
        type: 'audit',
        timestamp: '2024-01-01T12:00:00Z',
        sessionId: 'session_1',
        threadId: 'thread_1',
        data: { action: 'analysis_request', resource: 'analysis' },
      },
      {
        type: 'audit',
        timestamp: '2024-01-01T12:01:00Z',
        sessionId: 'session_1',
        threadId: 'thread_1',
        data: {
          action: 'analysis_completion',
          resource: 'analysis',
          details: { success: true },
        },
      },
      {
        type: 'audit',
        timestamp: '2024-01-01T12:02:00Z',
        sessionId: 'session_2',
        threadId: 'thread_2',
        data: {
          action: 'analysis_completion',
          resource: 'analysis',
          details: { success: false },
        },
      },
    ] as any);

    vi.mocked(telemetryService.getErrorStats).mockReturnValue({
      totalErrors: 3,
      errorsByType: {
        VALIDATION_ERROR: 1,
        API_ERROR: 1,
        TIMEOUT_ERROR: 1,
        USER_ERROR: 0,
        SYSTEM_ERROR: 0,
        QUEUE_LIMIT_REACHED: 0,
      },
      errorsByClass: {
        file_validation: 1,
        openai_timeout: 1,
        api_error: 1,
      },
      retryableErrors: 2,
    });

    vi.mocked(runQueue.getStats).mockReturnValue({
      total: 15,
      queued: 3,
      running: 2,
      completed: 8,
      failed: 2,
      cancelled: 0,
      maxDepth: 20,
      averageWaitTime: 1200,
      averageRunTime: 18000,
    });
  });

  it('should return dashboard metrics with default time range', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/observability/dashboard'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);

    const data = await response.json();

    // Check run latency metrics
    expect(data.runLatency).toEqual({
      p50: 2000,
      p95: 4500,
      avg: 2500,
      count: 10,
    });

    // Check token usage and cost estimation
    expect(data.tokenUsage).toEqual({
      totalInput: 5000,
      totalOutput: 2500,
      avgInputPerRun: 500,
      avgOutputPerRun: 250,
      costEstimate: 0.04, // (5000 * 0.0025 + 2500 * 0.01) / 1000
    });

    // Check run statistics
    expect(data.runStats).toEqual({
      started: 1, // Only analysis_request events
      completed: 1, // Only successful analysis_completion events
      failed: 1, // Only failed analysis_completion events
      cancelled: 0,
      successRate: 100, // 1 completed out of 1 started
    });

    // Check queue metrics
    expect(data.queueMetrics).toEqual({
      currentDepth: 3,
      maxDepth: 20,
      avgWaitTime: 1000, // From telemetry stats
      avgRunTime: 18000, // From queue stats
    });

    // Check error metrics
    expect(data.errorMetrics).toEqual({
      totalErrors: 3,
      errorRate: 300, // 3 errors / 1 request * 100
      errorsByType: expect.any(Object),
      retryableErrors: 2,
    });

    // Check system health
    expect(data.systemHealth.status).toBe('unhealthy'); // High error rate
    expect(data.systemHealth.uptime).toBeGreaterThan(0);

    // Check time range
    expect(data.timeRange).toEqual({
      start: expect.any(String),
      end: expect.any(String),
      durationMs: 24 * 60 * 60 * 1000, // 24 hours default
    });
  });

  it('should handle custom time range parameter', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/observability/dashboard?timeRange=1h'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.timeRange.durationMs).toBe(60 * 60 * 1000); // 1 hour
  });

  it('should handle invalid time range parameter', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/observability/dashboard?timeRange=invalid'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.timeRange.durationMs).toBe(24 * 60 * 60 * 1000); // Default to 24h
  });

  it('should determine system health correctly', async () => {
    // Test healthy status
    vi.mocked(telemetryService.getErrorStats).mockReturnValue({
      totalErrors: 1,
      errorsByType: {} as any,
      errorsByClass: {},
      retryableErrors: 0,
    });

    vi.mocked(runQueue.getStats).mockReturnValue({
      total: 10,
      queued: 2,
      running: 1,
      completed: 7,
      failed: 0,
      cancelled: 0,
      maxDepth: 20,
      averageWaitTime: 1000,
      averageRunTime: 15000,
    });

    vi.mocked(telemetryService.getMetricStats).mockImplementation(
      (metricName: string) => {
        if (metricName === 'analysis_duration') {
          return {
            count: 10,
            sum: 150000,
            avg: 15000,
            min: 10000,
            max: 20000,
            p50: 15000,
            p95: 18000, // Under 30s threshold
          };
        }
        return { count: 0, sum: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0 };
      }
    );

    const request = new NextRequest(
      'http://localhost:3000/api/observability/dashboard'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(data.systemHealth.status).toBe('healthy');
  });

  it('should determine degraded status with moderate metrics', async () => {
    // Test degraded status (error rate between 5-10%)
    vi.mocked(telemetryService.getAuditEvents).mockReturnValue([
      ...Array(20)
        .fill(null)
        .map((_, i) => ({
          type: 'audit',
          timestamp: '2024-01-01T12:00:00Z',
          data: { action: 'analysis_request' },
        })),
      ...Array(18)
        .fill(null)
        .map((_, i) => ({
          type: 'audit',
          timestamp: '2024-01-01T12:00:00Z',
          data: { action: 'analysis_completion', details: { success: true } },
        })),
      ...Array(2)
        .fill(null)
        .map((_, i) => ({
          type: 'audit',
          timestamp: '2024-01-01T12:00:00Z',
          data: { action: 'analysis_completion', details: { success: false } },
        })),
    ] as any);

    vi.mocked(telemetryService.getErrorStats).mockReturnValue({
      totalErrors: 2,
      errorsByType: {} as any,
      errorsByClass: {},
      retryableErrors: 1,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/observability/dashboard'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(data.systemHealth.status).toBe('degraded');
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(telemetryService.getMetricStats).mockImplementation(() => {
      throw new Error('Telemetry service error');
    });

    const request = new NextRequest(
      'http://localhost:3000/api/observability/dashboard'
    );
    const response = await GET(request);

    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe('Failed to fetch dashboard metrics');
  });

  it('should calculate cost estimation correctly', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/observability/dashboard'
    );
    const response = await GET(request);
    const data = await response.json();

    // Expected cost: (5000 * 0.0025 + 2500 * 0.01) / 1000 = 0.0375
    // Rounded to cents: 0.04
    expect(data.tokenUsage.costEstimate).toBe(0.04);
  });

  it('should include memory usage when available', async () => {
    // Mock process.memoryUsage
    const originalProcess = global.process;
    global.process = {
      ...originalProcess,
      memoryUsage: () => ({
        rss: 100 * 1024 * 1024,
        heapTotal: 80 * 1024 * 1024,
        heapUsed: 60 * 1024 * 1024, // 60MB
        external: 5 * 1024 * 1024,
        arrayBuffers: 2 * 1024 * 1024,
      }),
    } as any;

    const request = new NextRequest(
      'http://localhost:3000/api/observability/dashboard'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(data.systemHealth.memoryUsage).toBe(60); // 60MB

    global.process = originalProcess;
  });
});
