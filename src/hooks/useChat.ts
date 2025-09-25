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
    status: 'idle' | 'running' | 'completed' | 'failed'
  ) => void;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isConnected: boolean;
  isRunning: boolean;
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
    const errorMessage: ChatMessage = {
      id: `error_${Date.now()}`,
      role: 'system',
      content: `Analysis failed: ${data.error || 'Unknown error'}`,
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
          currentRunIdRef.current = event.data.runId;
          onRunStatusChange?.('running');
          break;

        case 'run.in_progress':
          setIsRunning(true);
          break;

        case 'message.delta':
          handleMessageDelta(event.data);
          break;

        case 'message.completed':
          handleMessageCompleted(event.data);
          break;

        case 'run.completed':
          setIsRunning(false);
          currentRunIdRef.current = null;
          onRunStatusChange?.('completed');
          break;

        case 'run.failed':
          setIsRunning(false);
          currentRunIdRef.current = null;
          onRunStatusChange?.('failed');
          handleRunFailed(event.data);
          break;

        case 'artifact.created':
          onArtifactCreated?.(event.data);
          handleArtifactCreated(event.data);
          break;

        case 'error':
          setConnectionError(event.data.error);
          setIsRunning(false);
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
      currentRunIdRef.current = null;
      onRunStatusChange?.('idle');
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
    connectionError,
    sendMessage,
    cancelRun,
    clearMessages,
    addMessage,
  };
}
