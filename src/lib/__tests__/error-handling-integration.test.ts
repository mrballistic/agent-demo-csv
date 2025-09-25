/**
 * Integration tests for the complete error handling system
 * Tests the interaction between error handling, retries, idempotency, and telemetry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AppError,
  ErrorFactory,
  ErrorType,
  RetryHandler,
  classifyError,
  createErrorTelemetry,
} from '../error-handler';
import { telemetryService } from '../telemetry';
import {
  idempotencyStore,
  withIdempotency,
  getIdempotencyKey,
  validateIdempotencyKey,
} from '../idempotency';

describe('Error Handling Integration', () => {
  beforeEach(() => {
    telemetryService.clearEvents();
    idempotencyStore.clear();
    vi.clearAllMocks();
  });

  describe('End-to-End Error Flow', () => {
    it('should handle complete error flow with telemetry', async () => {
      const retryHandler = new RetryHandler({
        maxRetries: 2,
        baseDelayMs: 10, // Fast for testing
        maxDelayMs: 100,
      });

      let attempts = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts <= 2) {
          throw new Error('Rate limit exceeded (429)');
        }
        return 'success';
      });

      // Execute with retry
      const result = await retryHandler.executeWithRetry(operation, 'test_op');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);

      // Verify no telemetry events were created (since this is just the retry handler)
      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(0);
    });

    it('should handle error classification and telemetry logging', () => {
      // Test various error types
      const errors = [
        new Error('Rate limit exceeded (429)'),
        new Error('Insufficient quota available'),
        new Error('Request timed out'),
        new Error('Server error (503)'),
        new Error('Unauthorized (401)'),
        new Error('Network connection failed'),
        'Unknown error type',
      ];

      errors.forEach((error, index) => {
        const appError = classifyError(error);
        const telemetry = createErrorTelemetry(
          appError,
          `test_context_${index}`
        );

        telemetryService.logError(telemetry, {
          sessionId: `session_${index}`,
          endpoint: '/api/test',
        });
      });

      // Verify telemetry was logged
      const events = telemetryService.exportEvents();
      expect(events).toHaveLength(7);

      // Check error statistics
      const stats = telemetryService.getErrorStats();
      expect(stats.totalErrors).toBe(7);
      expect(stats.errorsByType[ErrorType.API_ERROR]).toBeGreaterThan(0);
      expect(stats.errorsByType[ErrorType.SYSTEM_ERROR]).toBeGreaterThan(0);
    });

    it('should handle idempotency with error scenarios', async () => {
      const idempotencyKey = 'test-key-123';
      let callCount = 0;

      const handler = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw ErrorFactory.openaiRateLimit(60);
        }
        return { success: true, data: 'result' };
      });

      // First call should fail and not be cached
      await expect(withIdempotency(handler, idempotencyKey)).rejects.toThrow();
      expect(callCount).toBe(1);

      // Second call should succeed and be cached
      const result1 = await withIdempotency(handler, idempotencyKey);
      expect(result1).toEqual({ success: true, data: 'result' });
      expect(callCount).toBe(2);

      // Third call should return cached result
      const result2 = await withIdempotency(handler, idempotencyKey);
      expect(result2).toEqual({ success: true, data: 'result' });
      expect(callCount).toBe(2); // No additional call
    });

    it('should validate idempotency keys properly', () => {
      const validKeys = [
        'valid-key-123',
        'valid_key_456',
        'ValidKey789',
        'a',
        'test-123_abc',
      ];

      const invalidKeys = [
        '',
        'key with spaces',
        'key@with#symbols',
        'key.with.dots',
        'a'.repeat(256), // Too long
        'key/with/slashes',
      ];

      validKeys.forEach(key => {
        expect(validateIdempotencyKey(key)).toBe(true);
      });

      invalidKeys.forEach(key => {
        expect(validateIdempotencyKey(key)).toBe(false);
      });
    });

    it('should extract idempotency keys from request headers', () => {
      const testCases = [
        {
          header: 'Idempotency-Key',
          value: 'test-key-1',
          expected: 'test-key-1',
        },
        {
          header: 'idempotency-key',
          value: 'test-key-2',
          expected: 'test-key-2',
        },
        { header: 'Content-Type', value: 'application/json', expected: null },
      ];

      testCases.forEach(({ header, value, expected }) => {
        const request = new Request('http://test.com', {
          headers: { [header]: value },
        });

        const result = getIdempotencyKey(request);
        expect(result).toBe(expected);
      });
    });
  });

  describe('OpenAI-Specific Error Handling', () => {
    it('should handle OpenAI rate limit with retry-after', () => {
      const error = new Error(
        'Rate limit exceeded. Please retry after 120 seconds.'
      );
      const appError = classifyError(error);

      expect(appError.type).toBe(ErrorType.API_ERROR);
      expect(appError.errorClass).toBe('openai_rate_limit');
      expect(appError.retryable).toBe(true);
      expect(appError.details?.retryAfter).toBe(120);
    });

    it('should handle OpenAI server errors', () => {
      const errors = [
        'Server error (500)',
        'Bad gateway (502)',
        'Service unavailable (503)',
        'Internal server error (500)',
      ];

      errors.forEach(errorMessage => {
        const error = new Error(errorMessage);
        const appError = classifyError(error);

        expect(appError.type).toBe(ErrorType.API_ERROR);
        expect(appError.errorClass).toBe('openai_server_error');
        expect(appError.retryable).toBe(true);
      });
    });

    it('should handle OpenAI authentication errors', () => {
      const errors = ['Unauthorized (401)', 'Invalid API key provided'];

      errors.forEach(errorMessage => {
        const error = new Error(errorMessage);
        const appError = classifyError(error);

        expect(appError.type).toBe(ErrorType.SYSTEM_ERROR);
        expect(appError.errorClass).toBe('openai_auth_error');
        expect(appError.retryable).toBe(false);
      });
    });

    it('should handle OpenAI quota errors', () => {
      const errors = [
        'Insufficient quota available',
        'You have exceeded your quota',
        'Quota limit reached',
      ];

      errors.forEach(errorMessage => {
        const error = new Error(errorMessage);
        const appError = classifyError(error);

        expect(appError.type).toBe(ErrorType.API_ERROR);
        expect(appError.errorClass).toBe('openai_quota_exceeded');
        expect(appError.retryable).toBe(false);
      });
    });
  });

  describe('Retry Logic with Different Error Types', () => {
    it('should retry transient errors but not permanent ones', async () => {
      const retryHandler = new RetryHandler({
        maxRetries: 2,
        baseDelayMs: 10,
        maxDelayMs: 100,
      });

      // Test retryable error
      let retryableAttempts = 0;
      const retryableOperation = vi.fn().mockImplementation(() => {
        retryableAttempts++;
        if (retryableAttempts <= 2) {
          throw new Error('Rate limit exceeded (429)');
        }
        return 'success';
      });

      const result = await retryHandler.executeWithRetry(retryableOperation);
      expect(result).toBe('success');
      expect(retryableOperation).toHaveBeenCalledTimes(3);

      // Test non-retryable error
      const nonRetryableOperation = vi.fn().mockImplementation(() => {
        throw ErrorFactory.openaiQuotaExceeded();
      });

      await expect(
        retryHandler.executeWithRetry(nonRetryableOperation)
      ).rejects.toThrow();
      expect(nonRetryableOperation).toHaveBeenCalledTimes(1); // No retries
    });

    it('should enhance errors after retry exhaustion', async () => {
      const retryHandler = new RetryHandler({
        maxRetries: 1,
        baseDelayMs: 10,
        maxDelayMs: 100,
      });

      const operation = vi.fn().mockRejectedValue(ErrorFactory.openaiTimeout());

      try {
        await retryHandler.executeWithRetry(operation);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.message).toContain('failed after 1 retries');
        expect(appError.errorClass).toBe('openai_timeout_retry_exhausted');
        expect(appError.retryable).toBe(false);
      }
    });
  });

  describe('Error Response Format', () => {
    it('should format error responses consistently', () => {
      const errors = [
        ErrorFactory.fileTooLarge(100 * 1024 * 1024),
        ErrorFactory.openaiRateLimit(60),
        ErrorFactory.missingColumns(['price', 'quantity']),
        ErrorFactory.sessionNotFound(),
        ErrorFactory.queueLimitReached(5, 120),
      ];

      errors.forEach(error => {
        const response = error.toErrorResponse();

        expect(response).toHaveProperty('type');
        expect(response).toHaveProperty('message');
        expect(response).toHaveProperty('retryable');
        expect(response).toHaveProperty('errorClass');
        expect(typeof response.type).toBe('string');
        expect(typeof response.message).toBe('string');
        expect(typeof response.retryable).toBe('boolean');
        expect(typeof response.errorClass).toBe('string');

        if (response.suggestedAction) {
          expect(typeof response.suggestedAction).toBe('string');
        }
      });
    });

    it('should include appropriate suggested actions', () => {
      const testCases = [
        {
          error: ErrorFactory.fileTooLarge(100 * 1024 * 1024),
          expectedAction: 'smaller CSV file',
        },
        {
          error: ErrorFactory.openaiRateLimit(60),
          expectedAction: '60 seconds',
        },
        {
          error: ErrorFactory.missingColumns(['price']),
          expectedAction: 'column mapping',
        },
        {
          error: ErrorFactory.sessionNotFound(),
          expectedAction: 'upload a file',
        },
      ];

      testCases.forEach(({ error, expectedAction }) => {
        const response = error.toErrorResponse();
        expect(response.suggestedAction).toContain(expectedAction);
      });
    });
  });

  describe('Telemetry Integration', () => {
    it('should track error metrics correctly', () => {
      // Generate various errors
      const errorTypes = [
        ErrorFactory.openaiRateLimit(),
        ErrorFactory.openaiTimeout(),
        ErrorFactory.fileTooLarge(1000),
        ErrorFactory.missingColumns(['test']),
        ErrorFactory.systemError('test'),
      ];

      errorTypes.forEach((error, index) => {
        const telemetry = createErrorTelemetry(error, `context_${index}`);
        telemetryService.logError(telemetry, {
          sessionId: `session_${index}`,
          endpoint: '/api/test',
        });
      });

      // Check statistics
      const stats = telemetryService.getErrorStats();
      expect(stats.totalErrors).toBe(5);
      expect(stats.retryableErrors).toBe(3); // rate limit, timeout, system error
      expect(stats.errorsByClass).toHaveProperty('openai_rate_limit');
      expect(stats.errorsByClass).toHaveProperty('openai_timeout');
      expect(stats.errorsByClass).toHaveProperty('file_too_large');
    });

    it('should export telemetry data for external systems', () => {
      // Add some test data
      telemetryService.logError(
        createErrorTelemetry(ErrorFactory.openaiRateLimit(), 'test'),
        { sessionId: 'test' }
      );

      const exported = telemetryService.exportEvents();
      expect(exported).toHaveLength(1);
      expect(exported[0]).toHaveProperty('type', 'error');
      expect(exported[0]).toHaveProperty('timestamp');
      expect(exported[0]).toHaveProperty('data');
    });
  });
});
