'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessage } from '@/types';

interface StreamEvent {
  type: string;
  data: any;
  timestamp: number;
}

interface UseChatOptions {
  threadId?: string | undefined;
  onArtifactCreated?: (artifact: any) => void;
  onRunStatusChange?: (
    status: 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  ) => void;
  onQueueUpdate?: (position?: number, estimatedWaitTime?: number) => void;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isConnected: boolean;
  isRunning: boolean;
  runStatus:
    | 'idle'
    | 'queued'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled';
  connectionError: string | null;
  sendMessage: (content: string, fileId?: string | null) => Promise<void>;
  cancelRun: () => Promise<void>;
  clearMessages: () => void;
  addMessage: (message: ChatMessage) => void;
  resetConnection: () => void;
}

export function useChat({
  threadId,
  onArtifactCreated,
  onRunStatusChange,
  onQueueUpdate,
}: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<
    'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  >('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const currentRunIdRef = useRef<string | null>(null);
  const lastConnectionTimeRef = useRef<number>(0);
  const messageCounterRef = useRef<number>(0); // Counter for unique message IDs
  const isConnectingRef = useRef<boolean>(false); // Prevent multiple simultaneous connections
  const shouldReconnectRef = useRef<boolean>(true); // Control reconnection behavior
  const CONNECTION_DEBOUNCE_MS = 5000; // 5 seconds between reconnections

  // Create refs for callbacks to avoid dependencies
  const onArtifactCreatedRef = useRef(onArtifactCreated);
  const onRunStatusChangeRef = useRef(onRunStatusChange);
  const onQueueUpdateRef = useRef(onQueueUpdate);

  // Update refs when props change
  useEffect(() => {
    onArtifactCreatedRef.current = onArtifactCreated;
    onRunStatusChangeRef.current = onRunStatusChange;
    onQueueUpdateRef.current = onQueueUpdate;
  }, [onArtifactCreated, onRunStatusChange, onQueueUpdate]);

  // Handle message deltas for streaming
  const handleMessageDelta = useCallback((data: any) => {
    const { messageId, content } = data;

    setMessages(prev => {
      const existingIndex = prev.findIndex(msg => msg.id === messageId);

      if (existingIndex >= 0) {
        // Update existing message
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          content: content,
        } as ChatMessage;
        return updated;
      } else {
        // Create new streaming message
        const newMessage: ChatMessage = {
          id: messageId,
          role: 'assistant',
          content: content,
          timestamp: new Date(),
        };
        return [...prev, newMessage];
      }
    });
  }, []);

  // Handle completed messages
  const handleMessageCompleted = useCallback((data: any) => {
    const { messageId, content } = data;

    setMessages(prev => {
      const existingIndex = prev.findIndex(msg => msg.id === messageId);
      if (existingIndex >= 0) {
        // Update existing message
        return prev.map(msg =>
          msg.id === messageId ? { ...msg, content } : msg
        );
      } else {
        // Create new message if it doesn't exist
        const newMessage: ChatMessage = {
          id: messageId,
          role: 'assistant',
          content: content,
          timestamp: new Date(),
        };
        return [...prev, newMessage];
      }
    });
  }, []);

  // Handle run failures
  const handleRunFailed = useCallback((data: any) => {
    const errorType = data.errorType || 'system_error';
    const retryable = data.retryable !== false;

    let errorContent = `❌ Analysis failed: ${data.error || 'Unknown error'}`;

    // Add retry suggestion for retryable errors
    if (retryable) {
      if (errorType === 'timeout_error') {
        errorContent += '\n\n💡 Try with a smaller dataset or simpler query.';
      } else if (errorType === 'api_error') {
        errorContent += '\n\n💡 Please wait a moment and try again.';
      } else {
        errorContent += '\n\n💡 Click to retry your request.';
      }
    }

    const errorMessage: ChatMessage = {
      id: `error_${Date.now()}`,
      role: 'system',
      content: errorContent,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, errorMessage]);
  }, []);

  // Handle artifact creation
  const handleArtifactCreated = useCallback((data: any) => {
    const artifactMessage: ChatMessage = {
      id: `artifact_${Date.now()}`,
      role: 'system',
      content: `📄 Created: ${data.filename}`,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, artifactMessage]);
  }, []);

  // Set up SSE connection - only when we have a valid threadId
  useEffect(() => {
    // Skip logging and processing for invalid threadIds to reduce noise
    if (!threadId || threadId === 'undefined' || threadId.startsWith('null')) {
      // Only log if we have some threadId value (not null/undefined)
      if (threadId) {
        console.log(
          '[useChat] Skipping SSE setup for invalid threadId:',
          threadId
        );
      }

      // Cleanup when no valid threadId
      if (eventSourceRef.current) {
        console.log(
          '[useChat] Closing existing EventSource (no valid threadId)'
        );
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
      lastConnectionTimeRef.current = 0;
      isConnectingRef.current = false;
      // Reset reconnection flag for new analysis
      shouldReconnectRef.current = true;
      return;
    }

    console.log('[useChat] SSE useEffect triggered with threadId:', threadId);

    // Don't reconnect if we've been explicitly disabled
    if (!shouldReconnectRef.current) {
      console.log(
        '[useChat] Reconnection disabled, skipping connection attempt'
      );
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current) {
      console.log('[useChat] Already connecting, skipping duplicate attempt');
      return;
    }

    // Client-side debouncing to prevent rapid reconnections
    const now = Date.now();
    const timeSinceLastConnection = now - lastConnectionTimeRef.current;
    if (
      timeSinceLastConnection < CONNECTION_DEBOUNCE_MS &&
      eventSourceRef.current
    ) {
      console.log(
        `[useChat] Skipping connection - too soon (${timeSinceLastConnection}ms ago)`
      );
      return;
    }

    // Don't reconnect if explicitly disabled
    if (!shouldReconnectRef.current) {
      console.log('[useChat] Reconnection disabled, skipping');
      return;
    }

    // Close existing connection before creating new one
    if (eventSourceRef.current) {
      console.log(
        '[useChat] Closing existing EventSource before creating new one'
      );
      eventSourceRef.current.close();
    }

    console.log('[useChat] Creating new EventSource for threadId:', threadId);
    isConnectingRef.current = true;
    lastConnectionTimeRef.current = now;
    const eventSource = new EventSource(`/api/runs/${threadId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[useChat] EventSource connection opened');
      setIsConnected(true);
      setConnectionError(null);
      isConnectingRef.current = false;
    };

    eventSource.onmessage = event => {
      try {
        const streamEvent: StreamEvent = JSON.parse(event.data);

        switch (streamEvent.type) {
          case 'connection.established':
            setIsConnected(true);
            setConnectionError(null);
            break;

          case 'connection.heartbeat':
            // Keep-alive signal, just update timestamp but don't change state
            console.log('[useChat] Received heartbeat, connection alive');
            break;

          case 'run.started':
            setIsRunning(true);
            setRunStatus('queued');
            currentRunIdRef.current = streamEvent.data.runId;
            onRunStatusChangeRef.current?.('queued');
            break;

          case 'run.queued':
            setRunStatus('queued');
            onRunStatusChangeRef.current?.('queued');
            onQueueUpdateRef.current?.(
              streamEvent.data.queuePosition,
              streamEvent.data.estimatedWaitTime
            );
            // Add queue position message if available
            if (streamEvent.data.queuePosition) {
              messageCounterRef.current += 1;
              const queueMessage: ChatMessage = {
                id: `queue_${Date.now()}_${messageCounterRef.current}`,
                role: 'system',
                content: `⏳ Queued (position ${streamEvent.data.queuePosition})`,
                timestamp: new Date(),
              };

              setMessages(prev => {
                // Check for duplicate by ID or similar content
                const isDuplicate = prev.some(
                  msg =>
                    msg.id === queueMessage.id ||
                    (msg.role === queueMessage.role &&
                      msg.content === queueMessage.content &&
                      Math.abs(
                        msg.timestamp.getTime() -
                          queueMessage.timestamp.getTime()
                      ) < 1000)
                );

                if (isDuplicate) {
                  console.log(
                    '[useChat] Preventing duplicate message:',
                    queueMessage.id
                  );
                  return prev;
                }

                return [...prev, queueMessage];
              });
            }
            break;

          case 'run.in_progress':
            setIsRunning(true);
            setRunStatus('running');
            onRunStatusChangeRef.current?.('running');
            onQueueUpdateRef.current?.(undefined, undefined); // Clear queue info
            break;

          case 'message.delta':
            {
              const { messageId, content } = streamEvent.data;
              setMessages(prev => {
                const existingIndex = prev.findIndex(
                  msg => msg.id === messageId
                );
                if (existingIndex >= 0) {
                  const updated = [...prev];
                  updated[existingIndex] = {
                    ...updated[existingIndex],
                    content: content,
                  } as ChatMessage;
                  return updated;
                } else {
                  const newMessage: ChatMessage = {
                    id: messageId,
                    role: 'assistant',
                    content: content,
                    timestamp: new Date(),
                  };
                  return [...prev, newMessage];
                }
              });
            }
            break;

          case 'message.completed':
            {
              const { messageId, content } = streamEvent.data;
              setMessages(prev => {
                const existingIndex = prev.findIndex(
                  msg => msg.id === messageId
                );
                if (existingIndex >= 0) {
                  // Update existing message
                  return prev.map(msg =>
                    msg.id === messageId ? { ...msg, content } : msg
                  );
                } else {
                  // Create new message if it doesn't exist
                  const newMessage: ChatMessage = {
                    id: messageId,
                    role: 'assistant',
                    content: content,
                    timestamp: new Date(),
                  };
                  return [...prev, newMessage];
                }
              });
            }
            break;

          case 'run.completed':
            setIsRunning(false);
            setRunStatus('completed');
            currentRunIdRef.current = null;
            onRunStatusChangeRef.current?.('completed');
            onQueueUpdateRef.current?.(undefined, undefined); // Clear queue info

            // Keep connection alive for follow-up questions
            // Don't close the stream after completion
            console.log(
              '[useChat] Run completed, connection remains open for follow-ups'
            );
            break;

          case 'run.failed':
            setIsRunning(false);
            setRunStatus('failed');
            currentRunIdRef.current = null;
            onRunStatusChangeRef.current?.('failed');
            onQueueUpdateRef.current?.(undefined, undefined); // Clear queue info
            {
              const errorType = streamEvent.data.errorType || 'system_error';
              const retryable = streamEvent.data.retryable !== false;
              let errorContent = `❌ Analysis failed: ${streamEvent.data.error || 'Unknown error'}`;
              if (retryable) {
                if (errorType === 'timeout_error') {
                  errorContent +=
                    '\\n\\n💡 Try with a smaller dataset or simpler query.';
                } else if (errorType === 'api_error') {
                  errorContent +=
                    '\\n\\n💡 Please wait a moment and try again.';
                } else {
                  errorContent += '\\n\\n💡 Click to retry your request.';
                }
              }
              messageCounterRef.current += 1;
              const errorMessage: ChatMessage = {
                id: `error_${Date.now()}_${messageCounterRef.current}`,
                role: 'system',
                content: errorContent,
                timestamp: new Date(),
              };

              setMessages(prev => {
                const isDuplicate = prev.some(
                  msg =>
                    msg.id === errorMessage.id ||
                    (msg.role === errorMessage.role &&
                      msg.content === errorMessage.content &&
                      Math.abs(
                        msg.timestamp.getTime() -
                          errorMessage.timestamp.getTime()
                      ) < 1000)
                );

                if (isDuplicate) {
                  console.log(
                    '[useChat] Preventing duplicate message:',
                    errorMessage.id
                  );
                  return prev;
                }

                return [...prev, errorMessage];
              });
            }
            break;

          case 'run.cancelled':
            setIsRunning(false);
            setRunStatus('cancelled');
            currentRunIdRef.current = null;
            onRunStatusChangeRef.current?.('cancelled');
            onQueueUpdateRef.current?.(undefined, undefined); // Clear queue info
            messageCounterRef.current += 1;
            const cancelMessage: ChatMessage = {
              id: `cancel_${Date.now()}_${messageCounterRef.current}`,
              role: 'system',
              content: '🛑 Analysis cancelled',
              timestamp: new Date(),
            };

            setMessages(prev => {
              const isDuplicate = prev.some(
                msg =>
                  msg.id === cancelMessage.id ||
                  (msg.role === cancelMessage.role &&
                    msg.content === cancelMessage.content &&
                    Math.abs(
                      msg.timestamp.getTime() -
                        cancelMessage.timestamp.getTime()
                    ) < 1000)
              );

              if (isDuplicate) {
                console.log(
                  '[useChat] Preventing duplicate message:',
                  cancelMessage.id
                );
                return prev;
              }

              return [...prev, cancelMessage];
            });
            break;

          case 'artifact.created':
            onArtifactCreatedRef.current?.(streamEvent.data);

            // Only create a message if suppressMessage is not true
            if (!streamEvent.data.suppressMessage) {
              messageCounterRef.current += 1;
              const artifactMessage: ChatMessage = {
                id: `artifact_${Date.now()}_${messageCounterRef.current}`,
                role: 'system',
                content: `📄 Created: ${streamEvent.data.filename}`,
                timestamp: new Date(),
              };

              setMessages(prev => {
                const isDuplicate = prev.some(
                  msg =>
                    msg.id === artifactMessage.id ||
                    (msg.role === artifactMessage.role &&
                      msg.content === artifactMessage.content &&
                      Math.abs(
                        msg.timestamp.getTime() -
                          artifactMessage.timestamp.getTime()
                      ) < 1000)
                );

                if (isDuplicate) {
                  console.log(
                    '[useChat] Preventing duplicate message:',
                    artifactMessage.content
                  );
                  return prev;
                }

                return [...prev, artifactMessage];
              });
            }
            break;

          case 'error':
            setConnectionError(streamEvent.data.error);
            setIsRunning(false);
            setRunStatus('failed');
            onRunStatusChangeRef.current?.('failed');
            onQueueUpdateRef.current?.(undefined, undefined); // Clear queue info
            break;
        }
      } catch (error) {
        console.error('Failed to parse stream event:', error);
      }
    };

    eventSource.onerror = error => {
      console.log('[useChat] EventSource error event fired');
      setIsConnected(false);
      isConnectingRef.current = false;

      // Clean up current connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Check the readyState to understand the type of closure
      const eventSource = error.target as EventSource;

      // If readyState is CLOSED, this is likely normal completion, not an error
      if (eventSource?.readyState === EventSource.CLOSED) {
        console.log(
          '[useChat] Stream closed normally, enabling auto-reconnect for follow-ups'
        );
        setConnectionError(null); // Clear any previous errors
        // Enable immediate reconnection for follow-ups
        shouldReconnectRef.current = true;
        lastConnectionTimeRef.current = 0; // Reset debounce to allow immediate reconnection
      } else if (eventSource?.readyState === EventSource.CONNECTING) {
        // Connection failed while trying to connect
        console.log('[useChat] Connection failed during initial connection');
        setConnectionError(
          'Failed to connect to analysis service. Please try again.'
        );
        shouldReconnectRef.current = false;
        // Re-enable after a delay
        setTimeout(() => {
          console.log(
            '[useChat] Re-enabling reconnection after connection failure'
          );
          shouldReconnectRef.current = true;
        }, CONNECTION_DEBOUNCE_MS);
      } else {
        // Some other error state
        console.log('[useChat] Unknown EventSource error occurred');
        setConnectionError(
          'Connection error occurred. The analysis should still work.'
        );
        // Temporarily disable reconnection
        shouldReconnectRef.current = false;
        setTimeout(() => {
          console.log('[useChat] Re-enabling reconnection after unknown error');
          shouldReconnectRef.current = true;
        }, CONNECTION_DEBOUNCE_MS);
      }
    };

    return () => {
      console.log('[useChat] Cleaning up EventSource connection');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      isConnectingRef.current = false;
    };
  }, [threadId]); // Depend on threadId but exit early for invalid values

  // Send message
  const sendMessage = useCallback(
    async (content: string, fileId?: string | null) => {
      if (!threadId) {
        throw new Error('No thread ID available');
      }

      // If not connected and reconnection is allowed, trigger a reconnection
      if (
        !isConnected &&
        shouldReconnectRef.current &&
        !isConnectingRef.current
      ) {
        console.log('[useChat] Triggering reconnection before sending message');
        lastConnectionTimeRef.current = 0; // Reset debounce
        shouldReconnectRef.current = true;

        // Force a reconnection by updating a dependency that triggers the useEffect
        // This is a bit of a hack, but it works with the current architecture
        setConnectionError(null);
      }

      // Add optimistic user message
      messageCounterRef.current += 1;
      const userMessage: ChatMessage = {
        id: `user_${Date.now()}_${messageCounterRef.current}`,
        role: 'user',
        content: content,
        timestamp: new Date(),
      };

      setMessages(prev => {
        const isDuplicate = prev.some(
          msg =>
            msg.id === userMessage.id ||
            (msg.role === userMessage.role &&
              msg.content === userMessage.content &&
              Math.abs(
                msg.timestamp.getTime() - userMessage.timestamp.getTime()
              ) < 1000)
        );

        if (isDuplicate) {
          console.log(
            '[useChat] Preventing duplicate message:',
            userMessage.id
          );
          return prev;
        }

        return [...prev, userMessage];
      });

      try {
        // Send message to API
        const response = await fetch('/api/analysis/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            threadId,
            query: content,
            fileId: fileId || undefined,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // The response will trigger SSE events, so we don't need to handle the response here
      } catch (error) {
        console.error('Failed to send message:', error);

        // Add error message
        messageCounterRef.current += 1;
        const errorMessage: ChatMessage = {
          id: `error_${Date.now()}_${messageCounterRef.current}`,
          role: 'system',
          content: `Failed to send message: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
          timestamp: new Date(),
        };

        setMessages(prev => {
          const isDuplicate = prev.some(
            msg =>
              msg.id === errorMessage.id ||
              (msg.role === errorMessage.role &&
                msg.content === errorMessage.content &&
                Math.abs(
                  msg.timestamp.getTime() - errorMessage.timestamp.getTime()
                ) < 1000)
          );

          if (isDuplicate) {
            console.log(
              '[useChat] Preventing duplicate message:',
              errorMessage.id
            );
            return prev;
          }

          return [...prev, errorMessage];
        });
      }
    },
    [threadId, isConnected]
  );

  // Cancel current run
  const cancelRun = useCallback(async () => {
    if (!threadId || !currentRunIdRef.current) {
      return;
    }

    try {
      const response = await fetch(`/api/runs/${threadId}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      setIsRunning(false);
      setRunStatus('cancelled');
      currentRunIdRef.current = null;
      onRunStatusChangeRef.current?.('cancelled');
    } catch (error) {
      console.error('Failed to cancel run:', error);
    }
  }, [threadId]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Reset connection state (for manual restart)
  const resetConnection = useCallback(() => {
    console.log('[useChat] Resetting connection state');
    shouldReconnectRef.current = true;
    setConnectionError(null);
    setIsConnected(false);
    isConnectingRef.current = false;
    lastConnectionTimeRef.current = 0;
  }, []);

  // Add message manually
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => {
      const isDuplicate = prev.some(
        msg =>
          msg.id === message.id ||
          (msg.role === message.role &&
            msg.content === message.content &&
            Math.abs(msg.timestamp.getTime() - message.timestamp.getTime()) <
              1000)
      );

      if (isDuplicate) {
        console.log('[useChat] Preventing duplicate message:', message.id);
        return prev;
      }

      return [...prev, message];
    });
  }, []);

  return {
    messages,
    isConnected,
    isRunning,
    runStatus,
    connectionError,
    sendMessage,
    cancelRun,
    clearMessages,
    addMessage,
    resetConnection,
  };
}
