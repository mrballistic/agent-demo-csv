/**
 * Tests for the idempotency system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  idempotencyStore,
  generateIdempotencyKey,
  withIdempotency,
  getIdempotencyKey,
  validateIdempotencyKey,
} from '../idempotency';

describe('IdempotencyStore', () => {
  beforeEach(() => {
    idempotencyStore.clear();
  });

  it('should store and retrieve requests', () => {
    const key = 'test-key-123';
    const response = { success: true, data: 'test' };

    idempotencyStore.set(key, response);
    const retrieved = idempotencyStore.get(key);

    expect(retrieved).toBeDefined();
    expect(retrieved?.response).toEqual(response);
    expect(retrieved?.key).toBe(key);
  });

  it('should return null for non-existent keys', () => {
    const result = idempotencyStore.get('non-existent');
    expect(result).toBeNull();
  });

  it('should check if key exists', () => {
    const key = 'test-key';
    expect(idempotencyStore.has(key)).toBe(false);

    idempotencyStore.set(key, { data: 'test' });
    expect(idempotencyStore.has(key)).toBe(true);
  });

  it('should provide statistics', () => {
    idempotencyStore.set('key1', { data: 'test1' });
    idempotencyStore.set('key2', { data: 'test2' });

    const stats = idempotencyStore.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.activeRequests).toBe(2);
    expect(stats.oldestRequest).toBeDefined();
  });
});

describe('generateIdempotencyKey', () => {
  it('should generate consistent keys for same input', () => {
    const key1 = generateIdempotencyKey(
      'POST',
      '/api/test',
      { data: 'test' },
      'user123'
    );
    const key2 = generateIdempotencyKey(
      'POST',
      '/api/test',
      { data: 'test' },
      'user123'
    );

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^auto_[a-z0-9]+$/);
  });

  it('should generate different keys for different input', () => {
    const key1 = generateIdempotencyKey('POST', '/api/test', { data: 'test1' });
    const key2 = generateIdempotencyKey('POST', '/api/test', { data: 'test2' });

    expect(key1).not.toBe(key2);
  });
});

describe('withIdempotency', () => {
  beforeEach(() => {
    idempotencyStore.clear();
  });

  it('should execute handler when no idempotency key', async () => {
    const handler = vi.fn().mockResolvedValue('result');

    const result = await withIdempotency(handler);

    expect(result).toBe('result');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should cache and return cached result', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    const key = 'test-key';

    // First call
    const result1 = await withIdempotency(handler, key);
    expect(result1).toBe('result');
    expect(handler).toHaveBeenCalledTimes(1);

    // Second call should return cached result
    const result2 = await withIdempotency(handler, key);
    expect(result2).toBe('result');
    expect(handler).toHaveBeenCalledTimes(1); // Not called again
  });

  it('should not cache error responses', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('test error'));
    const key = 'test-key';

    // First call should fail
    await expect(withIdempotency(handler, key)).rejects.toThrow('test error');
    expect(handler).toHaveBeenCalledTimes(1);

    // Second call should try again (not cached)
    await expect(withIdempotency(handler, key)).rejects.toThrow('test error');
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('getIdempotencyKey', () => {
  it('should extract key from Idempotency-Key header', () => {
    const request = new Request('http://test.com', {
      headers: { 'Idempotency-Key': 'test-key-123' },
    });

    const key = getIdempotencyKey(request);
    expect(key).toBe('test-key-123');
  });

  it('should extract key from lowercase header', () => {
    const request = new Request('http://test.com', {
      headers: { 'idempotency-key': 'test-key-456' },
    });

    const key = getIdempotencyKey(request);
    expect(key).toBe('test-key-456');
  });

  it('should return null when no header present', () => {
    const request = new Request('http://test.com');

    const key = getIdempotencyKey(request);
    expect(key).toBeNull();
  });
});

describe('validateIdempotencyKey', () => {
  it('should validate correct keys', () => {
    expect(validateIdempotencyKey('valid-key-123')).toBe(true);
    expect(validateIdempotencyKey('valid_key_456')).toBe(true);
    expect(validateIdempotencyKey('ValidKey789')).toBe(true);
    expect(validateIdempotencyKey('a')).toBe(true);
  });

  it('should reject invalid keys', () => {
    expect(validateIdempotencyKey('')).toBe(false);
    expect(validateIdempotencyKey('key with spaces')).toBe(false);
    expect(validateIdempotencyKey('key@with#symbols')).toBe(false);
    expect(validateIdempotencyKey('a'.repeat(256))).toBe(false); // Too long
  });
});
