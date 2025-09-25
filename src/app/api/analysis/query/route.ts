import { NextRequest, NextResponse } from 'next/server';
import { assistantManager } from '@/lib/openai';
import { sessionStore } from '@/lib/session-store';
import { runQueue, QueuedRun } from '@/lib/run-queue';
import {
  AppError,
  ErrorFactory,
  ErrorType,
  defaultRetryHandler,
  classifyError,
  createErrorTelemetry,
} from '@/lib/error-handler';
import { telemetryService, Telemetry } from '@/lib/telemetry';
import {
  getIdempotencyKey,
  validateIdempotencyKey,
  withIdempotency,
} from '@/lib/idempotency';

export const runtime = 'nodejs';

interface QueryRequest {
  threadId: string;
  query: string;
  fileId?: string;
}

// Budget enforcement constants
const HARD_TIMEOUT_MS = 90 * 1000; // 90 seconds
const GOAL_TIMEOUT_MS = 15 * 1000; // 15 seconds for ≤100k rows

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let sessionId: string | undefined;
  let errorClass: string | undefined;

  try {
    const body: QueryRequest = await request.json();
    const { threadId, query, fileId } = body;

    // Extract request context for telemetry
    const userAgent = request.headers.get('user-agent') || undefined;
    const requestId =
      request.headers.get('x-request-id') || `req_${Date.now()}`;

    if (!threadId || !query) {
      const error = new AppError(
        ErrorType.VALIDATION_ERROR,
        'threadId and query are required',
        {
          errorClass: 'missing_required_fields',
          details: { hasThreadId: !!threadId, hasQuery: !!query },
        }
      );

      telemetryService.logError(createErrorTelemetry(error, 'analysis_query'), {
        userAgent,
        requestId,
        endpoint: '/api/analysis/query',
      });

      return NextResponse.json(error.toErrorResponse(), { status: 400 });
    }

    // Check for idempotency key to prevent duplicate runs
    const idempotencyKey = getIdempotencyKey(request);
    if (idempotencyKey && !validateIdempotencyKey(idempotencyKey)) {
      const error = new AppError(
        ErrorType.VALIDATION_ERROR,
        'Invalid idempotency key format',
        {
          errorClass: 'invalid_idempotency_key',
          suggestedAction:
            'Use alphanumeric characters, hyphens, and underscores only (1-255 chars)',
          details: { providedKey: idempotencyKey },
        }
      );

      telemetryService.logError(createErrorTelemetry(error, 'analysis_query'), {
        userAgent,
        requestId,
        endpoint: '/api/analysis/query',
      });

      return NextResponse.json(error.toErrorResponse(), { status: 400 });
    }

    // Find session by thread ID
    const session = sessionStore.getSessionByThreadId(threadId);
    if (!session) {
      const error = ErrorFactory.sessionNotFound();

      telemetryService.logError(createErrorTelemetry(error, 'analysis_query'), {
        threadId,
        userAgent,
        requestId,
        endpoint: '/api/analysis/query',
      });

      return NextResponse.json(error.toErrorResponse(), { status: 404 });
    }

    sessionId = session.id;

    // Check queue capacity and enqueue the run
    const queueParams: Omit<
      QueuedRun,
      'id' | 'queuedAt' | 'status' | 'retryCount' | 'maxRetries'
    > = {
      threadId,
      sessionId: session.id,
      query,
      priority: 'normal',
    };

    if (fileId) {
      queueParams.fileId = fileId;
    }

    const queueResult = runQueue.enqueue(queueParams);

    if (!queueResult.accepted) {
      const error = ErrorFactory.queueLimitReached(
        0, // No position since rejected
        queueResult.retryAfter || 60
      );

      telemetryService.logError(createErrorTelemetry(error, 'analysis_query'), {
        sessionId,
        threadId,
        userAgent,
        requestId,
        endpoint: '/api/analysis/query',
      });

      return NextResponse.json(error.toErrorResponse(), {
        status: 429,
        headers: {
          'Retry-After': (queueResult.retryAfter || 60).toString(),
        },
      });
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

    // Track analysis request
    Telemetry.trackAnalysisRequest('query', sessionId, threadId, fileId);

    try {
      // Execute with idempotency support
      const result = await withIdempotency(async () => {
        // Use retry handler for OpenAI operations
        return await defaultRetryHandler.executeWithRetry(async () => {
          const runId = queueResult.runId;

          // Return queue information immediately
          // The actual execution will be handled by the queue processor and streaming endpoint
          return {
            success: true,
            runId,
            message:
              queueResult.queuePosition === 1
                ? 'Analysis starting...'
                : `Analysis queued (position ${queueResult.queuePosition})`,
            status: 'queued',
            queuePosition: queueResult.queuePosition,
            estimatedWaitTime: queueResult.estimatedWaitTime,
            timeoutMs,
            estimatedDuration:
              timeoutMs === GOAL_TIMEOUT_MS ? '15 seconds' : '90 seconds',
          };
        }, 'analysis_query');
      }, idempotencyKey);

      // Track successful analysis start
      const duration = Date.now() - startTime;
      Telemetry.trackAnalysisCompletion(
        'query',
        duration,
        sessionId,
        threadId,
        true
      );

      return NextResponse.json(result);
    } catch (error) {
      console.error('Analysis query failed:', error);

      // Classify and handle the error
      const appError = classifyError(error);
      errorClass = appError.errorClass;

      // Log error telemetry
      telemetryService.logError(
        createErrorTelemetry(appError, 'analysis_query'),
        {
          sessionId,
          threadId,
          userAgent,
          requestId,
          endpoint: '/api/analysis/query',
          stackTrace: error instanceof Error ? error.stack : undefined,
        }
      );

      // Track failed analysis
      const duration = Date.now() - startTime;
      Telemetry.trackAnalysisCompletion(
        'query',
        duration,
        sessionId,
        threadId,
        false,
        errorClass
      );

      return NextResponse.json(appError.toErrorResponse(), { status: 500 });
    }
  } catch (error) {
    console.error('Request parsing failed:', error);

    const appError = new AppError(
      ErrorType.VALIDATION_ERROR,
      'Invalid request format',
      {
        errorClass: 'request_parsing_failed',
        suggestedAction: 'Check your request format and try again',
        ...(error instanceof Error && { cause: error }),
      }
    );

    // Log parsing error
    telemetryService.logError(
      createErrorTelemetry(appError, 'analysis_query'),
      {
        sessionId,
        userAgent: request.headers.get('user-agent') || undefined,
        requestId: request.headers.get('x-request-id') || `req_${Date.now()}`,
        endpoint: '/api/analysis/query',
        stackTrace: error instanceof Error ? error.stack : undefined,
      }
    );

    return NextResponse.json(appError.toErrorResponse(), { status: 400 });
  }
}

// Handle run timeout
async function handleRunTimeout(runId: string, threadId: string) {
  try {
    // Try to cancel the run if it's a real OpenAI run
    const hasOpenAIKey =
      process.env.OPENAI_API_KEY &&
      process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';

    if (hasOpenAIKey && !runId.startsWith('run_')) {
      await assistantManager.cancelRun(threadId, runId);
    }

    console.log(`Run ${runId} timed out`);
  } catch (error) {
    console.error('Failed to cancel timed out run:', error);
  }
}
