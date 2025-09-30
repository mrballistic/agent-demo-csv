import { NextRequest, NextResponse } from 'next/server';

import { conversationManager } from '@/lib/openai-responses';
import { sessionStore } from '@/lib/session-store';
import { fileStore } from '@/lib/file-store';
import { runQueue, QueuedRun } from '@/lib/run-queue';
import { cleanupRun } from '@/lib/run-cleanup';
import { AgentOrchestrator } from '@/lib/agents/orchestrator';
import { QueryPlannerAgent } from '@/lib/agents/query-planner-agent';
import { SemanticExecutorAgent } from '@/lib/agents/semantic-executor-agent';

export const runtime = 'nodejs';

// Initialize semantic layer orchestrator
let orchestrator: AgentOrchestrator | null = null;

async function getOrchestrator(): Promise<AgentOrchestrator> {
  if (!orchestrator) {
    orchestrator = new AgentOrchestrator();

    // Register semantic agents
    const queryPlannerAgent = new QueryPlannerAgent();
    const semanticExecutorAgent = new SemanticExecutorAgent();

    orchestrator.registerAgent(queryPlannerAgent);
    orchestrator.registerAgent(semanticExecutorAgent);

    console.log('Semantic layer orchestrator initialized');
  }
  return orchestrator;
}

// Track active streaming connections to prevent concurrent runs
const activeStreams = new Map<string, boolean>();

// Track recent runs to prevent duplicates (threadId -> last run timestamp)
const recentRuns = new Map<string, number>();
const RUN_COOLDOWN_MS = 10000; // 10 seconds between runs for same thread

// Types for streaming events
interface StreamEvent {
  type: string;
  data: any;
  timestamp: number;
}

interface RunEvent extends StreamEvent {
  type:
    | 'run.started'
    | 'run.in_progress'
    | 'run.completed'
    | 'run.failed'
    | 'run.cancelled';
  data: {
    runId: string;
    threadId: string;
    status: string;
    error?: string;
  };
}

interface MessageEvent extends StreamEvent {
  type: 'message.delta' | 'message.completed';
  data: {
    messageId: string;
    content: string;
    role: 'assistant' | 'user';
    delta?: string;
  };
}

interface ArtifactEvent extends StreamEvent {
  type: 'artifact.created';
  data: {
    artifactId: string;
    filename: string;
    type: 'image' | 'file';
    purpose: string;
    downloadUrl: string;
  };
}

