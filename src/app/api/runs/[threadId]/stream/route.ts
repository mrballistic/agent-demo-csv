import { NextRequest, NextResponse } from 'next/server';
import { assistantManager, extractManifest } from '@/lib/openai';
import { sessionStore } from '@/lib/session-store';
import { fileStore } from '@/lib/file-store';
import { runQueue } from '@/lib/run-queue';
import { cleanupRun } from '@/lib/run-cleanup';

export const runtime = 'nodejs';

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

  // Create Server-Sent Events stream
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: StreamEvent) => {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // Send initial connection event
      send({
        type: 'connection.established',
        data: { threadId, sessionId: session.id },
        timestamp: Date.now(),
      });

      // Start streaming the run
      (async () => {
        try {
          // Check if we have a real OpenAI API key for streaming
          const hasOpenAIKey =
            process.env.OPENAI_API_KEY &&
            process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';

          if (hasOpenAIKey) {
            // Use real OpenAI streaming
            await streamRealOpenAIRun(threadId, session.id, send);
          } else {
            // Fall back to simulation for demo
            await simulateStreamingRun(threadId, session.id, send);
          }

          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          send({
            type: 'error',
            data: {
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            timestamp: Date.now(),
          });
          controller.close();
        }
      })();
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

// Real OpenAI streaming implementation
async function streamRealOpenAIRun(
  threadId: string,
  sessionId: string,
  send: (event: StreamEvent) => void
) {
  let runId = '';
  const startTime = Date.now();

  try {
    const result = await assistantManager.processStreamingRun(
      threadId,
      event => {
        // Transform OpenAI events to our format
        const timestamp = Date.now();

        switch (event.event) {
          case 'thread.run.created':
            runId = event.data.id;
            send({
              type: 'run.started',
              data: {
                runId: event.data.id,
                threadId,
                status: 'queued',
                startTime,
              },
              timestamp,
            });
            break;

          case 'thread.run.queued':
            const queuePosition = runQueue.getQueuePosition(runId) || 1;
            send({
              type: 'run.queued',
              data: {
                runId: event.data.id,
                threadId,
                status: 'queued',
                queuePosition,
              },
              timestamp,
            });
            break;

          case 'thread.run.in_progress':
            // Mark run as started in queue
            runQueue.markRunStarted(runId, event.data.id);
            send({
              type: 'run.in_progress',
              data: {
                runId: event.data.id,
                threadId,
                status: 'in_progress',
                elapsedTime: Date.now() - startTime,
              },
              timestamp,
            });
            break;

          case 'thread.run.completed':
            // Mark run as completed in queue
            runQueue.markRunCompleted(runId, true);
            send({
              type: 'run.completed',
              data: {
                runId: event.data.id,
                threadId,
                status: 'completed',
                elapsedTime: Date.now() - startTime,
              },
              timestamp,
            });
            // Clean up run tracking
            cleanupRunFromQuery(event.data.id);
            break;

          case 'thread.run.failed':
            const errorMessage = event.data.last_error?.message || 'Run failed';
            const errorType = categorizeError(errorMessage);

            // Mark run as failed in queue
            runQueue.markRunCompleted(runId, false, errorMessage);

            send({
              type: 'run.failed',
              data: {
                runId: event.data.id,
                threadId,
                status: 'failed',
                error: errorMessage,
                errorType,
                retryable: errorType !== 'user_error',
                elapsedTime: Date.now() - startTime,
              },
              timestamp,
            });
            // Clean up run tracking
            cleanupRunFromQuery(event.data.id);
            break;

          case 'thread.run.cancelled':
            // Mark run as cancelled in queue
            runQueue.cancelRun(runId);

            send({
              type: 'run.cancelled',
              data: {
                runId: event.data.id,
                threadId,
                status: 'cancelled',
                elapsedTime: Date.now() - startTime,
              },
              timestamp,
            });
            // Clean up run tracking
            cleanupRunFromQuery(event.data.id);
            break;

          case 'thread.message.delta':
            if (event.data.delta?.content) {
              const textDelta = event.data.delta.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text?.value || '')
                .join('');

              if (textDelta) {
                send({
                  type: 'message.delta',
                  data: {
                    messageId: event.data.id,
                    content: textDelta,
                    role: 'assistant',
                    delta: textDelta,
                  },
                  timestamp,
                });
              }
            }
            break;

          case 'thread.message.completed':
            if (event.data.role === 'assistant') {
              const textContent = event.data.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text?.value || '')
                .join('');

              send({
                type: 'message.completed',
                data: {
                  messageId: event.data.id,
                  content: textContent,
                  role: 'assistant',
                },
                timestamp,
              });
            }
            break;

          case 'artifact.created':
            // Handle artifacts created from manifest
            if (event.data.manifest) {
              handleManifestArtifacts(event.data.manifest, sessionId, send);
            }
            break;
        }
      }
    );

    console.log('Real OpenAI streaming completed:', result);
  } catch (error) {
    console.error('Real OpenAI streaming failed:', error);

    // Send error event
    const errorType = categorizeError(
      error instanceof Error ? error.message : 'Unknown error'
    );
    send({
      type: 'run.failed',
      data: {
        runId: runId || `error_${Date.now()}`,
        threadId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType,
        retryable: errorType !== 'user_error',
        elapsedTime: Date.now() - startTime,
      },
      timestamp: Date.now(),
    });

    // Clean up if we have a runId
    if (runId) {
      cleanupRunFromQuery(runId);
    }

    throw error;
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

  // Send message completed
  send({
    type: 'message.completed',
    data: {
      messageId,
      content: currentContent,
      role: 'assistant',
    },
    timestamp: Date.now(),
  });

  // Create and store the summary artifact
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

    // Send artifact created event
    send({
      type: 'artifact.created',
      data: {
        artifactId: artifact.id,
        filename: artifact.originalName,
        type: 'file',
        purpose: 'profile',
        downloadUrl: `/api/artifacts/${artifact.id}/download`,
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
