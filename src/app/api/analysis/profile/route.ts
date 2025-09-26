import { NextRequest, NextResponse } from 'next/server';
import { conversationManager } from '@/lib/openai-responses';
import { sessionStore } from '@/lib/session-store';
import { fileStore } from '@/lib/file-store';
import {
  AppError,
  ErrorFactory,
  ErrorType,
  defaultRetryHandler,
  classifyError,
  createErrorTelemetry,
} from '@/lib/error-handler';
import { telemetryService, Telemetry } from '@/lib/telemetry';

export const runtime = 'nodejs';

interface ProfileRequest {
  fileId: string;
  sessionId?: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let currentSessionId: string | undefined;
  let errorClass: string | undefined;

  try {
    // Extract request context for telemetry
    const userAgent = request.headers.get('user-agent') || undefined;
    const requestId =
      request.headers.get('x-request-id') || `req_${Date.now()}`;

    const body: ProfileRequest = await request.json();
    const { fileId, sessionId } = body;

    if (!fileId) {
      const error = new AppError(
        ErrorType.VALIDATION_ERROR,
        'fileId is required',
        {
          errorClass: 'missing_file_id',
          suggestedAction: 'Please provide a valid fileId',
        }
      );

      telemetryService.logError(
        createErrorTelemetry(error, 'analysis_profile'),
        {
          userAgent,
          requestId,
          endpoint: '/api/analysis/profile',
        }
      );

      return NextResponse.json(error.toErrorResponse(), { status: 400 });
    }

    // Create or get session
    let session;
    if (sessionId) {
      session = sessionStore.getSession(sessionId);
      if (!session) {
        const error = ErrorFactory.sessionNotFound();

        telemetryService.logError(
          createErrorTelemetry(error, 'analysis_profile'),
          {
            sessionId,
            userAgent,
            requestId,
            endpoint: '/api/analysis/profile',
          }
        );

        return NextResponse.json(error.toErrorResponse(), { status: 404 });
      }
    } else {
      // Create a new session with a simple generated thread ID
      const threadId = `thread_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      session = sessionStore.createSession(threadId);
      Telemetry.trackSessionEvent('created', session.id, { fileId });
    }

    currentSessionId = session.id;

    // Track analysis request
    Telemetry.trackAnalysisRequest(
      'profile',
      currentSessionId,
      session.threadId,
      fileId
    );

    try {
      // Use retry handler for profile analysis
      const result = await defaultRetryHandler.executeWithRetry(async () => {
        // Get the file content from our file store
        const fileContent = await fileStore.getFile(fileId);
        const fileMetadata = fileStore.getFileMetadata(fileId);

        if (!fileContent || !fileMetadata) {
          throw new Error(`File not found in store: ${fileId}`);
        }

        // Store file reference in session for streaming endpoint
        sessionStore.updateSession(session.id, {
          uploadedFile: {
            id: fileId,
            filename: fileMetadata.originalName,
            size: fileMetadata.size,
            checksum: fileMetadata.checksum,
          },
        });

        // Generate a run ID for tracking
        const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2)}`;

        return {
          runId,
          threadId: session.threadId,
          sessionId: session.id,
          status: 'queued',
        };
      }, 'profile_analysis');

      // Update session metrics
      sessionStore.updateSession(session.id, {
        metrics: {
          ...session.metrics,
          analysesCount: session.metrics.analysesCount + 1,
        },
      });

      // Track successful analysis start
      const duration = Date.now() - startTime;
      Telemetry.trackAnalysisCompletion(
        'profile',
        duration,
        currentSessionId,
        session.threadId,
        true,
        undefined,
        result.runId,
        undefined, // tokenUsage not available at this stage
        [] // fileIds will be available after run completes
      );

      return NextResponse.json(result);
    } catch (error) {
      console.error('Profile analysis error:', error);

      // Classify and handle the error
      const appError = classifyError(error);
      errorClass = appError.errorClass;

      // Log error telemetry
      telemetryService.logError(
        createErrorTelemetry(appError, 'analysis_profile'),
        {
          sessionId: currentSessionId,
          threadId: session.threadId,
          userAgent,
          requestId,
          endpoint: '/api/analysis/profile',
          stackTrace: error instanceof Error ? error.stack : undefined,
        }
      );

      // Track failed analysis
      const duration = Date.now() - startTime;
      Telemetry.trackAnalysisCompletion(
        'profile',
        duration,
        currentSessionId,
        session.threadId,
        false,
        errorClass
      );

      return NextResponse.json(appError.toErrorResponse(), { status: 500 });
    }
  } catch (error) {
    console.error('Profile request parsing failed:', error);

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
      createErrorTelemetry(appError, 'analysis_profile'),
      {
        sessionId: currentSessionId,
        userAgent: request.headers.get('user-agent') || undefined,
        requestId: request.headers.get('x-request-id') || `req_${Date.now()}`,
        endpoint: '/api/analysis/profile',
        stackTrace: error instanceof Error ? error.stack : undefined,
      }
    );

    return NextResponse.json(appError.toErrorResponse(), { status: 400 });
  }
}