export async function GET(
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

  // Find session by thread ID
  const session = sessionStore.getSessionByThreadId(threadId);
  if (!session) {
    console.log(`Session not found for threadId: ${threadId}`);
    console.log(`Active sessions count: ${sessionStore.getSessionCount()}`);
    console.log(
      `Active session threadIds: ${sessionStore
        .getActiveSessions()
        .map(s => s.threadId)
        .join(', ')}`
    );

    return NextResponse.json(
      {
        error: 'Session not found or expired',
        details:
          'Your session may have expired or the server was restarted. Please refresh the page and start a new analysis.',
        threadId,
        sessionCount: sessionStore.getSessionCount(),
      },
      { status: 404 }
    );
  }

  // Check if there's already an active stream for this thread
  if (activeStreams.get(threadId)) {
    console.log(
      `Active stream already exists for threadId: ${threadId}, rejecting new connection`
    );
    return NextResponse.json(
      {
        error: 'Stream already active',
        message:
          'A streaming connection is already active for this thread. Please wait for it to complete.',
        threadId,
      },
      { status: 409 } // Conflict
    );
  }

  // Mark this thread as having an active stream
  console.log(`Marking stream as active for threadId: ${threadId}`);
  activeStreams.set(threadId, true);

  // Create Server-Sent Events stream
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let isControllerClosed = false;
      let currentRunId: string | null = null;

      const send = (event: StreamEvent) => {
        try {
          // Check if controller is still open
          if (isControllerClosed) {
            console.warn(
              'Attempted to send event on closed controller:',
              event.type
            );
            return;
          }

          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch (error) {
          console.error('Failed to send event:', error);
          isControllerClosed = true;
        }
      };

      // Send initial connection event
      send({
        type: 'connection.established',
        data: { threadId, sessionId: session.id },
        timestamp: Date.now(),
      });

      // Keep connection alive - don't close after first run
      // This allows for follow-up questions without reconnecting
      const keepAlive = setInterval(() => {
        if (!isControllerClosed) {
          send({
            type: 'connection.heartbeat',
            data: { threadId, timestamp: Date.now() },
            timestamp: Date.now(),
          });
        } else {
          clearInterval(keepAlive);
        }
      }, 30000); // Send heartbeat every 30 seconds

      // Handle cleanup when client disconnects
      const handleCleanup = () => {
        console.log(`Cleaning up active stream for threadId: ${threadId}`);
        clearInterval(keepAlive);
        activeStreams.delete(threadId);
        if (!isControllerClosed) {
          try {
            controller.close();
            isControllerClosed = true;
          } catch (closeError) {
            console.error('Error closing stream:', closeError);
            isControllerClosed = true;
          }
        }
      };

      // Listen for runs to be queued for this session and process them
      const checkForNewRuns = setInterval(async () => {
        if (isControllerClosed) {
          clearInterval(checkForNewRuns);
          return;
        }

        // Check for running runs for this thread (the queue processor moves them from queued to running)
        const queuedRun = runQueue.getCurrentRun(threadId);

        // Add more detailed debugging to understand the queue state
        const queueStats = runQueue.getStats();
        console.log(`    // Removed excessive queue logging for clarity`, {
          total: queueStats.total,
          queued: queueStats.queued,
          running: queueStats.running,
          completed: queueStats.completed,
        });

        console.log(`[Stream ${threadId}] Checking for queued runs:`, {
          hasRun: !!queuedRun,
          runId: queuedRun?.id,
          status: queuedRun?.status,
          startedAt: !!queuedRun?.startedAt,
          threadId: queuedRun?.threadId,
          searchingForThreadId: threadId,
        });

        if (
          queuedRun &&
          queuedRun.status === 'running' &&
          !queuedRun.startedAt
        ) {
          console.log(
            `Found running run ${queuedRun.id} for thread ${threadId}, processing...`
          );

          try {
            // Mark run as actually started (with timestamp)
            runQueue.markRunStarted(queuedRun.id, queuedRun.id);

            // Process the queued run
            await processQueuedRun(queuedRun, send);

            // Mark run as completed
            runQueue.markRunCompleted(queuedRun.id, true);
          } catch (error) {
            console.error(
              `Failed to process running run ${queuedRun.id}:`,
              error
            );
            runQueue.markRunCompleted(
              queuedRun.id,
              false,
              error instanceof Error ? error.message : 'Unknown error'
            );
          }
        }
      }, 1000);

      // Handle request to close connection gracefully
      const handleClose = () => {
        clearInterval(checkForNewRuns);
        handleCleanup();
      };

      // Set up immediate run processing (for initial connection)
      (async () => {
        try {
          // Check if we have a real OpenAI API key for streaming
          const hasOpenAIKey =
            process.env.OPENAI_API_KEY &&
            process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';

          console.log(
            `OpenAI key present: ${!!hasOpenAIKey}, key length: ${process.env.OPENAI_API_KEY?.length || 0}`
          );

          if (hasOpenAIKey) {
            // Use real OpenAI streaming with fallback to simulation
            try {
              console.log('Attempting real OpenAI streaming...');
              const result = await streamRealOpenAIRun(
                threadId,
                session.id,
                send
              );
              currentRunId = result.runId;

              // After first run completes, keep connection open for follow-ups
              if (!result.skipped) {
                console.log(
                  `Initial run ${currentRunId} completed, keeping connection open for follow-ups`
                );
              }
            } catch (openaiError) {
              console.error(
                'OpenAI streaming failed, running diagnostics before fallback:',
                openaiError
              );

              // Run diagnostics to understand why OpenAI failed
              try {
                const { diagnoseOpenAIIssue, logDiagnosticResults } =
                  await import('@/lib/openai-diagnostics');
                const diagnosticResults = await diagnoseOpenAIIssue(threadId);
                logDiagnosticResults(diagnosticResults);
              } catch (diagError) {
                console.error('Diagnostic failed:', diagError);
              }

              // Fall back to simulation when OpenAI fails
              await simulateStreamingRun(threadId, session.id, send);
            }
          } else {
            // Fall back to simulation for demo
            await simulateStreamingRun(threadId, session.id, send);
          }

          // After initial processing, keep connection alive
          console.log(
            `Stream established for ${threadId}, ready for follow-up questions`
          );
        } catch (error) {
          console.error('Streaming error:', error);
          try {
            if (!isControllerClosed) {
              send({
                type: 'error',
                data: {
                  error:
                    error instanceof Error ? error.message : 'Unknown error',
                },
                timestamp: Date.now(),
              });
            }
          } catch (sendError) {
            console.error('Failed to send error event:', sendError);
          }
        }
      })();

      // Return cleanup function
      return handleClose;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}

/**
 * Try to process query using semantic layer first, fallback to LLM if needed
 */
async function trySemanticProcessing(
  sessionId: string,
  query: string,
  csvContent?: string
): Promise<{
  success: boolean;
  result?: any;
  confidence?: number;
  shouldFallback?: boolean;
}> {
  try {
    console.log(`🔍 Attempting semantic processing for query: "${query}"`);

    // Get session and validate CSV data availability
    const session = sessionStore.getSession(sessionId);
    if (!session?.uploadedFile || !csvContent) {
      console.log('❌ No CSV data available for semantic processing');
      return { success: false, shouldFallback: true };
    }

    // Create data profile from CSV (simplified version for semantic layer)
    const profile = await createDataProfileFromCSV(
      csvContent,
      session.uploadedFile.filename
    );

    // Get orchestrator and process semantic query
    const orchestrator = await getOrchestrator();

    // Execute semantic query processing through orchestrator workflow
    // Note: We're using the internal helper to test the workflow
    const result = await processSemanticQueryWorkflow(
      orchestrator,
      query,
      profile
    );

    const confidence = result.intent?.confidence || 0;
    console.log(
      `🎯 Semantic processing result: confidence ${confidence}, type: ${result.intent?.type}`
    );

    // Determine if we should use semantic results or fallback to LLM
    const shouldUseSemantic = confidence >= 0.7 && result.data?.length > 0;

    if (shouldUseSemantic) {
      console.log('✅ Using semantic layer results');
      return {
        success: true,
        result,
        confidence,
        shouldFallback: false,
      };
    } else {
      console.log('⚠️ Low confidence or no data, falling back to LLM');
      return {
        success: false,
        confidence,
        shouldFallback: true,
      };
    }
  } catch (error) {
    console.error('❌ Semantic processing failed:', error);
    return { success: false, shouldFallback: true };
  }
}

/**
 * Helper to create simplified data profile from CSV content
 */
async function createDataProfileFromCSV(
  csvContent: string,
  filename: string
): Promise<any> {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0]?.split(',') || [];
  const sampleData = lines.slice(1, 6).map(line => {
    const values = line.split(',');
    const row: any = {};
    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim() || '';
    });
    return row;
  });

  return {
    id: `profile-${Date.now()}`,
    version: 1,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    metadata: {
      filename,
      size: csvContent.length,
      encoding: 'utf-8',
      delimiter: ',',
      rowCount: lines.length - 1,
      columnCount: headers.length,
      processingTime: 0,
      checksum: 'semantic-processing',
    },
    schema: {
      columns: headers.map(header => ({
        name: header.trim(),
        type: 'categorical', // Simplified for semantic processing
      })),
      relationships: [],
      foreignKeys: [],
    },
    sampleData,
    insights: {
      keyFindings: [],
      trends: [],
      anomalies: [],
      suggestedQueries: [],
      recommendations: [],
    },
    quality: {},
    security: {},
    aggregations: {},
    indexes: {},
  } as any;
}

