import { NextRequest, NextResponse } from 'next/server';
import { assistantManager } from '@/lib/openai';
import { sessionStore } from '@/lib/session-store';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const { threadId } = params;

  if (!threadId) {
    return NextResponse.json(
      { error: 'threadId is required' },
      { status: 400 }
    );
  }

  try {
    // Find session by thread ID
    const session = sessionStore.getSessionByThreadId(threadId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      );
    }

    // Check if we have a real OpenAI API key
    const hasOpenAIKey =
      process.env.OPENAI_API_KEY &&
      process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';

    if (hasOpenAIKey) {
      // Use real OpenAI API to cancel run
      // Note: We would need to track the current run ID to cancel it
      // For now, we'll just return success
      return NextResponse.json({
        success: true,
        message: 'Run cancellation requested',
      });
    } else {
      // Simulate cancellation for demo
      return NextResponse.json({
        success: true,
        message: 'Run cancelled (demo mode)',
      });
    }
  } catch (error) {
    console.error('Run cancellation failed:', error);

    return NextResponse.json(
      {
        error: 'Failed to cancel run',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
