'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessage } from '@/types';

interface StreamEvent {
  type: string;
  data: any;
  timestamp: number;
}

interface UseChatOptions {
  threadId?: string;
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
  const handleStreamEventRef = useRef<((event: StreamEvent) => void) | null>(
    null
  );

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

    setMessages(prev =>
      prev.map(msg => (msg.id === messageId ? { ...msg, content } : msg))
    );
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

  // Handle stream events
  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.type) {
        case 'connection.established':
          setIsConnected(true);
          setConnectionError(null);
          break;

        case 'run.started':
          setIsRunning(true);
          setRunStatus('queued');
          currentRunIdRef.current = event.data.runId;
          onRunStatusChangeRef.current?.('queued');
          break;

        case 'run.queued':
          setRunStatus('queued');
          onRunStatusChangeRef.current?.('queued');
          onQueueUpdateRef.current?.(
            event.data.queuePosition,
            event.data.estimatedWaitTime
          );
          // Add queue position message if available
          if (event.data.queuePosition) {
            const queueMessage: ChatMessage = {
              id: `queue_${Date.now()}`,
              role: 'system',
              content: `⏳ Queued (position ${event.data.queuePosition})`,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, queueMessage]);
          }
          break;

        case 'run.in_progress':
          setIsRunning(true);
          setRunStatus('running');
          onRunStatusChangeRef.current?.('running');
          onQueueUpdateRef.current?.(undefined, undefined); // Clear queue info
          break;

        case 'message.delta':
          handleMessageDelta(event.data);
          break;

        case 'message.completed':
          handleMessageCompleted(event.data);
          break;

        case 'run.completed':
          setIsRunning(false);
          setRunStatus('completed');
          currentRunIdRef.current = null;
          onRunStatusChangeRef.current?.('completed');
          onQueueUpdateRef.current?.(undefined, undefined); // Clear queue info
          break;

        case 'run.failed':
          setIsRunning(false);
          setRunStatus('failed');
          currentRunIdRef.current = null;
          onRunStatusChangeRef.current?.('failed');
          onQueueUpdateRef.current?.(undefined, undefined); // Clear queue info
          handleRunFailed(event.data);
          break;

        case 'run.cancelled':
          setIsRunning(false);
          setRunStatus('cancelled');
          currentRunIdRef.current = null;
          onRunStatusChangeRef.current?.('cancelled');
          onQueueUpdateRef.current?.(undefined, undefined); // Clear queue info
          const cancelMessage: ChatMessage = {
            id: `cancel_${Date.now()}`,
            role: 'system',
            content: '🛑 Analysis cancelled',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, cancelMessage]);
          break;

        case 'artifact.created':
          onArtifactCreatedRef.current?.(event.data);
          handleArtifactCreated(event.data);
          break;

        case 'error':
          setConnectionError(event.data.error);
          setIsRunning(false);
          setRunStatus('failed');
          onRunStatusChangeRef.current?.('failed');
          onQueueUpdateRef.current?.(undefined, undefined); // Clear queue info
          break;
      }
    },
    [
      handleMessageDelta,
      handleMessageCompleted,
      handleRunFailed,
      handleArtifactCreated,
    ]
  );

  // Update ref when handleStreamEvent changes
  useEffect(() => {
    handleStreamEventRef.current = handleStreamEvent;
  }, [handleStreamEvent]);

  // Set up SSE connection - inline to avoid dependency issues
  useEffect(() => {
    if (!threadId) {
      // Cleanup when no threadId
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    // Close existing connection before creating new one
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/runs/${threadId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setConnectionError(null);
    };

    eventSource.onmessage = event => {
      try {
        const streamEvent: StreamEvent = JSON.parse(event.data);
        handleStreamEventRef.current?.(streamEvent);
      } catch (error) {
        console.error('Failed to parse stream event:', error);
      }
    };

    eventSource.onerror = error => {
      console.error('SSE connection error:', error);
      setIsConnected(false);

      // Check if this is a 404 error (session expired)
      if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
        setConnectionError(
          'Session expired or server restarted. Please refresh the page and start a new analysis.'
        );
      } else {
        setConnectionError('Connection lost. Attempting to reconnect...');

        // Attempt to reconnect after a delay
        setTimeout(() => {
          if (
            eventSourceRef.current?.readyState === EventSource.CLOSED &&
            threadId
          ) {
            const retryEventSource = new EventSource(
              `/api/runs/${threadId}/stream`
            );
            eventSourceRef.current = retryEventSource;
          }
        }, 3000);
      }
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [threadId]); // Only depend on threadId, not on handleStreamEvent

  // Send message
  const sendMessage = useCallback(
    async (content: string, fileId?: string | null) => {
      if (!threadId) {
        throw new Error('No thread ID available');
      }

      // Add optimistic user message
      const userMessage: ChatMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: content,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, userMessage]);

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
        const errorMessage: ChatMessage = {
          id: `error_${Date.now()}`,
          role: 'system',
          content: `Failed to send message: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, errorMessage]);
      }
    },
    [threadId]
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

  // Add message manually
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
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
  };
}
