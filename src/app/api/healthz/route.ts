import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, apiRateLimiter } from '@/lib/rate-limit';

// Get build SHA from environment or generate a fallback
function getBuildSHA(): string {
  // Try to get from environment variables (set during build)
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA;
  }

  if (process.env.BUILD_SHA) {
    return process.env.BUILD_SHA;
  }

  // Fallback to package version + timestamp for local development
  const packageVersion = process.env.npm_package_version || '0.1.0';
  const buildTime = process.env.BUILD_TIME || Date.now().toString();
  return `${packageVersion}-${buildTime.slice(-8)}`;
}

export async function GET(request: NextRequest) {
  return withRateLimit(request, apiRateLimiter, async () => {
    const buildSHA = getBuildSHA();
    const uptime = process.uptime();

    return NextResponse.json(
      {
        status: 'healthy',
        buildSHA,
        uptime: Math.floor(uptime),
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        environment: process.env.NODE_ENV || 'development',
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  });
}

// Health check should only support GET method
export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: { Allow: 'GET' } }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: { Allow: 'GET' } }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: { Allow: 'GET' } }
  );
}
