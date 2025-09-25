import { NextRequest, NextResponse } from 'next/server';
import { assistantManager } from '@/lib/openai';
import { sessionStore } from '@/lib/session-store';
import { runQueue } from '@/lib/run-queue';

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

    // Get the current run ID from the queue or session
    const currentRun = runQueue.getCurrentRun(threadId);

    if (!currentRun) {
      return NextResponse.json(
        { error: 'No active run found for this thread' },
        { status: 404 }
      );
    }

    let cancelled = false;
    let error: string | undefined;

    try {
      // Check if we have a real OpenAI API key
      const hasOpenAIKey =
        process.env.OPENAI_API_KEY &&
        process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';

      if (hasOpenAIKey && currentRun.openaiRunId) {
        // Cancel the actual OpenAI run
        await assistantManager.cancelRun(threadId, currentRun.openaiRunId);
      }

      // Remove from queue and mark as cancelled
      runQueue.cancelRun(currentRun.id);
      cancelled = true;
    } catch (cancelError) {
      console.error('Failed to cancel OpenAI run:', cancelError);
      error =
        cancelError instanceof Error
          ? cancelError.message
          : 'Failed to cancel run';

      // Still remove from our queue even if OpenAI cancellation failed
      runQueue.cancelRun(currentRun.id);
      cancelled = true;
    }

    return NextResponse.json({
      cancelled,
      runId: currentRun.id,
      threadId,
      error,
    });
  } catch (error) {
    console.error('Cancel run error:', error);
    return NextResponse.json(
      {
        error: 'Failed to cancel run',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
