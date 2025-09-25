/**
 * Centralized error handling system for the AI Data Analyst Demo
 * Implements error taxonomy, retry logic, and user-friendly error messages
 */

export enum ErrorType {
  VALIDATION_ERROR = 'validation_error',
  USER_ERROR = 'user_error',
  API_ERROR = 'api_error',
  TIMEOUT_ERROR = 'timeout_error',
  SYSTEM_ERROR = 'system_error',
  QUEUE_LIMIT_REACHED = 'queue_limit_reached',
}

export interface ErrorResponse {
  type: ErrorType;
  message: string;
  details?: any;
  suggestedAction?: string | undefined;
  retryable: boolean;
  errorClass?: string | undefined; // For telemetry
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: ErrorType[];
}

export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly retryable: boolean;
  public readonly suggestedAction?: string | undefined;
  public readonly errorClass: string;
  public readonly details?: any;
  public readonly cause?: Error;

  constructor(
    type: ErrorType,
    message: string,
    options: {
      retryable?: boolean;
      suggestedAction?: string;
      errorClass?: string;
      details?: any;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.retryable = options.retryable ?? this.getDefaultRetryable(type);
    if (options.suggestedAction !== undefined) {
      this.suggestedAction = options.suggestedAction;
    }
    this.errorClass = options.errorClass ?? type;
    this.details = options.details;

    if (options.cause) {
      this.cause = options.cause;
    }
  }

  private getDefaultRetryable(type: ErrorType): boolean {
    switch (type) {
      case ErrorType.VALIDATION_ERROR:
      case ErrorType.USER_ERROR:
        return false;
      case ErrorType.API_ERROR:
      case ErrorType.TIMEOUT_ERROR:
      case ErrorType.SYSTEM_ERROR:
      case ErrorType.QUEUE_LIMIT_REACHED:
        return true;
      default:
        return false;
    }
  }

  toErrorResponse(): ErrorResponse {
    return {
      type: this.type,
      message: this.message,
      details: this.details,
      suggestedAction: this.suggestedAction,
      retryable: this.retryable,
      errorClass: this.errorClass,
    };
  }
}

/**
 * Error factory functions for common error scenarios
 */
