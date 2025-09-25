import { NextRequest, NextResponse } from 'next/server';
import { assistantManager, extractManifest } from '@/lib/openai';
import { sessionStore } from '@/lib/session-store';
import { fileStore } from '@/lib/file-store';
import { openai } from '@/lib/openai';

export const runtime = 'nodejs';

interface ProfileRequest {
  fileId: string;
  sessionId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ProfileRequest = await request.json();
    const { fileId, sessionId } = body;

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId is required' },
        { status: 400 }
      );
    }

    // Create or get session
    let session;
    if (sessionId) {
      session = sessionStore.getSession(sessionId);
      if (!session) {
        return NextResponse.json(
          { error: 'Session not found or expired' },
          { status: 404 }
        );
      }
    } else {
      // Create assistant and thread
      await assistantManager.createAssistant();
      const thread = await assistantManager.createThread();
      session = sessionStore.createSession(thread.id);
    }

    // Check if we have a real OpenAI API key
    const hasOpenAIKey =
      process.env.OPENAI_API_KEY &&
      process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';
    let openaiFileId: string;

    if (hasOpenAIKey) {
      // TODO: In a real implementation, we would retrieve the actual file content
      // and upload it to OpenAI. For now, we'll create a mock file ID.
      // This would involve:
      // 1. Getting the file content from our file store or upload data
      // 2. Uploading to OpenAI Files API
      // 3. Using the returned file ID
      openaiFileId = `file-${fileId}`;
    } else {
      // Use mock file ID for demo
      openaiFileId = `file-${fileId}`;
    }

    // Create message with CSV attachment
    await assistantManager.createMessage(
      session.threadId,
      'Profile the file and suggest questions.',
      openaiFileId
    );

    // Create and start the run (this will be streamed via the streaming endpoint)
    const run = await assistantManager.createRun(session.threadId);

    // Update session metrics
    sessionStore.updateSession(session.id, {
      metrics: {
        ...session.metrics,
        analysesCount: session.metrics.analysesCount + 1,
      },
    });

    return NextResponse.json({
      runId: run.id,
      threadId: session.threadId,
      sessionId: session.id,
      status: run.status,
    });
  } catch (error) {
    console.error('Profile analysis error:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred during profiling' },
      { status: 500 }
    );
  }
}