/**
 * Process semantic query using orchestrator workflow
 */
async function processSemanticQueryWorkflow(
  orchestrator: AgentOrchestrator,
  query: string,
  profile: any
): Promise<any> {
  // Create execution context
  const context = {
    requestId: `semantic-${Date.now()}`,
    startTime: new Date(),
    timeout: 30000,
  };

  // Get agents
  const queryPlannerAgent = orchestrator.getAgent('query-planning' as any);
  const semanticExecutorAgent = orchestrator.getAgent(
    'semantic-executor' as any
  );

  if (!queryPlannerAgent || !semanticExecutorAgent) {
    throw new Error('Semantic agents not available');
  }

  // Step 1: Query Planning
  const planningResult = await queryPlannerAgent.execute(
    { query, profile },
    context
  );

  if (!planningResult.success) {
    throw planningResult.error || new Error('Query planning failed');
  }

  const { queryIntent, executionPlan } = planningResult.data as any;

  // Step 2: Semantic Execution
  const executionResult = await semanticExecutorAgent.execute(
    { queryIntent, profile, executionPlan },
    context
  );

  if (!executionResult.success) {
    throw executionResult.error || new Error('Semantic execution failed');
  }

  const semanticResult = executionResult.data as any;

  // Return structured result
  return {
    id: `analysis-${Date.now()}`,
    query,
    intent: queryIntent,
    executionPlan,
    data: semanticResult.data || [],
    insights: [
      ...(semanticResult.insights.keyFindings || []).map((finding: string) => ({
        type: 'insight' as const,
        content: finding,
        confidence: 0.9,
      })),
      ...(semanticResult.insights.trends || []).map((trend: any) => ({
        type: 'trend' as const,
        content: `${trend.metric} is ${trend.direction} with ${trend.changePercent}% change`,
        confidence: 0.8,
      })),
    ],
    metadata: {
      executionTime: semanticResult.metadata.executionTime,
      dataPoints:
        semanticResult.data?.length || profile.sampleData?.length || 0,
      cacheHit: false,
      agentPath: ['query-planning', 'semantic-executor'],
    },
    suggestions: semanticResult.suggestions || [],
  };
}

