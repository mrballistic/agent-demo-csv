import nextRateLimit from 'next-rate-limit';
import { NextRequest, NextResponse } from 'next/server';

// Rate limiter configuration
const limiter = nextRateLimit({
  interval: 60 * 1000, // 60 seconds
  uniqueTokenPerInterval: 500, // Max 500 unique IPs per interval
});

// Different rate limits for different API endpoints
export const apiRateLimiter = nextRateLimit({
  interval: 60 * 1000, // 60 seconds
  uniqueTokenPerInterval: 100, // Max 100 unique IPs per interval
});

// Stricter rate limiting for analysis endpoints
export const analysisRateLimiter = nextRateLimit({
  interval: 60 * 1000, // 60 seconds
  uniqueTokenPerInterval: 50, // Max 50 unique IPs per interval
});

// File upload rate limiting
export const uploadRateLimiter = nextRateLimit({
  interval: 60 * 1000, // 60 seconds
  uniqueTokenPerInterval: 20, // Max 20 unique IPs per interval
});

// Simple rate limit function for testing
export async function rateLimit(request: NextRequest): Promise<void> {
  await limiter.checkNext(request, 10);
  // If we get here without throwing, rate limit passed
}

export async function withRateLimit(
  request: NextRequest,
  rateLimiter: ReturnType<typeof nextRateLimit>,
  handler: () => Promise<NextResponse> | NextResponse
): Promise<NextResponse> {
  try {
    await rateLimiter.checkNext(request, 10);
    const response = await handler();
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.',
        retryAfter: 60,
      },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Date.now() + 60000),
        },
      }
    );
  }
}
