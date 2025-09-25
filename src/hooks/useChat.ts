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
          onRunStatusChange?.('queued');
          break;

        case 'run.queued':
          setRunStatus('queued');
          onRunStatusChange?.('queued');
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
          onRunStatusChange?.('running');
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
          onRunStatusChange?.('completed');
          break;

        case 'run.failed':
          setIsRunning(false);
          setRunStatus('failed');
          currentRunIdRef.current = null;
          onRunStatusChange?.('failed');
          handleRunFailed(event.data);
          break;

        case 'run.cancelled':
          setIsRunning(false);
          setRunStatus('cancelled');
          currentRunIdRef.current = null;
          onRunStatusChange?.('cancelled');
          const cancelMessage: ChatMessage = {
            id: `cancel_${Date.now()}`,
            role: 'system',
            content: '🛑 Analysis cancelled',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, cancelMessage]);
          break;

        case 'artifact.created':
          onArtifactCreated?.(event.data);
          handleArtifactCreated(event.data);
          break;

        case 'error':
          setConnectionError(event.data.error);
          setIsRunning(false);
          setRunStatus('failed');
          onRunStatusChange?.('failed');
          break;
      }
    },
    [
      onArtifactCreated,
      onRunStatusChange,
      handleMessageDelta,
      handleMessageCompleted,
      handleRunFailed,
      handleArtifactCreated,
    ]
  );

  // Connect to SSE stream
  const connectToStream = useCallback(() => {
    if (!threadId) return;

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
        handleStreamEvent(streamEvent);
      } catch (error) {
        console.error('Failed to parse stream event:', error);
      }
    };

    eventSource.onerror = error => {
      console.error('SSE connection error:', error);
      setIsConnected(false);
      setConnectionError('Connection lost. Attempting to reconnect...');

      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
          connectToStream();
        }
      }, 3000);
    };
  }, [threadId, handleStreamEvent]);

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
      onRunStatusChange?.('cancelled');
    } catch (error) {
      console.error('Failed to cancel run:', error);
    }
  }, [threadId, onRunStatusChange]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Add message manually
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  }, []);

  // Set up SSE connection
  useEffect(() => {
    if (threadId) {
      connectToStream();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [threadId, connectToStream]);

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