export const ErrorFactory = {
  // File validation errors
  fileTooLarge: (size: number) =>
    new AppError(
      ErrorType.VALIDATION_ERROR,
      `File size exceeds 50MB limit. Current size: ${Math.round(size / 1024 / 1024)}MB`,
      {
        suggestedAction: 'Please upload a smaller CSV file',
        errorClass: 'file_too_large',
        details: { fileSize: size, maxSize: 50 * 1024 * 1024 },
      }
    ),

  invalidFileFormat: (filename: string) =>
    new AppError(ErrorType.VALIDATION_ERROR, 'File must be in CSV format', {
      suggestedAction: 'Please upload a valid CSV file',
      errorClass: 'invalid_file_format',
      details: { filename, expectedFormat: 'csv' },
    }),

  emptyFile: () =>
    new AppError(ErrorType.VALIDATION_ERROR, 'File appears to be empty', {
      suggestedAction: 'Please upload a CSV file with data',
      errorClass: 'empty_file',
    }),

  // OpenAI API errors
  openaiRateLimit: (retryAfter?: number) =>
    new AppError(ErrorType.API_ERROR, 'OpenAI API rate limit exceeded', {
      suggestedAction: retryAfter
        ? `Please wait ${retryAfter} seconds and try again`
        : 'Please wait a few minutes and try again',
      errorClass: 'openai_rate_limit',
      details: { retryAfter },
    }),

  openaiQuotaExceeded: () =>
    new AppError(ErrorType.API_ERROR, 'OpenAI quota exceeded', {
      retryable: false,
      suggestedAction: 'Contact support if this persists',
      errorClass: 'openai_quota_exceeded',
    }),

  openaiTimeout: () =>
    new AppError(ErrorType.TIMEOUT_ERROR, 'Analysis timed out', {
      suggestedAction: 'Try with a smaller dataset or simpler query',
      errorClass: 'openai_timeout',
    }),

  openaiServerError: (statusCode?: number) =>
    new AppError(
      ErrorType.API_ERROR,
      'OpenAI service temporarily unavailable',
      {
        suggestedAction: 'Please try again in a few moments',
        errorClass: 'openai_server_error',
        details: { statusCode },
      }
    ),

  openaiInvalidRequest: (message: string) =>
    new AppError(ErrorType.USER_ERROR, `Invalid request: ${message}`, {
      retryable: false,
      suggestedAction: 'Check your request format and try again',
      errorClass: 'openai_invalid_request',
      details: { originalMessage: message },
    }),

  openaiAuthenticationError: () =>
    new AppError(ErrorType.SYSTEM_ERROR, 'OpenAI authentication failed', {
      retryable: false,
      suggestedAction: 'Contact support - API key configuration issue',
      errorClass: 'openai_auth_error',
    }),

  // Analysis errors
  missingColumns: (missingColumns: string[]) =>
    new AppError(
      ErrorType.USER_ERROR,
      `Required columns missing: ${missingColumns.join(', ')}`,
      {
        suggestedAction: 'Use column mapping to identify the correct fields',
        errorClass: 'missing_columns',
        details: { missingColumns },
      }
    ),

  analysisTimeout: (timeoutMs: number) =>
    new AppError(
      ErrorType.TIMEOUT_ERROR,
      `Analysis timed out after ${timeoutMs / 1000} seconds`,
      {
        suggestedAction: 'Try with a smaller dataset or simpler query',
        errorClass: 'analysis_timeout',
        details: { timeoutMs },
      }
    ),

  // Queue management errors
  queueLimitReached: (queuePosition: number, estimatedWaitTime: number) =>
    new AppError(
      ErrorType.QUEUE_LIMIT_REACHED,
      'Too many concurrent analyses. You are queued.',
      {
        suggestedAction: 'Wait for your turn or cancel other running analyses',
        errorClass: 'queue_limit_reached',
        details: { queuePosition, estimatedWaitTime },
      }
    ),

  // Session errors
  sessionNotFound: () =>
    new AppError(ErrorType.USER_ERROR, 'Session not found or expired', {
      retryable: false,
      suggestedAction: 'Please upload a file to start a new session',
      errorClass: 'session_not_found',
    }),

  // Generic system errors
  systemError: (message: string, cause?: Error) =>
    new AppError(
      ErrorType.SYSTEM_ERROR,
      message || 'An unexpected system error occurred',
      {
        suggestedAction: 'Please try again or contact support if this persists',
        errorClass: 'system_error',
        ...(cause && { cause }),
      }
    ),
};

/**
 * Retry utility with exponential backoff
 */