// Process a queued run (follow-up question)
async function processQueuedRun(
  queuedRun: QueuedRun,
  send: (event: StreamEvent) => void
): Promise<void> {
  const startTime = Date.now();

  try {
    console.log(`Processing queued run: ${queuedRun.id}`);

    // Send run started event
    send({
      type: 'run.started',
      data: {
        runId: queuedRun.id,
        threadId: queuedRun.threadId,
        status: 'running',
        startTime,
      },
      timestamp: Date.now(),
    });

    // Try semantic processing first, fallback to conversationManager if needed
    let useSemanticResult = false;
    let semanticAnalysisResult: any = null;

    // Get CSV content if available for semantic processing
    let csvContent: string | undefined;
    if (queuedRun.fileId) {
      const fileBuffer = await fileStore.getFile(queuedRun.fileId);
      if (fileBuffer) {
        csvContent = fileBuffer.toString('utf-8');
      }
    }

    // Attempt semantic processing
    const semanticProcessing = await trySemanticProcessing(
      queuedRun.sessionId,
      queuedRun.query,
      csvContent
    );

    let analysisStream: AsyncIterable<any>;

    if (semanticProcessing.success && !semanticProcessing.shouldFallback) {
      console.log('✅ Using semantic layer for follow-up question');
      useSemanticResult = true;
      semanticAnalysisResult = semanticProcessing.result;

      // Create a synthetic stream for semantic results
      analysisStream = (async function* () {
        // Send structured output event for semantic results
        yield {
          type: 'structured_output',
          data: {
            type: 'analysis_response',
            content: JSON.stringify(semanticAnalysisResult),
          },
        };

        // Send completion event
        yield {
          type: 'done',
          data: { success: true },
        };
      })();
    } else {
      console.log(
        '⚠️ Falling back to conversation manager for follow-up question'
      );
      analysisStream = conversationManager.streamConversation(
        queuedRun.sessionId,
        queuedRun.query,
        queuedRun.fileId
      );
    }

    const messageId = `msg_${Date.now()}`;
    let accumulatedContent = '';
    let hasStructuredOutput = false; // Track if we've processed structured output
    const bufferedEvents: Array<{ delta: string; content: string }> = []; // Buffer content events

    for await (const event of analysisStream) {
      console.log(`Stream event received: ${event.type}`);

      if (event.type === 'content') {
        accumulatedContent += event.data.delta;

        // Buffer the content instead of sending immediately
        bufferedEvents.push({
          delta: event.data.delta,
          content: accumulatedContent,
        });
      } else if (event.type === 'structured_output') {
        // Handle structured analysis output for follow-up questions
        hasStructuredOutput = true;
        const analysisData = event.data;
        console.log(
          'Follow-up question returned structured analysis, processing...'
        );

        // Clear buffered events since we're using structured output instead
        bufferedEvents.length = 0;

        // Create artifacts and send formatted summary like initial analysis
        await handleStructuredAnalysisOutput(
          analysisData,
          queuedRun.sessionId,
          send
        );
      } else if (event.type === 'done') {
        // Send buffered content if we didn't process structured output
        if (!hasStructuredOutput && bufferedEvents.length > 0) {
          // Send all buffered content as delta events
          for (const bufferedEvent of bufferedEvents) {
            send({
              type: 'message.delta',
              data: {
                messageId,
                content: bufferedEvent.content,
                role: 'assistant',
                delta: bufferedEvent.delta,
              },
              timestamp: Date.now(),
            });
          }
        }
        // Only send final message if we haven't processed structured output
        if (!hasStructuredOutput) {
          // Send final message
          send({
            type: 'message.completed',
            data: {
              messageId,
              content: accumulatedContent,
              role: 'assistant',
            },
            timestamp: Date.now(),
          });
        }

        // Send run completed
        console.log('Follow-up question completed successfully');
        send({
          type: 'run.completed',
          data: {
            runId: queuedRun.id,
            threadId: queuedRun.threadId,
            status: 'completed',
            elapsedTime: Date.now() - startTime,
          },
          timestamp: Date.now(),
        });
        break;
      } else if (event.type === 'error') {
        console.error('Follow-up question error:', event.data.error);
        throw new Error(event.data.error || 'Analysis failed');
      }
    }
  } catch (error) {
    console.error('Failed to process queued run:', error);

    // Send run failed event
    send({
      type: 'run.failed',
      data: {
        runId: queuedRun.id,
        threadId: queuedRun.threadId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        elapsedTime: Date.now() - startTime,
      },
      timestamp: Date.now(),
    });

    throw error;
  }
}

