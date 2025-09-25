import { NextRequest, NextResponse } from 'next/server';
import { assistantManager } from '@/lib/openai';
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
      // Create assistant and thread with retry logic
      try {
        await defaultRetryHandler.executeWithRetry(async () => {
          await assistantManager.createAssistant();
        }, 'create_assistant');

        const thread = await defaultRetryHandler.executeWithRetry(async () => {
          return await assistantManager.createThread();
        }, 'create_thread');

        session = sessionStore.createSession(thread.id);
        Telemetry.trackSessionEvent('created', session.id, { fileId });
      } catch (error) {
        const appError = classifyError(error);
        errorClass = appError.errorClass;

        telemetryService.logError(
          createErrorTelemetry(appError, 'analysis_profile'),
          {
            userAgent,
            requestId,
            endpoint: '/api/analysis/profile',
            stackTrace: error instanceof Error ? error.stack : undefined,
          }
        );

        return NextResponse.json(appError.toErrorResponse(), { status: 500 });
      }
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
      // Use retry handler for OpenAI operations
      const result = await defaultRetryHandler.executeWithRetry(async () => {
        // Check if we have a real OpenAI API key
        const hasOpenAIKey =
          process.env.OPENAI_API_KEY &&
          process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';
        let openaiFileId: string;

        if (hasOpenAIKey) {
          // Get the file content from our file store
          const fileContent = await fileStore.getFile(fileId);
          const fileMetadata = fileStore.getFileMetadata(fileId);

          if (!fileContent || !fileMetadata) {
            throw new Error(`File not found in store: ${fileId}`);
          }

          // Upload file to OpenAI Files API
          const openaiFile = await assistantManager.uploadFile(
            fileContent,
            fileMetadata.originalName,
            'assistants'
          );

          openaiFileId = openaiFile.id;
        } else {
          // Use mock file ID for demo (this path shouldn't be reached anymore)
          openaiFileId = `file-${fileId}`;
        } // Create message with CSV attachment
        await assistantManager.createMessage(
          session.threadId,
          'Profile the file and suggest questions.',
          openaiFileId
        );

        // Create and start the run (this will be streamed via the streaming endpoint)
        const run = await assistantManager.createRun(session.threadId);

        return {
          runId: run.id,
          threadId: session.threadId,
          sessionId: session.id,
          status: run.status,
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
