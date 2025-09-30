/**
 * @fileoverview Next.js Middleware - CORS and security headers for API routes
 *
 * Configures Cross-Origin Resource Sharing (CORS) and security headers
 * for all API endpoints, handling preflight requests and development mode.
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware function that applies CORS and security headers to API routes
 *
 * Features:
 * - CORS configuration with allowed origins
 * - Preflight request handling
 * - Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
 * - Development mode allowances
 *
 * @param request - The incoming NextRequest
 * @returns NextResponse with appropriate headers
 *
 * @example
 * ```typescript
 * // This middleware automatically runs for all /api/* routes
 * // No manual invocation needed
 * ```
 */
export function middleware(request: NextRequest) {
  // Apply CORS headers to API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const response = NextResponse.next();

    // CORS configuration
    const origin = request.headers.get('origin');
    const allowedOrigins = [
      process.env.APP_URL,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ].filter(Boolean);

    // Set CORS headers
    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    } else if (process.env.NODE_ENV === 'development') {
      // Allow all origins in development
      response.headers.set('Access-Control-Allow-Origin', '*');
    }

    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Idempotency-Key'
    );
    response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 200, headers: response.headers });
    }

    // Add security headers for API routes
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
