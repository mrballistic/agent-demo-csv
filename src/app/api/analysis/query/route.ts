import { NextRequest, NextResponse } from 'next/server';
import { assistantManager } from '@/lib/openai';
import { sessionStore } from '@/lib/session-store';

export const runtime = 'nodejs';

interface QueryRequest {
  threadId: string;
  query: string;
  fileId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: QueryRequest = await request.json();
    const { threadId, query, fileId } = body;

    if (!threadId || !query) {
      return NextResponse.json(
        { error: 'threadId and query are required' },
        { status: 400 }
      );
    }

    // Find session by thread ID
    const session = sessionStore.getSessionByThreadId(threadId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      );
    }

    // Update session activity
    sessionStore.updateSession(session.id, {
      lastActivity: Date.now(),
    });

    try {
      // Check if we have a real OpenAI API key
      const hasOpenAIKey =
        process.env.OPENAI_API_KEY &&
        process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';

      if (hasOpenAIKey) {
        // Use real OpenAI API
        await assistantManager.createMessage(threadId, query, fileId);
        const run = await assistantManager.createRun(threadId);

        return NextResponse.json({
          success: true,
          runId: run.id,
          message: 'Analysis started',
        });
      } else {
        // Simulate for demo
        return NextResponse.json({
          success: true,
          runId: `run_${Date.now()}`,
          message: 'Analysis started (demo mode)',
        });
      }
    } catch (error) {
      console.error('Analysis query failed:', error);

      return NextResponse.json(
        {
          error: 'Analysis failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Request parsing failed:', error);
    return NextResponse.json(
      { error: 'Invalid request format' },
      { status: 400 }
    );
  }
}
