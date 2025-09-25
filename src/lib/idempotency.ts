/**
 * Idempotency key handling for preventing duplicate requests
 * Implements requirement for Idempotency-Key header support
 */

interface IdempotentRequest {
  key: string;
  response: any;
  timestamp: number;
  expiresAt: number;
}

/**
 * In-memory idempotency store for MVP
 * In production, this would use Redis or similar
 */
class IdempotencyStore {
  private requests = new Map<string, IdempotentRequest>();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    // Cleanup expired requests every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /**
   * Check if a request with this idempotency key has been processed
   */
  get(key: string): IdempotentRequest | null {
    const request = this.requests.get(key);
    if (!request || request.expiresAt < Date.now()) {
      this.requests.delete(key);
      return null;
    }
    return request;
  }

  /**
   * Store the response for an idempotency key
   */
  set(key: string, response: any): void {
    const now = Date.now();
    this.requests.set(key, {
      key,
      response,
      timestamp: now,
      expiresAt: now + this.TTL,
    });
  }

  /**
   * Check if a key exists (for in-progress requests)
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Remove expired requests
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, request] of this.requests) {
      if (request.expiresAt < now) {
        this.requests.delete(key);
      }
    }
  }

  /**
   * Clear all requests (for testing)
   */
  clear(): void {
    this.requests.clear();
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalRequests: number;
    activeRequests: number;
    oldestRequest: number | null;
  } {
    const now = Date.now();
    const activeRequests = Array.from(this.requests.values()).filter(
      req => req.expiresAt >= now
    );

    return {
      totalRequests: this.requests.size,
      activeRequests: activeRequests.length,
      oldestRequest:
        activeRequests.length > 0
          ? Math.min(...activeRequests.map(req => req.timestamp))
          : null,
    };
  }
}

// Singleton instance
export const idempotencyStore = new IdempotencyStore();

/**
 * Generate a default idempotency key based on request content
 */
export function generateIdempotencyKey(
  method: string,
  url: string,
  body?: any,
  userId?: string
): string {
  const content = JSON.stringify({
    method,
    url,
    body,
    userId,
  });

  // Simple hash function for generating keys
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `auto_${Math.abs(hash).toString(36)}`;
}

/**
 * Middleware helper for handling idempotency
 */
export function withIdempotency<T>(
  handler: () => Promise<T>,
  idempotencyKey?: string | null
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    if (!idempotencyKey) {
      // No idempotency key, execute normally
      try {
        const result = await handler();
        resolve(result);
      } catch (error) {
        reject(error);
      }
      return;
    }

    // Check if we've already processed this request
    const existingRequest = idempotencyStore.get(idempotencyKey);
    if (existingRequest) {
      // Return cached response
      resolve(existingRequest.response);
      return;
    }

    try {
      // Execute the handler
      const result = await handler();

      // Store the result for future requests with the same key
      idempotencyStore.set(idempotencyKey, result);

      resolve(result);
    } catch (error) {
      // Don't cache error responses
      reject(error);
    }
  });
}

/**
 * Extract idempotency key from request headers
 */
export function getIdempotencyKey(request: Request): string | null {
  return (
    request.headers.get('Idempotency-Key') ||
    request.headers.get('idempotency-key') ||
    null
  );
}

/**
 * Validate idempotency key format
 */
export function validateIdempotencyKey(key: string): boolean {
  // Key should be 1-255 characters, alphanumeric plus hyphens and underscores
  const keyRegex = /^[a-zA-Z0-9_-]{1,255}$/;
  return keyRegex.test(key);
}
