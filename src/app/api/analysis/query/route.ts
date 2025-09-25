import { NextRequest, NextResponse } from 'next/server';
import { assistantManager } from '@/lib/openai';
import { sessionStore } from '@/lib/session-store';

export const runtime = 'nodejs';

interface QueryRequest {
  threadId: string;
  query: string;
  fileId?: string;
}

interface ErrorResponse {
  error: string;
  type:
    | 'user_error'
    | 'system_error'
    | 'timeout_error'
    | 'validation_error'
    | 'api_error';
  retryable: boolean;
  suggestedAction?: string;
}

// Budget enforcement constants
const HARD_TIMEOUT_MS = 90 * 1000; // 90 seconds
const GOAL_TIMEOUT_MS = 15 * 1000; // 15 seconds for ≤100k rows
const MAX_CONCURRENT_RUNS = 10;

// Simple in-memory run queue
const runQueue: Array<{ runId: string; threadId: string; startTime: number }> =
  [];
const activeRuns = new Map<
  string,
  { threadId: string; startTime: number; timeoutId: NodeJS.Timeout }
>();

export async function POST(request: NextRequest) {
  try {
    const body: QueryRequest = await request.json();
    const { threadId, query, fileId } = body;

    if (!threadId || !query) {
      return NextResponse.json(
        {
          error: 'threadId and query are required',
          type: 'validation_error',
          retryable: false,
        } as ErrorResponse,
        { status: 400 }
      );
    }

    // Check for idempotency key to prevent duplicate runs
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (idempotencyKey) {
      // Check if we've already processed this request
      const existingRun = Array.from(activeRuns.values()).find(
        run => run.threadId === threadId
      );
      if (existingRun) {
        return NextResponse.json({
          success: true,
          runId: `existing_${Date.now()}`,
          message: 'Run already in progress',
          status: 'in_progress',
        });
      }
    }

    // Find session by thread ID
    const session = sessionStore.getSessionByThreadId(threadId);
    if (!session) {
      return NextResponse.json(
        {
          error: 'Session not found or expired',
          type: 'user_error',
          retryable: false,
          suggestedAction: 'Please upload a file to start a new session',
        } as ErrorResponse,
        { status: 404 }
      );
    }

    // Check queue capacity
    if (activeRuns.size >= MAX_CONCURRENT_RUNS) {
      const queuePosition = runQueue.length + 1;
      const estimatedWaitTime = Math.ceil(
        (queuePosition * 30) / MAX_CONCURRENT_RUNS
      ); // Estimate 30s per run

      return NextResponse.json(
        {
          error: 'Too many concurrent analyses. You are queued.',
          type: 'system_error',
          retryable: true,
          suggestedAction:
            'Wait for your turn or cancel other running analyses',
          queuePosition,
          estimatedWaitTime,
        } as ErrorResponse,
        {
          status: 429,
          headers: {
            'Retry-After': estimatedWaitTime.toString(),
          },
        }
      );
    }

    // Update session activity
    sessionStore.updateSession(session.id, {
      lastActivity: Date.now(),
    });

    // Determine timeout based on data size
    const uploadedFile = session.uploadedFile;
    let timeoutMs = HARD_TIMEOUT_MS;

    // For now, use goal timeout for smaller files (we can enhance this later with actual row count)
    if (uploadedFile && uploadedFile.size < 10 * 1024 * 1024) {
      // Files under 10MB
      timeoutMs = GOAL_TIMEOUT_MS;
    }

    try {
      // Check if we have a real OpenAI API key
      const hasOpenAIKey =
        process.env.OPENAI_API_KEY &&
        process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';

      const runId = `run_${Date.now()}`;
      const startTime = Date.now();

      if (hasOpenAIKey) {
        // Use real OpenAI API
        await assistantManager.createMessage(threadId, query, fileId);
        const run = await assistantManager.createRun(threadId);

        // Set up timeout enforcement
        const timeoutId = setTimeout(() => {
          handleRunTimeout(run.id, threadId);
        }, timeoutMs);

        // Track active run
        activeRuns.set(run.id, { threadId, startTime, timeoutId });

        return NextResponse.json({
          success: true,
          runId: run.id,
          message: 'Analysis started',
          status: 'queued',
          timeoutMs,
          estimatedDuration:
            timeoutMs === GOAL_TIMEOUT_MS ? '15 seconds' : '90 seconds',
        });
      } else {
        // Simulate for demo with timeout tracking
        const timeoutId = setTimeout(() => {
          handleRunTimeout(runId, threadId);
        }, timeoutMs);

        // Track simulated run
        activeRuns.set(runId, { threadId, startTime, timeoutId });

        return NextResponse.json({
          success: true,
          runId,
          message: 'Analysis started (demo mode)',
          status: 'queued',
          timeoutMs,
          estimatedDuration:
            timeoutMs === GOAL_TIMEOUT_MS ? '15 seconds' : '90 seconds',
        });
      }
    } catch (error) {
      console.error('Analysis query failed:', error);

      // Categorize errors
      let errorResponse: ErrorResponse;

      if (error instanceof Error) {
        if (
          error.message.includes('rate limit') ||
          error.message.includes('quota')
        ) {
          errorResponse = {
            error: 'OpenAI API rate limit exceeded. Please try again later.',
            type: 'api_error',
            retryable: true,
            suggestedAction: 'Wait a few minutes and try again',
          };
        } else if (error.message.includes('timeout')) {
          errorResponse = {
            error:
              'Analysis timed out. Try with a smaller dataset or simpler query.',
            type: 'timeout_error',
            retryable: true,
            suggestedAction: 'Reduce data size or simplify your question',
          };
        } else if (error.message.includes('missing columns')) {
          errorResponse = {
            error: 'Required columns are missing from your data.',
            type: 'user_error',
            retryable: true,
            suggestedAction: 'Check your data format or use column mapping',
          };
        } else {
          errorResponse = {
            error: 'Analysis failed due to a system error.',
            type: 'system_error',
            retryable: true,
            suggestedAction:
              'Please try again or contact support if this persists',
          };
        }
      } else {
        errorResponse = {
          error: 'Unknown error occurred',
          type: 'system_error',
          retryable: true,
        };
      }

      return NextResponse.json(errorResponse, { status: 500 });
    }
  } catch (error) {
    console.error('Request parsing failed:', error);
    return NextResponse.json(
      {
        error: 'Invalid request format',
        type: 'validation_error',
        retryable: false,
        suggestedAction: 'Check your request format and try again',
      } as ErrorResponse,
      { status: 400 }
    );
  }
}

// Handle run timeout
async function handleRunTimeout(runId: string, threadId: string) {
  const activeRun = activeRuns.get(runId);
  if (!activeRun) return;

  try {
    // Try to cancel the run if it's a real OpenAI run
    const hasOpenAIKey =
      process.env.OPENAI_API_KEY &&
      process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';

    if (hasOpenAIKey && !runId.startsWith('run_')) {
      await assistantManager.cancelRun(threadId, runId);
    }

    console.log(
      `Run ${runId} timed out after ${Date.now() - activeRun.startTime}ms`
    );
  } catch (error) {
    console.error('Failed to cancel timed out run:', error);
  } finally {
    // Clean up tracking
    clearTimeout(activeRun.timeoutId);
    activeRuns.delete(runId);
  }
}

// Clean up completed runs (called from streaming endpoint)
export function cleanupRun(runId: string) {
  const activeRun = activeRuns.get(runId);
  if (activeRun) {
    clearTimeout(activeRun.timeoutId);
    activeRuns.delete(runId);
  }
}
