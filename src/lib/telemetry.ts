/**
 * Telemetry service for logging errors and metrics
 * Implements requirement 8.2 for audit logging
 */

import { ErrorTelemetry, ErrorType } from './error-handler';

export interface TelemetryEvent {
  type: 'error' | 'metric' | 'audit';
  timestamp: string;
  sessionId?: string;
  threadId?: string;
  userId?: string;
  userAgent?: string;
  ipAddress?: string;
  data: any;
}

export interface ErrorEvent extends TelemetryEvent {
  type: 'error';
  data: ErrorTelemetry & {
    stackTrace?: string;
    requestId?: string;
    endpoint?: string;
  };
}

export interface MetricEvent extends TelemetryEvent {
  type: 'metric';
  data: {
    metricName: string;
    value: number;
    unit?: string;
    tags?: Record<string, string>;
  };
}

export interface AuditEvent extends TelemetryEvent {
  type: 'audit';
  data: {
    action: string;
    resource?: string;
    details?: any;
  };
}

/**
 * In-memory telemetry store for MVP
 * In production, this would send to a proper logging service
 */
class TelemetryService {
  private events: TelemetryEvent[] = [];
  private readonly maxEvents = 10000; // Keep last 10k events in memory

  /**
   * Log an error event
   */
  logError(
    error: ErrorTelemetry,
    context: {
      sessionId?: string | undefined;
      threadId?: string | undefined;
      userId?: string | undefined;
      userAgent?: string | undefined;
      ipAddress?: string | undefined;
      requestId?: string | undefined;
      endpoint?: string | undefined;
      stackTrace?: string | undefined;
    } = {}
  ): void {
    const event: ErrorEvent = {
      type: 'error',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      threadId: context.threadId,
      userId: context.userId,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      data: {
        ...error,
        stackTrace: context.stackTrace,
        requestId: context.requestId,
        endpoint: context.endpoint,
      },
    };

    this.addEvent(event);

    // Also log to console for development
    console.error('Telemetry Error:', {
      errorClass: error.errorClass,
      errorType: error.errorType,
      message: error.message,
      context: context.endpoint || context.sessionId,
    });
  }

  /**
   * Log a metric event
   */
  logMetric(
    metricName: string,
    value: number,
    options: {
      unit?: string;
      tags?: Record<string, string>;
      sessionId?: string;
      threadId?: string;
    } = {}
  ): void {
    const event: MetricEvent = {
      type: 'metric',
      timestamp: new Date().toISOString(),
      sessionId: options.sessionId,
      threadId: options.threadId,
      data: {
        metricName,
        value,
        unit: options.unit,
        tags: options.tags,
      },
    };

    this.addEvent(event);
  }

  /**
   * Log an audit event
   */
  logAudit(
    action: string,
    options: {
      resource?: string;
      details?: any;
      sessionId?: string;
      threadId?: string;
      userId?: string;
      userAgent?: string;
      ipAddress?: string;
    } = {}
  ): void {
    const event: AuditEvent = {
      type: 'audit',
      timestamp: new Date().toISOString(),
      sessionId: options.sessionId,
      threadId: options.threadId,
      userId: options.userId,
      userAgent: options.userAgent,
      ipAddress: options.ipAddress,
      data: {
        action,
        resource: options.resource,
        details: options.details,
      },
    };

    this.addEvent(event);

    // Log audit events to console
    console.log('Audit Event:', {
      action,
      resource: options.resource,
      sessionId: options.sessionId,
      timestamp: event.timestamp,
    });
  }

  /**
   * Get error statistics
   */
  getErrorStats(timeRangeMs: number = 24 * 60 * 60 * 1000): {
    totalErrors: number;
    errorsByType: Record<ErrorType, number>;
    errorsByClass: Record<string, number>;
    retryableErrors: number;
  } {
    const cutoff = new Date(Date.now() - timeRangeMs).toISOString();
    const recentErrors = this.events.filter(
      (event): event is ErrorEvent =>
        event.type === 'error' && event.timestamp >= cutoff
    );

    const errorsByType: Record<ErrorType, number> = {
      [ErrorType.VALIDATION_ERROR]: 0,
      [ErrorType.USER_ERROR]: 0,
      [ErrorType.API_ERROR]: 0,
      [ErrorType.TIMEOUT_ERROR]: 0,
      [ErrorType.SYSTEM_ERROR]: 0,
      [ErrorType.QUEUE_LIMIT_REACHED]: 0,
    };

    const errorsByClass: Record<string, number> = {};
    let retryableErrors = 0;

    recentErrors.forEach(event => {
      const { errorType, errorClass, retryable } = event.data;

      errorsByType[errorType]++;
      errorsByClass[errorClass] = (errorsByClass[errorClass] || 0) + 1;

      if (retryable) {
        retryableErrors++;
      }
    });

    return {
      totalErrors: recentErrors.length,
      errorsByType,
      errorsByClass,
      retryableErrors,
    };
  }