// Real OpenAI streaming implementation using chat.completions
async function streamRealOpenAIRun(
  threadId: string,
  sessionId: string,
  send: (event: StreamEvent) => void
): Promise<{ runId: string; skipped?: boolean }> {
  let runId = '';
  const startTime = Date.now();

  // Check for recent runs to prevent duplicates
  const lastRunTime = recentRuns.get(threadId);
  if (lastRunTime && startTime - lastRunTime < RUN_COOLDOWN_MS) {
    console.log(
      `Skipping run for thread ${threadId} - cooldown period (${startTime - lastRunTime}ms ago)`
    );

    // Send a connection established event but don't create a new run
    send({
      type: 'connection.established',
      data: { threadId, sessionId, skipped: true },
      timestamp: startTime,
    });

    return { runId: 'skipped', skipped: true };
  }

  // Update last run time
  recentRuns.set(threadId, startTime);

  try {
    // Generate a run ID
    runId = `run_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    // Send run started event
    send({
      type: 'run.started',
      data: {
        runId,
        threadId,
        status: 'queued',
        startTime,
      },
      timestamp: Date.now(),
    });

    // Send queued status (brief delay to simulate queue)
    setTimeout(() => {
      send({
        type: 'run.queued',
        data: {
          runId,
          threadId,
          status: 'queued',
          queuePosition: 1,
        },
        timestamp: Date.now(),
      });
    }, 100);

    // Send in progress
    setTimeout(() => {
      send({
        type: 'run.in_progress',
        data: {
          runId,
          threadId,
          status: 'in_progress',
          elapsedTime: Date.now() - startTime,
        },
        timestamp: Date.now(),
      });
    }, 500);

    // Get conversation history for this session
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Stream analysis from conversation manager
    // For now, we'll use a generic message since this is typically triggered by file upload
    let userMessage = session.uploadedFile
      ? `Please analyze the uploaded CSV file: ${session.uploadedFile.filename}`
      : 'Please provide an analysis';

    // Get the CSV content if we have an uploaded file
    let csvContent: string | undefined;
    let wasDataSampled = false;

    if (session.uploadedFile) {
      try {
        const fileBuffer = await fileStore.getFile(session.uploadedFile.id);
        if (fileBuffer) {
          const fullCsvContent = fileBuffer.toString('utf-8');

          // Check if CSV is too large for OpenAI (10MB limit with some buffer)
          const maxSize = 8 * 1024 * 1024; // 8MB to leave room for other message content

          if (fullCsvContent.length > maxSize) {
            console.log(
              `CSV file too large (${fullCsvContent.length} bytes), sampling data...`
            );
            csvContent = sampleLargeCSV(fullCsvContent, maxSize);
            wasDataSampled = true;
          } else {
            csvContent = fullCsvContent;
          }
        }
      } catch (error) {
        console.error('Failed to read CSV file:', error);
      }
    }

    // Add sampling note if we sampled the data
    if (wasDataSampled) {
      const originalSize =
        (await fileStore.getFile(session.uploadedFile!.id))?.length || 0;
      userMessage += `\n\nNote: The CSV file was large (${Math.round(originalSize / 1024 / 1024)}MB), so I'm providing a representative sample of the data for analysis. The sample maintains the same structure and patterns as the full dataset.`;
    }

    // Determine if this is initial analysis or follow-up conversation
    const conversationHistory = conversationManager.getConversation(sessionId);
    const isInitialAnalysis = conversationHistory.length <= 1; // Only system message or empty

    // 🚨 CRITICAL FIX: For queued runs (follow-up questions), NEVER use structured analysis
    // The processQueuedRun function should handle all follow-up questions
    const queuedRun = runQueue.getCurrentRun(threadId);
    const isFollowUpRequest =
      queuedRun && queuedRun.status === 'running' && queuedRun.startedAt;

    if (isFollowUpRequest) {
      console.log(
        '🔥 DETECTED FOLLOW-UP REQUEST - Skipping main analysis logic, this should be handled by processQueuedRun only!'
      );
      console.log(
        '⚠️ This request should not continue through main analysis path'
      );
      // Return early - this should be handled by processQueuedRun only
      return {
        runId: queuedRun.id,
        skipped: true,
      };
    }

    console.log(`=== CONVERSATION DEBUG ===`);
    console.log(`SessionId: ${sessionId}`);
    console.log(`Conversation history length: ${conversationHistory.length}`);
    console.log(
      `Conversation history:`,
      conversationHistory.map(m => ({
        role: m.role,
        contentPreview: m.content.substring(0, 100) + '...',
        timestamp: m.timestamp,
      }))
    );
    console.log(`CSV content present: ${!!csvContent}`);
    console.log(`isInitialAnalysis: ${isInitialAnalysis}`);
    console.log(
      `Analysis type will be: ${isInitialAnalysis && csvContent ? 'structured analysis' : 'regular conversation'}`
    );
    console.log(`=========================`);

    console.log(
      `Analysis type: ${isInitialAnalysis ? 'initial' : 'follow-up'}, CSV present: ${!!csvContent}, conversation length: ${conversationHistory.length}`
    );

    let analysisStream;
    console.log('🚨 CRITICAL DEBUG: About to choose analysis type...');
    console.log(`🚨 isInitialAnalysis: ${isInitialAnalysis}`);
    console.log(`🚨 csvContent exists: ${!!csvContent}`);
    console.log(
      `🚨 Condition (isInitialAnalysis && csvContent): ${isInitialAnalysis && csvContent}`
    );

    if (isInitialAnalysis && csvContent) {
      // Use structured analysis for initial CSV analysis
      console.log(
        '🚨 USING STRUCTURED ANALYSIS - This should NOT happen for follow-up questions!'
      );
      analysisStream = conversationManager.streamAnalysis(
        sessionId,
        userMessage,
        csvContent
      );
    } else {
      // Use regular conversation for follow-up questions
      console.log(
        '🚨 USING REGULAR CONVERSATION - This is correct for follow-up questions'
      );
      analysisStream = conversationManager.streamConversation(
        sessionId,
        userMessage
      );
    }

    const messageId = `msg_${Date.now()}`;
    let accumulatedContent = '';
    const isStreamingStructured = isInitialAnalysis && csvContent;

    for await (const event of analysisStream) {
      // Stream event logging removed for clarity

      if (event.type === 'content') {
        accumulatedContent += event.data.delta;

        // For structured analysis, don't stream the raw JSON - wait for structured_output
        if (!isStreamingStructured) {
          // Content delta logged
          send({
            type: 'message.delta',
            data: {
              messageId,
              content: accumulatedContent,
              role: 'assistant',
              delta: event.data.delta,
            },
            timestamp: Date.now(),
          });
        }
      } else if (event.type === 'structured_output') {
        // Handle the structured analysis response
        const analysisData = event.data;
        console.log(
          'Received structured output, calling handleStructuredAnalysisOutput'
        );

        // Don't send the insight separately - let handleStructuredAnalysisOutput
        // send the complete formatted summary instead

        // Create artifacts and send summary content based on structured output
        await handleStructuredAnalysisOutput(analysisData, sessionId, send);
      } else if (event.type === 'done') {
        // Analysis completed successfully - send run completed
        console.log(`✅ Analysis completed successfully`);

        // For regular conversations, send a final message completion event
        if (!isStreamingStructured && accumulatedContent) {
          console.log('📝 Sending final message completion');
          send({
            type: 'message.completed',
            data: {
              messageId,
              content: accumulatedContent,
              role: 'assistant',
            },
            timestamp: Date.now(),
          });
        }

        send({
          type: 'run.completed',
          data: {
            runId,
            threadId,
            status: 'completed',
            elapsedTime: Date.now() - startTime,
          },
          timestamp: Date.now(),
        });
        break;
      } else if (event.type === 'error') {
        console.error('Analysis error received:', event.data.error);
        throw new Error(event.data.error || 'Analysis failed');
      }
    }

    return { runId };
  } catch (error) {
    console.error('Real OpenAI streaming failed:', error);

    // Send run failed event
    send({
      type: 'run.failed',
      data: {
        runId,
        threadId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        elapsedTime: Date.now() - startTime,
      },
      timestamp: Date.now(),
    });

    throw error;
  }
}

