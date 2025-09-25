/**
 * Tests for the error handling system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AppError,
  ErrorFactory,
  ErrorType,
  RetryHandler,
  classifyError,
  createErrorTelemetry,
  defaultRetryHandler,
} from '../error-handler';

describe('AppError', () => {
  it('should create error with correct properties', () => {
    const error = new AppError(
      ErrorType.VALIDATION_ERROR,
      'Test error message',
      {
        retryable: false,
        suggestedAction: 'Fix the issue',
        errorClass: 'test_error',
        details: { field: 'value' },
      }
    );

    expect(error.type).toBe(ErrorType.VALIDATION_ERROR);
    expect(error.message).toBe('Test error message');
    expect(error.retryable).toBe(false);
    expect(error.suggestedAction).toBe('Fix the issue');
    expect(error.errorClass).toBe('test_error');
    expect(error.details).toEqual({ field: 'value' });
  });

  it('should use default retryable based on error type', () => {
    const validationError = new AppError(ErrorType.VALIDATION_ERROR, 'Test');
    const apiError = new AppError(ErrorType.API_ERROR, 'Test');

    expect(validationError.retryable).toBe(false);
    expect(apiError.retryable).toBe(true);
  });

  it('should convert to error response', () => {
    const error = new AppError(ErrorType.USER_ERROR, 'User error', {
      suggestedAction: 'Try again',
      errorClass: 'user_mistake',
    });

    const response = error.toErrorResponse();

    expect(response).toEqual({
      type: ErrorType.USER_ERROR,
      message: 'User error',
      suggestedAction: 'Try again',
      retryable: false,
      errorClass: 'user_mistake',
      details: undefined,
    });
  });
});

describe('ErrorFactory', () => {
  it('should create file too large error', () => {
    const error = ErrorFactory.fileTooLarge(100 * 1024 * 1024);

    expect(error.type).toBe(ErrorType.VALIDATION_ERROR);
    expect(error.message).toContain('50MB limit');
    expect(error.message).toContain('100MB');
    expect(error.retryable).toBe(false);
    expect(error.errorClass).toBe('file_too_large');
  });

  it('should create OpenAI rate limit error', () => {
    const error = ErrorFactory.openaiRateLimit(60);

    expect(error.type).toBe(ErrorType.API_ERROR);
    expect(error.message).toContain('rate limit');
    expect(error.suggestedAction).toContain('60 seconds');
    expect(error.retryable).toBe(true);
    expect(error.errorClass).toBe('openai_rate_limit');
    expect(error.details).toEqual({ retryAfter: 60 });
  });

  it('should create OpenAI server error', () => {
    const error = ErrorFactory.openaiServerError(503);

    expect(error.type).toBe(ErrorType.API_ERROR);
    expect(error.message).toContain('temporarily unavailable');
    expect(error.retryable).toBe(true);
    expect(error.errorClass).toBe('openai_server_error');
    expect(error.details).toEqual({ statusCode: 503 });
  });

  it('should create OpenAI authentication error', () => {
    const error = ErrorFactory.openaiAuthenticationError();

    expect(error.type).toBe(ErrorType.SYSTEM_ERROR);
    expect(error.message).toContain('authentication failed');
    expect(error.retryable).toBe(false);
    expect(error.errorClass).toBe('openai_auth_error');
  });

  it('should create missing columns error', () => {
    const error = ErrorFactory.missingColumns(['price', 'quantity']);

    expect(error.type).toBe(ErrorType.USER_ERROR);
    expect(error.message).toContain('price, quantity');
    expect(error.suggestedAction).toContain('column mapping');
    expect(error.details).toEqual({ missingColumns: ['price', 'quantity'] });
  });

  it('should create queue limit reached error', () => {
    const error = ErrorFactory.queueLimitReached(5, 120);

    expect(error.type).toBe(ErrorType.QUEUE_LIMIT_REACHED);
    expect(error.message).toContain('queued');
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({ queuePosition: 5, estimatedWaitTime: 120 });
  });
});

describe('RetryHandler', () => {
  let retryHandler: RetryHandler;

  beforeEach(() => {
    retryHandler = new RetryHandler({
      maxRetries: 2,
      baseDelayMs: 100,
      maxDelayMs: 1000,
    });
  });

  it('should succeed on first attempt', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const result = await retryHandler.executeWithRetry(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValue('success');

    const result = await retryHandler.executeWithRetry(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-retryable errors', async () => {
    const validationError = new AppError(
      ErrorType.VALIDATION_ERROR,
      'Invalid input',
      { retryable: false }
    );
    const operation = vi.fn().mockRejectedValue(validationError);

    try {
      await retryHandler.executeWithRetry(operation);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.type).toBe(ErrorType.VALIDATION_ERROR);
      expect(appError.message).toContain('Invalid input');
    }
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should fail after max retries', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('timeout'));

    await expect(retryHandler.executeWithRetry(operation)).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('should enhance error after retry exhaustion', async () => {
    const originalError = new AppError(ErrorType.API_ERROR, 'API failed', {
      errorClass: 'api_failure',
    });
    const operation = vi.fn().mockRejectedValue(originalError);

    try {
      await retryHandler.executeWithRetry(operation);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.message).toContain('failed after 2 retries');
      expect(appError.errorClass).toBe('api_failure_retry_exhausted');
      expect(appError.retryable).toBe(false);
    }
  });
});

describe('classifyError', () => {
  it('should return AppError as-is', () => {
    const appError = new AppError(ErrorType.USER_ERROR, 'Test');
    const result = classifyError(appError);

    expect(result).toBe(appError);
  });

  it('should classify rate limit errors', () => {
    const error = new Error('Rate limit exceeded (429)');
    const result = classifyError(error);

    expect(result.type).toBe(ErrorType.API_ERROR);
    expect(result.errorClass).toBe('openai_rate_limit');
  });

  it('should classify server errors', () => {
    const error = new Error('Server error (503)');
    const result = classifyError(error);

    expect(result.type).toBe(ErrorType.API_ERROR);
    expect(result.errorClass).toBe('openai_server_error');
  });

  it('should classify authentication errors', () => {
    const error = new Error('Unauthorized (401)');
    const result = classifyError(error);

    expect(result.type).toBe(ErrorType.SYSTEM_ERROR);
    expect(result.errorClass).toBe('openai_auth_error');
  });

  it('should classify network errors', () => {
    const error = new Error('Network connection failed');
    const result = classifyError(error);

    expect(result.type).toBe(ErrorType.SYSTEM_ERROR);
    expect(result.message).toContain('Network connection error');
  });

  it('should classify quota errors', () => {
    const error = new Error('Insufficient quota available');
    const result = classifyError(error);

    expect(result.type).toBe(ErrorType.API_ERROR);
    expect(result.errorClass).toBe('openai_quota_exceeded');
    expect(result.retryable).toBe(false);
  });

  it('should classify timeout errors', () => {
    const error = new Error('Request timed out');
    const result = classifyError(error);

    expect(result.type).toBe(ErrorType.TIMEOUT_ERROR);
    expect(result.errorClass).toBe('openai_timeout');
  });

  it('should classify file size errors', () => {
    const error = new Error('File size too large');
    const result = classifyError(error);

    expect(result.type).toBe(ErrorType.VALIDATION_ERROR);
    expect(result.errorClass).toBe('file_too_large');
  });

  it('should classify missing columns errors', () => {
    const error = new Error('Missing required columns');
    const result = classifyError(error);

    expect(result.type).toBe(ErrorType.USER_ERROR);
    expect(result.errorClass).toBe('missing_columns');
  });

  it('should default to system error for unknown errors', () => {
    const error = new Error('Unknown error');
    const result = classifyError(error);

    expect(result.type).toBe(ErrorType.SYSTEM_ERROR);
    expect(result.errorClass).toBe('system_error');
  });

  it('should handle non-Error objects', () => {
    const result = classifyError('string error');

    expect(result.type).toBe(ErrorType.SYSTEM_ERROR);
    expect(result.message).toBe('An unknown error occurred');
  });
});

describe('createErrorTelemetry', () => {
  it('should create telemetry object', () => {
    const error = new AppError(ErrorType.API_ERROR, 'Test error', {
      errorClass: 'test_error',
      details: { key: 'value' },
    });

    const telemetry = createErrorTelemetry(error, 'test_context');

    expect(telemetry).toMatchObject({
      errorClass: 'test_error',
      errorType: ErrorType.API_ERROR,
      message: 'Test error',
      retryable: true,
      context: 'test_context',
      details: { key: 'value' },
    });
    expect(telemetry.timestamp).toBeDefined();
  });
});

describe('defaultRetryHandler', () => {
  it('should be configured with default values', () => {
    expect(defaultRetryHandler).toBeInstanceOf(RetryHandler);
  });

  it('should work with simple operations', async () => {
    const operation = vi.fn().mockResolvedValue('test');
    const result = await defaultRetryHandler.executeWithRetry(operation);

    expect(result).toBe('test');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