  /**
   * Get metric statistics
   */
  getMetricStats(
    metricName: string,
    timeRangeMs: number = 24 * 60 * 60 * 1000
  ): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
  } {
    const cutoff = new Date(Date.now() - timeRangeMs).toISOString();
    const metricEvents = this.events.filter(
      (event): event is MetricEvent =>
        event.type === 'metric' &&
        event.data.metricName === metricName &&
        event.timestamp >= cutoff
    );

    if (metricEvents.length === 0) {
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0 };
    }

    const values = metricEvents
      .map(event => event.data.value)
      .sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const count = values.length;

    return {
      count,
      sum,
      avg: sum / count,
      min: values[0],
      max: values[count - 1],
      p50: values[Math.floor(count * 0.5)],
      p95: values[Math.floor(count * 0.95)],
    };
  }

  /**
   * Get recent audit events
   */
  getAuditEvents(
    timeRangeMs: number = 24 * 60 * 60 * 1000,
    action?: string
  ): AuditEvent[] {
    const cutoff = new Date(Date.now() - timeRangeMs).toISOString();
    return this.events.filter(
      (event): event is AuditEvent =>
        event.type === 'audit' &&
        event.timestamp >= cutoff &&
        (!action || event.data.action === action)
    );
  }

  /**
   * Clear old events to prevent memory leaks
   */
  private addEvent(event: TelemetryEvent): void {
    this.events.push(event);

    // Keep only the most recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  /**
   * Export events for external logging systems
   */
  exportEvents(timeRangeMs: number = 24 * 60 * 60 * 1000): TelemetryEvent[] {
    const cutoff = new Date(Date.now() - timeRangeMs).toISOString();
    return this.events.filter(event => event.timestamp >= cutoff);
  }

  /**
   * Clear all events (for testing or privacy compliance)
   */
  clearEvents(): void {
    this.events = [];
  }
}

// Singleton instance
export const telemetryService = new TelemetryService();

/**
 * Helper functions for common telemetry operations
 */
export const Telemetry = {
  /**
   * Track file upload events
   */
  trackFileUpload: (
    fileSize: number,
    filename: string,
    sessionId: string,
    success: boolean,
    errorClass?: string
  ) => {
    telemetryService.logAudit('file_upload', {
      resource: 'file',
      details: { fileSize, filename, success, errorClass },
      sessionId,
    });

    telemetryService.logMetric('file_upload_size', fileSize, {
      unit: 'bytes',
      tags: { success: success.toString() },
      sessionId,
    });
  },

  /**
   * Track analysis requests
   */
  trackAnalysisRequest: (
    analysisType: string,
    sessionId: string,
    threadId: string,
    fileId?: string
  ) => {
    telemetryService.logAudit('analysis_request', {
      resource: 'analysis',
      details: { analysisType, fileId },
      sessionId,
      threadId,
    });
  },

  /**
   * Track analysis completion
   */
  trackAnalysisCompletion: (
    analysisType: string,
    durationMs: number,
    sessionId: string,
    threadId: string,
    success: boolean,
    errorClass?: string
  ) => {
    telemetryService.logAudit('analysis_completion', {
      resource: 'analysis',
      details: { analysisType, durationMs, success, errorClass },
      sessionId,
      threadId,
    });

    telemetryService.logMetric('analysis_duration', durationMs, {
      unit: 'ms',
      tags: {
        analysisType,
        success: success.toString(),
        errorClass: errorClass || 'none',
      },
      sessionId,
      threadId,
    });
  },

  /**
   * Track artifact downloads
   */
  trackArtifactDownload: (
    artifactId: string,
    artifactType: string,
    sessionId: string,
    fileSize?: number
  ) => {
    telemetryService.logAudit('artifact_download', {
      resource: 'artifact',
      details: { artifactId, artifactType, fileSize },
      sessionId,
    });

    if (fileSize) {
      telemetryService.logMetric('artifact_download_size', fileSize, {
        unit: 'bytes',
        tags: { artifactType },
        sessionId,
      });
    }
  },

  /**
   * Track session events
   */
  trackSessionEvent: (
    action: 'created' | 'expired' | 'deleted',
    sessionId: string,
    details?: any
  ) => {
    telemetryService.logAudit(`session_${action}`, {
      resource: 'session',
      details,
      sessionId,
    });
  },

  /**
   * Track queue events
   */
  trackQueueEvent: (
    action: 'enqueued' | 'dequeued' | 'timeout',
    queuePosition?: number,
    waitTimeMs?: number,
    sessionId?: string
  ) => {
    telemetryService.logAudit(`queue_${action}`, {
      resource: 'queue',
      details: { queuePosition, waitTimeMs },
      sessionId,
    });

    if (waitTimeMs) {
      telemetryService.logMetric('queue_wait_time', waitTimeMs, {
        unit: 'ms',
        tags: { action },
        sessionId,
      });
    }
  },
};
