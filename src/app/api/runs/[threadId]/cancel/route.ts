import { NextRequest, NextResponse } from 'next/server';
import { assistantManager } from '@/lib/openai';
import { sessionStore } from '@/lib/session-store';

export const runtime = 'nodejs';

interface CancelRequest {
  runId?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const { threadId } = params;

    if (!threadId) {
      return NextResponse.json(
        { error: 'threadId is required' },
        { status: 400 }
      );
    }

    // Parse optional runId from body
    let runId: string | undefined;
    try {
      const body: CancelRequest = await request.json();
      runId = body.runId;
    } catch {
      // Body is optional for cancel requests
    }

    // Find session by thread ID
    const session = sessionStore.getSessionByThreadId(threadId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      );
    }

    try {
      // Check if we have a real OpenAI API key
      const hasOpenAIKey =
        process.env.OPENAI_API_KEY &&
        process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';

      if (hasOpenAIKey && runId && !runId.startsWith('run_')) {
        // Cancel real OpenAI run
        const cancelledRun = await assistantManager.cancelRun(threadId, runId);

        return NextResponse.json({
          success: true,
          runId: cancelledRun.id,
          status: cancelledRun.status,
          message: 'Run cancelled successfully',
        });
      } else {
        // Handle demo mode cancellation
        return NextResponse.json({
          success: true,
          runId: runId || `cancelled_${Date.now()}`,
          status: 'cancelled',
          message: 'Run cancelled (demo mode)',
        });
      }
    } catch (error) {
      console.error('Failed to cancel run:', error);

      // Handle specific cancellation errors
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return NextResponse.json(
            {
              error: 'Run not found or already completed',
              retryable: false,
            },
            { status: 404 }
          );
        } else if (error.message.includes('already')) {
          return NextResponse.json({
            success: true,
            message: 'Run was already cancelled or completed',
            status: 'cancelled',
          });
        }
      }

      return NextResponse.json(
        {
          error: 'Failed to cancel run',
          details: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Cancel request failed:', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
