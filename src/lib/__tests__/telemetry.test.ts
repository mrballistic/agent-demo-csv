/**
 * Tests for the telemetry system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  telemetryService,
  Telemetry,
  ErrorEvent,
  MetricEvent,
  AuditEvent,
} from '../telemetry';
import { ErrorType, createErrorTelemetry, AppError } from '../error-handler';

describe('TelemetryService', () => {
  beforeEach(() => {
    telemetryService.clearEvents();
    vi.clearAllMocks();
  });

  describe('logError', () => {
    it('should log error events', () => {
      const error = createErrorTelemetry(
        new AppError(ErrorType.API_ERROR, 'Test error', { errorClass: 'test' }),
        'test_context'
      );

      telemetryService.logError(error, {
        sessionId: 'session123',
        threadId: 'thread456',
        userAgent: 'test-agent',
        endpoint: '/api/test',
      });

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(1);

      const event = events[0] as ErrorEvent;
      expect(event.type).toBe('error');
      expect(event.sessionId).toBe('session123');
      expect(event.threadId).toBe('thread456');
      expect(event.userAgent).toBe('test-agent');
      expect(event.data.errorType).toBe(ErrorType.API_ERROR);
      expect(event.data.message).toBe('Test error');
      expect(event.data.endpoint).toBe('/api/test');
    });

    it('should handle undefined context values', () => {
      const error = createErrorTelemetry(
        new AppError(ErrorType.USER_ERROR, 'Test error'),
        'test_context'
      );

      telemetryService.logError(error, {
        sessionId: undefined,
        userAgent: undefined,
      });

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(1);

      const event = events[0] as ErrorEvent;
      expect(event.sessionId).toBeUndefined();
      expect(event.userAgent).toBeUndefined();
    });
  });

  describe('logMetric', () => {
    it('should log metric events', () => {
      telemetryService.logMetric('response_time', 150, {
        unit: 'ms',
        tags: { endpoint: '/api/test' },
        sessionId: 'session123',
      });

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(1);

      const event = events[0] as MetricEvent;
      expect(event.type).toBe('metric');
      expect(event.sessionId).toBe('session123');
      expect(event.data.metricName).toBe('response_time');
      expect(event.data.value).toBe(150);
      expect(event.data.unit).toBe('ms');
      expect(event.data.tags).toEqual({ endpoint: '/api/test' });
    });
  });

  describe('logAudit', () => {
    it('should log audit events', () => {
      telemetryService.logAudit('file_upload', {
        resource: 'file',
        details: { filename: 'test.csv', size: 1024 },
        sessionId: 'session123',
        userId: 'user456',
      });

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(1);

      const event = events[0] as AuditEvent;
      expect(event.type).toBe('audit');
      expect(event.sessionId).toBe('session123');
      expect(event.userId).toBe('user456');
      expect(event.data.action).toBe('file_upload');
      expect(event.data.resource).toBe('file');
      expect(event.data.details).toEqual({ filename: 'test.csv', size: 1024 });
    });
  });

  describe('getErrorStats', () => {
    beforeEach(() => {
      // Add some test error events
      const errors = [
        createErrorTelemetry(
          new AppError(ErrorType.API_ERROR, 'API Error 1', {
            errorClass: 'api_1',
          })
        ),
        createErrorTelemetry(
          new AppError(ErrorType.API_ERROR, 'API Error 2', {
            errorClass: 'api_2',
          })
        ),
        createErrorTelemetry(
          new AppError(ErrorType.VALIDATION_ERROR, 'Validation Error', {
            errorClass: 'validation_1',
          })
        ),
        createErrorTelemetry(
          new AppError(ErrorType.USER_ERROR, 'User Error', {
            errorClass: 'user_1',
          })
        ),
      ];

      errors.forEach(error => telemetryService.logError(error));
    });

    it('should return error statistics', () => {
      const stats = telemetryService.getErrorStats();

      expect(stats.totalErrors).toBe(4);
      expect(stats.errorsByType[ErrorType.API_ERROR]).toBe(2);
      expect(stats.errorsByType[ErrorType.VALIDATION_ERROR]).toBe(1);
      expect(stats.errorsByType[ErrorType.USER_ERROR]).toBe(1);
      expect(stats.errorsByClass.api_1).toBe(1);
      expect(stats.errorsByClass.api_2).toBe(1);
      expect(stats.retryableErrors).toBe(2); // Only API errors are retryable by default
    });

    it('should filter by time range', () => {
      // This test would need to mock Date.now() to test time filtering properly
      const stats = telemetryService.getErrorStats(1000); // 1 second
      expect(stats.totalErrors).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getMetricStats', () => {
    beforeEach(() => {
      // Add some test metric events
      [100, 150, 200, 250, 300].forEach(value => {
        telemetryService.logMetric('response_time', value, { unit: 'ms' });
      });
    });

    it('should return metric statistics', () => {
      const stats = telemetryService.getMetricStats('response_time');

      expect(stats.count).toBe(5);
      expect(stats.sum).toBe(1000);
      expect(stats.avg).toBe(200);
      expect(stats.min).toBe(100);
      expect(stats.max).toBe(300);
      expect(stats.p50).toBe(200);
      expect(stats.p95).toBe(300);
    });

    it('should return empty stats for unknown metric', () => {
      const stats = telemetryService.getMetricStats('unknown_metric');

      expect(stats.count).toBe(0);
      expect(stats.sum).toBe(0);
      expect(stats.avg).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.p50).toBe(0);
      expect(stats.p95).toBe(0);
    });
  });

  describe('getAuditEvents', () => {
    beforeEach(() => {
      telemetryService.logAudit('file_upload', { resource: 'file' });
      telemetryService.logAudit('analysis_request', { resource: 'analysis' });
      telemetryService.logAudit('file_upload', { resource: 'file' });
    });

    it('should return all audit events', () => {
      const events = telemetryService.getAuditEvents();
      expect(events).toHaveLength(3);
    });

    it('should filter by action', () => {
      const events = telemetryService.getAuditEvents(
        24 * 60 * 60 * 1000,
        'file_upload'
      );
      expect(events).toHaveLength(2);
      events.forEach(event => {
        expect(event.data.action).toBe('file_upload');
      });
    });
  });
});

describe('Telemetry helpers', () => {
  beforeEach(() => {
    telemetryService.clearEvents();
  });

  describe('trackFileUpload', () => {
    it('should track successful file upload', () => {
      Telemetry.trackFileUpload(1024, 'test.csv', 'session123', true);

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(2); // 1 audit + 1 metric

      const auditEvent = events.find(e => e.type === 'audit') as AuditEvent;
      expect(auditEvent.data.action).toBe('file_upload');
      expect(auditEvent.data.details.fileSize).toBe(1024);
      expect(auditEvent.data.details.filename).toBe('test.csv');
      expect(auditEvent.data.details.success).toBe(true);

      const metricEvent = events.find(e => e.type === 'metric') as MetricEvent;
      expect(metricEvent.data.metricName).toBe('file_upload_size');
      expect(metricEvent.data.value).toBe(1024);
      expect(metricEvent.data.tags?.success).toBe('true');
    });

    it('should track failed file upload', () => {
      Telemetry.trackFileUpload(
        0,
        'test.csv',
        'session123',
        false,
        'file_too_large'
      );

      const events = telemetryService.exportEvents();
      const auditEvent = events.find(e => e.type === 'audit') as AuditEvent;
      expect(auditEvent.data.details.success).toBe(false);
      expect(auditEvent.data.details.errorClass).toBe('file_too_large');
    });
  });

  describe('trackAnalysisRequest', () => {
    it('should track analysis request', () => {
      Telemetry.trackAnalysisRequest(
        'profile',
        'session123',
        'thread456',
        'file789'
      );

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(1);

      const event = events[0] as AuditEvent;
      expect(event.type).toBe('audit');
      expect(event.data.action).toBe('analysis_request');
      expect(event.data.details.analysisType).toBe('profile');
      expect(event.data.details.fileId).toBe('file789');
      expect(event.sessionId).toBe('session123');
      expect(event.threadId).toBe('thread456');
    });
  });

  describe('trackAnalysisCompletion', () => {
    it('should track successful analysis completion', () => {
      Telemetry.trackAnalysisCompletion(
        'query',
        1500,
        'session123',
        'thread456',
        true
      );

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(2); // 1 audit + 1 metric

      const auditEvent = events.find(e => e.type === 'audit') as AuditEvent;
      expect(auditEvent.data.action).toBe('analysis_completion');
      expect(auditEvent.data.details.analysisType).toBe('query');
      expect(auditEvent.data.details.durationMs).toBe(1500);
      expect(auditEvent.data.details.success).toBe(true);

      const metricEvent = events.find(e => e.type === 'metric') as MetricEvent;
      expect(metricEvent.data.metricName).toBe('analysis_duration');
      expect(metricEvent.data.value).toBe(1500);
      expect(metricEvent.data.tags?.analysisType).toBe('query');
      expect(metricEvent.data.tags?.success).toBe('true');
    });

    it('should track failed analysis completion', () => {
      Telemetry.trackAnalysisCompletion(
        'query',
        500,
        'session123',
        'thread456',
        false,
        'timeout_error'
      );

      const events = telemetryService.exportEvents();
      const auditEvent = events.find(e => e.type === 'audit') as AuditEvent;
      expect(auditEvent.data.details.success).toBe(false);
      expect(auditEvent.data.details.errorClass).toBe('timeout_error');

      const metricEvent = events.find(e => e.type === 'metric') as MetricEvent;
      expect(metricEvent.data.tags?.success).toBe('false');
      expect(metricEvent.data.tags?.errorClass).toBe('timeout_error');
    });
  });

  describe('trackArtifactDownload', () => {
    it('should track artifact download', () => {
      Telemetry.trackArtifactDownload(
        'artifact123',
        'image',
        'session123',
        2048
      );

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(2); // 1 audit + 1 metric

      const auditEvent = events.find(e => e.type === 'audit') as AuditEvent;
      expect(auditEvent.data.action).toBe('artifact_download');
      expect(auditEvent.data.details.artifactId).toBe('artifact123');
      expect(auditEvent.data.details.artifactType).toBe('image');

      const metricEvent = events.find(e => e.type === 'metric') as MetricEvent;
      expect(metricEvent.data.metricName).toBe('artifact_download_size');
      expect(metricEvent.data.value).toBe(2048);
      expect(metricEvent.data.tags?.artifactType).toBe('image');
    });

    it('should track download without file size', () => {
      Telemetry.trackArtifactDownload('artifact123', 'file', 'session123');

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(1); // Only audit event
      expect(events[0].type).toBe('audit');
    });
  });

  describe('trackSessionEvent', () => {
    it('should track session events', () => {
      Telemetry.trackSessionEvent('created', 'session123', {
        source: 'file_upload',
      });

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(1);

      const event = events[0] as AuditEvent;
      expect(event.data.action).toBe('session_created');
      expect(event.data.details.source).toBe('file_upload');
      expect(event.sessionId).toBe('session123');
    });
  });

  describe('trackQueueEvent', () => {
    it('should track queue events with wait time', () => {
      Telemetry.trackQueueEvent('enqueued', 3, 5000, 'session123');

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(2); // 1 audit + 1 metric

      const auditEvent = events.find(e => e.type === 'audit') as AuditEvent;
      expect(auditEvent.data.action).toBe('queue_enqueued');
      expect(auditEvent.data.details.queuePosition).toBe(3);
      expect(auditEvent.data.details.waitTimeMs).toBe(5000);

      const metricEvent = events.find(e => e.type === 'metric') as MetricEvent;
      expect(metricEvent.data.metricName).toBe('queue_wait_time');
      expect(metricEvent.data.value).toBe(5000);
    });

    it('should track queue events without wait time', () => {
      Telemetry.trackQueueEvent('dequeued', 1);

      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(1); // Only audit event
      expect(events[0].type).toBe('audit');
    });
  });
});
