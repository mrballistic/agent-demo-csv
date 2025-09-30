/**
 * Data profiling API endpoint
 * @fileoverview Provides automated CSV analysis and data profiling capabilities
 */

import { NextRequest, NextResponse } from 'next/server';
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
import {
  DataProfilingAgent,
  globalOrchestrator,
  createExecutionContext,
  AgentType,
} from '@/lib/agents';

export const runtime = 'nodejs';

/**
 * Request body for data profiling
 */
interface ProfileRequest {
  /** ID of the uploaded file to profile */
  fileId: string;
  /** Optional session ID for context */
  sessionId?: string;
}

/**
 * POST /api/analysis/profile - Analyze and profile uploaded CSV data
 *
 * This endpoint performs comprehensive analysis of uploaded CSV files including:
 * - Column type detection and statistics
 * - Data quality assessment
 * - PII detection and security warnings
 * - Sample data extraction
 * - Missing value analysis
 * - Data distribution insights
 *
 * @param request - Next.js request object containing ProfileRequest body
 * @returns JSON response with complete data profile or error details
 *
 * @example
 * ```javascript
 * const response = await fetch('/api/analysis/profile', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ fileId: 'file_123' })
 * });
 * const profile = await response.json();
 * ```
 */
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

      return NextResponse.json(error.toErrorResponse(), {
        status: 400,
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      });
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

        return NextResponse.json(error.toErrorResponse(), {
          status: 404,
          headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
          },
        });
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
      // Initialize agent orchestrator if needed
      if (!globalOrchestrator.getAgent(AgentType.PROFILING)) {
        const profilingAgent = new DataProfilingAgent();
        globalOrchestrator.registerAgent(profilingAgent);
      }

      // Use retry handler for profile analysis
      const result = await defaultRetryHandler.executeWithRetry(async () => {
        // Get the file content from our file store
        const fileContent = await fileStore.getFile(fileId);
        const fileMetadata = fileStore.getFileMetadata(fileId);

        if (!fileContent || !fileMetadata) {
          throw new Error(`File not found in store: ${fileId}`);
        }

        // Execute data profiling using agent orchestrator
        const uploadedFile = {
          buffer: fileContent,
          name: fileMetadata.originalName,
          mimeType: fileMetadata.mimeType || 'text/csv',
          size: fileMetadata.size,
        };

        const profile =
          await globalOrchestrator.processDataUpload(uploadedFile);

        // Store profile and file reference in session for streaming endpoint
        sessionStore.updateSession(session.id, {
          uploadedFile: {
            id: fileId,
            filename: fileMetadata.originalName,
            size: fileMetadata.size,
            checksum: fileMetadata.checksum,
          },
          dataProfile: profile,
        });

        // Generate a run ID for tracking
        const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2)}`;

        // Extract and enhance security metadata for API response
        const securityMetadata = {
          piiDetected: (profile.security?.piiColumns?.length || 0) > 0,
          riskLevel: profile.security?.riskLevel || 'low',
          piiColumnsCount: profile.security?.piiColumns?.length || 0,
          complianceFlags: profile.security?.complianceFlags || [],
          hasRedaction: profile.security?.hasRedaction || false,
          recommendations: profile.security?.recommendations || [],
          piiColumns: profile.security?.piiColumns || [],
        };

        return {
          runId,
          threadId: session.threadId,
          sessionId: session.id,
          status: 'completed',
          profile: profile,
          security: securityMetadata,
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

      return NextResponse.json(result, {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Cache-Control':
            'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
          ...(result.security?.piiDetected && {
            'X-PII-Detected': 'true',
            'X-Risk-Level': result.security.riskLevel,
          }),
        },
      });
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

      return NextResponse.json(appError.toErrorResponse(), {
        status: 500,
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      });
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

    return NextResponse.json(appError.toErrorResponse(), {
      status: 400,
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  }
}