// Handle structured analysis output and create artifacts
async function handleStructuredAnalysisOutput(
  analysisData: any,
  sessionId: string,
  send: (event: StreamEvent) => void
) {
  try {
    console.log('handleStructuredAnalysisOutput called with:', {
      hasInsight: !!analysisData.insight,
      insightLength: analysisData.insight?.length || 0,
      hasFiles: !!analysisData.files,
      filesCount: analysisData.files?.length || 0,
      hasMetadata: !!analysisData.metadata,
    });

    // Process any generated files and create artifacts for them
    const processedFiles = [];
    let imageContent = '';

    if (analysisData.files && Array.isArray(analysisData.files)) {
      // Import dynamic chart generator
      const { generateDynamicChart } = await import(
        '@/lib/svg-chart-generator'
      );

      for (const file of analysisData.files) {
        if (file.path && file.type) {
          try {
            // Generate chart content based on file type
            if (file.type === 'image' && file.purpose === 'chart') {
              console.log(`Generating dynamic chart for: ${file.path}`);

              // Generate SVG chart using real data from AI analysis
              const chartResult = await generateDynamicChart(analysisData);

              if (chartResult) {
                // Extract artifact ID from the path
                const artifactId =
                  chartResult.path.split('/').pop()?.split('.')[0] || 'chart';

                console.log(
                  `Generated chart available at: ${chartResult.path}`
                );

                // Add processed file info
                processedFiles.push({
                  ...file,
                  artifactId,
                  downloadUrl: chartResult.path,
                });

                // Add it to the content for inline display
                const imageTitle = analysisData.chart_data?.title || 'Chart';
                imageContent += `\n\n## ${imageTitle}\n\n![${imageTitle}](${chartResult.path})\n\n*${file.purpose || 'Generated visualization'}*\n`;

                console.log(
                  `Successfully generated chart: ${file.path} -> ${chartResult.path}`
                );
              } else {
                console.warn('Chart generation returned no result');
              }
            } else {
              console.log(
                `Skipping file processing: ${file.path} (type: ${file.type}, purpose: ${file.purpose})`
              );
            }
          } catch (error) {
            console.error(`Error processing file ${file.path}:`, error);
          }
        }
      }
    }

    // Create summary artifact from structured response
    const summaryContent = `# Analysis Summary

${analysisData.insight}

${imageContent}

## Generated Files
${
  processedFiles.length > 0
    ? processedFiles
        .map(f => {
          if (f.status === 'error') {
            return `- ${f.path} (${f.type}): ${f.purpose} - ⚠️ ${f.error}`;
          } else if (f.status === 'pending') {
            return `- ${f.path} (${f.type}): ${f.purpose} - 📋 ${f.note}`;
          } else if (f.downloadUrl) {
            return `- [${f.path}](${f.downloadUrl}) (${f.type}): ${f.purpose}`;
          }
          return `- ${f.path} (${f.type}): ${f.purpose}`;
        })
        .join('\n')
    : 'No files generated'
}

## Metadata
- Analysis Type: ${analysisData.metadata?.analysis_type || 'Unknown'}
- Columns Used: ${analysisData.metadata?.columns_used?.join(', ') || 'None specified'}
${analysisData.metadata?.pii_columns?.length ? `- PII Columns: ${analysisData.metadata.pii_columns.join(', ')}` : ''}

Generated on: ${new Date().toISOString()}
`;

    console.log('Created summary content:', {
      length: summaryContent.length,
      preview: summaryContent.substring(0, 200) + '...',
      processedFilesCount: processedFiles.length,
      hasImageContent: imageContent.length > 0,
    });

    const summaryArtifact = await fileStore.storeArtifact(
      sessionId,
      'analysis_summary',
      Buffer.from(summaryContent, 'utf-8'),
      'md'
    );

    // Update session with summary artifact
    const session = sessionStore.getSession(sessionId);
    if (session) {
      session.artifacts.push({
        id: summaryArtifact.id,
        name: summaryArtifact.originalName,
        type: 'file',
        size: summaryArtifact.size,
        checksum: summaryArtifact.checksum,
        createdAt: summaryArtifact.createdAt,
      });

      sessionStore.updateSession(sessionId, {
        artifacts: session.artifacts,
        metrics: {
          ...session.metrics,
          artifactsGenerated: session.metrics.artifactsGenerated + 1,
        },
      });
    }

    // Send the summary content as a message with inline images
    const summaryMessageId = `summary_${Date.now()}`;
    console.log(
      'Sending message.completed event with enhanced summary content including inline images'
    );
    send({
      type: 'message.completed',
      data: {
        messageId: summaryMessageId,
        content: summaryContent,
        role: 'assistant',
      },
      timestamp: Date.now(),
    });

    // Send artifact event for the summary
    console.log('Sending artifact.created event for summary');
    send({
      type: 'artifact.created',
      data: {
        artifactId: summaryArtifact.id,
        filename: summaryArtifact.originalName,
        type: 'file',
        purpose: 'analysis',
        downloadUrl: `/api/artifacts/${summaryArtifact.id}/download`,
        suppressMessage: true, // Flag to prevent creating a separate message
      },
      timestamp: Date.now(),
    });

    console.log('handleStructuredAnalysisOutput completed successfully');
  } catch (error) {
    console.error('Failed to handle structured analysis output:', error);
  }
}

