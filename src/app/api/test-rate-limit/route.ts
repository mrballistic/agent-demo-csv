import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    await rateLimit(request);
    return NextResponse.json({ message: 'Rate limit test passed' });
  } catch (error) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }
}