export class RetryHandler {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      retryableErrors: [
        ErrorType.API_ERROR,
        ErrorType.TIMEOUT_ERROR,
        ErrorType.SYSTEM_ERROR,
      ],
      ...config,
    };
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on the last attempt
        if (attempt > this.config.maxRetries) {
          break;
        }

        // Check if error is retryable
        if (!this.isRetryable(error)) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const baseDelay = this.config.baseDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
        const delay = Math.min(baseDelay + jitter, this.config.maxDelayMs);

        console.warn(
          `Retry attempt ${attempt}/${this.config.maxRetries} for ${context || 'operation'} after ${delay}ms delay:`,
          error
        );

        await this.delay(delay);
      }
    }

    // If we get here, all retries failed
    throw this.enhanceErrorForRetryFailure(lastError!, this.config.maxRetries);
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof AppError) {
      return (
        error.retryable && this.config.retryableErrors.includes(error.type)
      );
    }

    // Check for specific OpenAI error patterns
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Rate limit errors are retryable
      if (message.includes('rate limit') || message.includes('429')) {
        return true;
      }

      // Timeout errors are retryable
      if (message.includes('timeout') || message.includes('timed out')) {
        return true;
      }

      // Network errors are retryable
      if (
        message.includes('network') ||
        message.includes('connection') ||
        message.includes('econnreset')
      ) {
        return true;
      }

      // Server errors (5xx) are retryable
      if (
        message.includes('500') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504')
      ) {
        return true;
      }

      // Specific OpenAI error codes that are retryable
      if (
        message.includes('server_error') ||
        message.includes('service_unavailable')
      ) {
        return true;
      }

      // Non-retryable errors
      if (
        message.includes('401') || // Unauthorized
        message.includes('403') || // Forbidden
        message.includes('400') || // Bad request
        message.includes('invalid api key') ||
        message.includes('quota') ||
        message.includes('insufficient_quota')
      ) {
        return false;
      }
    }

    return false;
  }

  private enhanceErrorForRetryFailure(error: Error, maxRetries: number): Error {
    if (error instanceof AppError) {
      return new AppError(
        error.type,
        `${error.message} (failed after ${maxRetries} retries)`,
        {
          retryable: false, // Don't retry again
          ...(error.suggestedAction && {
            suggestedAction: error.suggestedAction,
          }),
          errorClass: `${error.errorClass}_retry_exhausted`,
          details: { ...error.details, maxRetries },
          cause: error,
        }
      );
    }

    return new AppError(
      ErrorType.SYSTEM_ERROR,
      `Operation failed after ${maxRetries} retries: ${error.message}`,
      {
        retryable: false,
        errorClass: 'retry_exhausted',
        details: { maxRetries },
        cause: error,
      }
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Error classifier for unknown errors
 */
export function classifyError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // OpenAI specific errors with enhanced pattern matching
    if (message.includes('rate limit') || message.includes('429')) {
      // Try to extract retry-after from message
      const retryMatch = message.match(/retry.*?(\d+)/);
      const retryAfter = retryMatch
        ? parseInt(retryMatch[1] || '', 10)
        : undefined;
      return ErrorFactory.openaiRateLimit(retryAfter);
    }

    if (message.includes('quota') || message.includes('insufficient_quota')) {
      return ErrorFactory.openaiQuotaExceeded();
    }

    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorFactory.openaiTimeout();
    }

    // Server errors (5xx)
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504')
    ) {
      const statusMatch = message.match(/(\d{3})/);
      const statusCode = statusMatch
        ? parseInt(statusMatch[1] || '', 10)
        : undefined;
      return ErrorFactory.openaiServerError(statusCode);
    }

    // Authentication errors
    if (
      message.includes('unauthorized') ||
      message.includes('401') ||
      message.includes('invalid api key')
    ) {
      return ErrorFactory.openaiAuthenticationError();
    }

    // Invalid request errors
    if (
      message.includes('400') ||
      message.includes('bad request') ||
      message.includes('invalid request')
    ) {
      return ErrorFactory.openaiInvalidRequest(error.message);
    }

    // File validation errors
    if (message.includes('file size') || message.includes('too large')) {
      return ErrorFactory.fileTooLarge(0); // Size unknown
    }

    if (message.includes('csv') || message.includes('format')) {
      return ErrorFactory.invalidFileFormat('unknown');
    }

    // Missing columns
    if (
      message.includes('missing columns') ||
      message.includes('required columns')
    ) {
      return ErrorFactory.missingColumns(['unknown']);
    }

    // Session errors
    if (message.includes('session') && message.includes('not found')) {
      return ErrorFactory.sessionNotFound();
    }

    // Network errors
    if (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('econnreset')
    ) {
      return ErrorFactory.systemError('Network connection error', error);
    }

    // Default to system error
    return ErrorFactory.systemError(error.message, error);
  }

  // Unknown error type
  return ErrorFactory.systemError('An unknown error occurred');
}

/**
 * Telemetry helper for error logging
 */
export interface ErrorTelemetry {
  errorClass: string;
  errorType: ErrorType;
  message: string;
  retryable: boolean;
  timestamp: string;
  context?: string | undefined;
  details?: any;
}

export function createErrorTelemetry(
  error: AppError,
  context?: string
): ErrorTelemetry {
  return {
    errorClass: error.errorClass,
    errorType: error.type,
    message: error.message,
    retryable: error.retryable,
    timestamp: new Date().toISOString(),
    context,
    details: error.details,
  };
}

/**
 * Default retry handler instance
 */
export const defaultRetryHandler = new RetryHandler();