// Handle artifacts from manifest
async function handleManifestArtifacts(
  manifest: any,
  sessionId: string,
  send: (event: StreamEvent) => void
) {
  try {
    // Create summary artifact from manifest insight
    const summaryContent = `# Analysis Summary

${manifest.insight}

## Generated Files
${manifest.files?.map((f: any) => `- ${f.path} (${f.type}): ${f.purpose}`).join('\n') || 'No files generated'}

## Metadata
${Object.entries(manifest.metadata || {})
  .map(([key, value]) => `- ${key}: ${value}`)
  .join('\n')}

Generated on: ${new Date().toISOString()}
`;

    const artifact = await fileStore.storeArtifact(
      sessionId,
      'analysis_summary',
      Buffer.from(summaryContent, 'utf-8'),
      'md'
    );

    // Update session
    const session = sessionStore.getSession(sessionId);
    if (session) {
      session.artifacts.push({
        id: artifact.id,
        name: artifact.originalName,
        type: 'file',
        size: artifact.size,
        checksum: artifact.checksum,
        createdAt: artifact.createdAt,
      });

      sessionStore.updateSession(sessionId, {
        artifacts: session.artifacts,
        metrics: {
          ...session.metrics,
          artifactsGenerated: session.metrics.artifactsGenerated + 1,
        },
      });
    }

    // Send artifact event
    send({
      type: 'artifact.created',
      data: {
        artifactId: artifact.id,
        filename: artifact.originalName,
        type: 'file',
        purpose: 'summary',
        downloadUrl: `/api/artifacts/${artifact.id}/download`,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Failed to handle manifest artifacts:', error);
  }
}

// Simulate streaming run for demo purposes
async function simulateStreamingRun(
  threadId: string,
  sessionId: string,
  send: (event: StreamEvent) => void
) {
  const runId = `run_${Date.now()}`;
  const startTime = Date.now();

  // Send run started event
  send({
    type: 'run.started',
    data: {
      runId,
      threadId,
      status: 'queued',
      startTime,
    },
    timestamp: Date.now(),
  });

  // Simulate queue delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // Send queued status
  send({
    type: 'run.queued',
    data: {
      runId,
      threadId,
      status: 'queued',
      queuePosition: 1,
    },
    timestamp: Date.now(),
  });

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Send run in progress
  send({
    type: 'run.in_progress',
    data: {
      runId,
      threadId,
      status: 'in_progress',
      elapsedTime: Date.now() - startTime,
    },
    timestamp: Date.now(),
  });

  // Simulate message deltas (streaming text)
  const messageId = `msg_${Date.now()}`;
  const profileText = `# Data Profile

I've analyzed your CSV file and here's what I found:

**Dataset Overview:**
- Rows: 1,247
- Columns: 8
- Data Quality: Good (minimal missing values)

**Column Analysis:**
- order_date: Date values (2023-2024 range)
- customer_id: Unique identifiers
- product_sku: Product codes
- quantity: Numeric (1-50 range)
- unit_price: Currency values ($5-$500)
- channel: Categorical (online, retail, wholesale)
- region: Geographic (North, South, East, West)
- discount_pct: Percentage (0-30%)

**Key Insights:**
- No PII detected in this dataset
- Strong data consistency across all columns
- Ready for analysis

**Suggested Analyses:**
1. Revenue trends over time
2. Top performing products
3. Channel performance comparison
4. Regional sales analysis
5. Discount impact analysis`;

  // Send message deltas to simulate streaming
  const words = profileText.split(' ');
  let currentContent = '';

  for (let i = 0; i < words.length; i += 3) {
    const chunk = words.slice(i, i + 3).join(' ') + ' ';
    currentContent += chunk;

    send({
      type: 'message.delta',
      data: {
        messageId,
        content: currentContent,
        role: 'assistant',
        delta: chunk,
      },
      timestamp: Date.now(),
    });

    // Small delay between chunks
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Create the summary content first
  const summaryContent = `# Data Profile Summary

## Dataset Overview
- **Rows:** 1,247
- **Columns:** 8
- **File Size:** 156 KB
- **Data Quality:** Good

## Column Details
| Column | Type | Missing % | Sample Values |
|--------|------|-----------|---------------|
| order_date | Date | 0% | 2024-01-15, 2024-02-03 |
| customer_id | String | 0% | CUST_001, CUST_002 |
| product_sku | String | 0% | SKU_A123, SKU_B456 |
| quantity | Integer | 0% | 1, 5, 12 |
| unit_price | Float | 0% | 29.99, 149.50 |
| channel | String | 0% | online, retail |
| region | String | 0% | North, South |
| discount_pct | Float | 2% | 0, 10, 15 |

## Data Quality Assessment
- ✅ No PII detected
- ✅ Consistent date formats
- ✅ Valid numeric ranges
- ✅ Clean categorical values
- ⚠️ Minor missing values in discount_pct (2%)

## Recommended Next Steps
1. **Revenue Analysis**: Analyze trends over time
2. **Product Performance**: Identify top SKUs
3. **Channel Comparison**: Compare online vs retail
4. **Regional Insights**: Geographic performance
5. **Discount Impact**: Effect on sales volume

Generated on: ${new Date().toISOString()}
`;

  // Send the summary content as a message instead of just the streaming text
  send({
    type: 'message.completed',
    data: {
      messageId,
      content: summaryContent, // Show the full summary content
      role: 'assistant',
    },
    timestamp: Date.now(),
  });

  try {
    // Store the summary artifact
    const artifact = await fileStore.storeArtifact(
      sessionId,
      'profile_summary',
      Buffer.from(summaryContent, 'utf-8'),
      'md'
    );

    // Update session with artifact
    const session = sessionStore.getSession(sessionId);
    if (session) {
      session.artifacts.push({
        id: artifact.id,
        name: artifact.originalName,
        type: 'file',
        size: artifact.size,
        checksum: artifact.checksum,
        createdAt: artifact.createdAt,
      });

      sessionStore.updateSession(sessionId, {
        artifacts: session.artifacts,
        metrics: {
          ...session.metrics,
          artifactsGenerated: session.metrics.artifactsGenerated + 1,
        },
      });
    }

    // Still send artifact event for the artifacts panel, but don't show a separate message
    send({
      type: 'artifact.created',
      data: {
        artifactId: artifact.id,
        filename: artifact.originalName,
        type: 'file',
        purpose: 'profile',
        downloadUrl: `/api/artifacts/${artifact.id}/download`,
        suppressMessage: true, // Flag to prevent creating a separate message
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Failed to create artifact:', error);
  }

  // Send run completed
  send({
    type: 'run.completed',
    data: {
      runId,
      threadId,
      status: 'completed',
      elapsedTime: Date.now() - startTime,
    },
    timestamp: Date.now(),
  });

  // Clean up simulated run tracking
  cleanupRunFromQuery(runId);
}

// Helper function to sample large CSV files
function sampleLargeCSV(csvContent: string, maxSize: number): string {
  const lines = csvContent.split('\n');

  if (lines.length <= 1) {
    return csvContent; // No data to sample
  }

  // Always include the header
  const header = lines[0] || '';
  const dataLines = lines.slice(1).filter(line => line.trim()); // Remove empty lines

  // Calculate how many lines we can fit
  const avgLineSize = csvContent.length / lines.length;
  const maxDataLines =
    Math.floor((maxSize - header.length) / avgLineSize) - 100; // Buffer for safety

  if (dataLines.length <= maxDataLines) {
    return csvContent; // No sampling needed
  }

  // Sample evenly distributed rows
  const sampleStep = Math.floor(dataLines.length / maxDataLines);
  const sampledLines = [];

  for (let i = 0; i < dataLines.length; i += sampleStep) {
    sampledLines.push(dataLines[i]);
    if (sampledLines.length >= maxDataLines) break;
  }

  const sampledCsv = [header, ...sampledLines].join('\n');

  // Add a note about sampling
  console.log(
    `Sampled CSV: ${dataLines.length} rows → ${sampledLines.length} rows (${sampledCsv.length} bytes)`
  );

  return sampledCsv;
}

// Helper function to categorize errors
function categorizeError(
  errorMessage: string
): 'user_error' | 'system_error' | 'timeout_error' | 'api_error' {
  const message = errorMessage.toLowerCase();

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout_error';
  } else if (
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('insufficient')
  ) {
    return 'api_error';
  } else if (
    message.includes('missing columns') ||
    message.includes('invalid data') ||
    message.includes('format')
  ) {
    return 'user_error';
  } else {
    return 'system_error';
  }
}

// Helper function to clean up run tracking
function cleanupRunFromQuery(runId: string) {
  try {
    cleanupRun(runId);
  } catch (error) {
    console.warn('Failed to cleanup run:', error);
  }
}
