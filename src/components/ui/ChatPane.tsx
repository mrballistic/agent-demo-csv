'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  TextField,
  IconButton,
  CircularProgress,
  Alert,
  Fade,
} from '@mui/material';
import {
  Person,
  SmartToy,
  Info,
  Send,
  Stop,
  KeyboardArrowDown,
} from '@mui/icons-material';
import { ChatMessage } from '@/types';

interface StreamingMessage extends ChatMessage {
  isStreaming?: boolean;
  isComplete?: boolean;
}

interface ChatPaneProps {
  threadId?: string;
  messages: ChatMessage[];
  onSendMessage?: (content: string) => void;
  onCancelRun?: () => void;
  className?: string;
  disabled?: boolean;
  isRunning?: boolean;
}

interface StreamEvent {
  type: string;
  data: any;
  timestamp: number;
}

const ChatPane: React.FC<ChatPaneProps> = ({
  threadId,
  messages: initialMessages,
  onSendMessage,
  onCancelRun,
  className,
  disabled = false,
  isRunning = false,
}) => {
  const [messages, setMessages] = useState<StreamingMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      block: 'end',
    });
  }, []);

  // Check if user has scrolled up
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } =
      messagesContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  }, []);

  // Handle streaming message deltas
  const handleMessageDelta = useCallback(
    (data: any) => {
      const { messageId, content } = data;

      setMessages(prev => {
        const existingIndex = prev.findIndex(msg => msg.id === messageId);

        if (existingIndex >= 0) {
          // Update existing streaming message
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            content: content,
            isStreaming: true,
          } as StreamingMessage;
          return updated;
        } else {
          // Create new streaming message
          const newMessage: StreamingMessage = {
            id: messageId,
            role: 'assistant',
            content: content,
            timestamp: new Date(),
            isStreaming: true,
          };
          return [...prev, newMessage];
        }
      });

      // Auto-scroll if user is near bottom
      setTimeout(() => {
        if (!showScrollButton) {
          scrollToBottom();
        }
      }, 50);
    },
    [showScrollButton, scrollToBottom]
  );

  // Handle completed messages
  const handleMessageCompleted = useCallback((data: any) => {
    const { messageId, content } = data;

    setMessages(prev =>
      prev.map(msg =>
        msg.id === messageId
          ? { ...msg, content, isStreaming: false, isComplete: true }
          : msg
      )
    );
  }, []);

  // Handle run failures
  const handleRunFailed = useCallback((data: any) => {
    const errorMessage: StreamingMessage = {
      id: `error_${Date.now()}`,
      role: 'system',
      content: `Analysis failed: ${data.error || 'Unknown error'}`,
      timestamp: new Date(),
      isComplete: true,
    };

    setMessages(prev => [...prev, errorMessage]);
  }, []);

  // Handle artifact creation
  const handleArtifactCreated = useCallback((data: any) => {
    const artifactMessage: StreamingMessage = {
      id: `artifact_${Date.now()}`,
      role: 'system',
      content: `📄 Created: ${data.filename}`,
      timestamp: new Date(),
      isComplete: true,
    };

    setMessages(prev => [...prev, artifactMessage]);
  }, []);

  // Handle different types of stream events
  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.type) {
        case 'connection.established':
          setIsConnected(true);
          setConnectionError(null);
          break;

        case 'run.started':
        case 'run.in_progress':
          // Add system message about run status if needed
          break;

        case 'message.delta':
          handleMessageDelta(event.data);
          break;

        case 'message.completed':
          handleMessageCompleted(event.data);
          break;

        case 'run.completed':
          // Mark streaming as complete
          setMessages(prev =>
            prev.map(msg =>
              msg.isStreaming
                ? { ...msg, isStreaming: false, isComplete: true }
                : msg
            )
          );
          break;

        case 'run.failed':
          handleRunFailed(event.data);
          break;

        case 'artifact.created':
          handleArtifactCreated(event.data);
          break;

        case 'error':
          setConnectionError(event.data.error);
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

  // Handle SSE connection and streaming
  useEffect(() => {
    if (!threadId) return;

    const connectToStream = () => {
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
    };

    connectToStream();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [threadId, handleStreamEvent]);

  // Handle sending messages
  const handleSendMessage = useCallback(() => {
    if (!inputValue.trim() || disabled) return;

    // Add optimistic user message
    const userMessage: StreamingMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
      isComplete: true,
    };

    setMessages(prev => [...prev, userMessage]);

    // Call parent handler
    onSendMessage?.(inputValue.trim());

    // Clear input
    setInputValue('');

    // Scroll to bottom
    setTimeout(() => scrollToBottom(), 100);
  }, [inputValue, disabled, onSendMessage, scrollToBottom]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  // Focus management
  useEffect(() => {
    if (!disabled && !isRunning) {
      inputRef.current?.focus();
    }
  }, [disabled, isRunning]);

  // Update messages when props change
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const getMessageIcon = (role: ChatMessage['role']) => {
    switch (role) {
      case 'user':
        return <Person />;
      case 'assistant':
        return <SmartToy />;
      case 'system':
        return <Info />;
      default:
        return <Info />;
    }
  };

  const getMessageColor = (role: ChatMessage['role']) => {
    switch (role) {
      case 'user':
        return 'primary';
      case 'assistant':
        return 'secondary';
      case 'system':
        return 'info';
      default:
        return 'default';
    }
  };

  return (
    <Paper
      {...(className && { className })}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 400,
        bgcolor: 'background.paper',
        position: 'relative',
      }}
    >
      {/* Connection status */}
      {connectionError && (
        <Alert severity="warning" sx={{ m: 1 }}>
          {connectionError}
        </Alert>
      )}

      {/* Messages container */}
      <Box
        ref={messagesContainerRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {messages.length === 0 ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography variant="body2" color="text.secondary" align="center">
              Upload a CSV file to start analyzing your data.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={2}>
            {messages.map(message => (
              <Box
                key={message.id}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  opacity: message.isComplete === false ? 0.7 : 1,
                  transition: 'opacity 0.3s ease',
                }}
              >
                <Chip
                  icon={getMessageIcon(message.role)}
                  label={message.role}
                  size="small"
                  color={getMessageColor(message.role) as any}
                  variant="outlined"
                />
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="body1"
                    sx={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {message.content}
                    {message.isStreaming && (
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-block',
                          width: 2,
                          height: '1.2em',
                          bgcolor: 'primary.main',
                          ml: 0.5,
                          animation: 'blink 1s infinite',
                          '@keyframes blink': {
                            '0%, 50%': { opacity: 1 },
                            '51%, 100%': { opacity: 0 },
                          },
                        }}
                      />
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {message.timestamp.toLocaleTimeString()}
                    {message.isStreaming && (
                      <CircularProgress size={12} sx={{ ml: 1 }} />
                    )}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Scroll to bottom button */}
      <Fade in={showScrollButton}>
        <IconButton
          onClick={() => scrollToBottom()}
          sx={{
            position: 'absolute',
            bottom: 80,
            right: 16,
            bgcolor: 'background.paper',
            boxShadow: 2,
            '&:hover': {
              bgcolor: 'background.default',
            },
          }}
          size="small"
        >
          <KeyboardArrowDown />
        </IconButton>
      </Fade>

      {/* Input area */}
      <Box
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            ref={inputRef}
            fullWidth
            multiline
            maxRows={4}
            placeholder={
              disabled
                ? 'Upload a file to start chatting...'
                : 'Ask a question about your data...'
            }
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            variant="outlined"
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'background.paper',
              },
            }}
          />
          {isRunning ? (
            <IconButton
              onClick={onCancelRun}
              color="error"
              disabled={!onCancelRun}
              sx={{ mb: 0.5 }}
            >
              <Stop />
            </IconButton>
          ) : (
            <IconButton
              onClick={handleSendMessage}
              disabled={disabled || !inputValue.trim()}
              color="primary"
              sx={{ mb: 0.5 }}
            >
              <Send />
            </IconButton>
          )}
        </Box>

        {/* Connection indicator */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: isConnected ? 'success.main' : 'error.main',
            }}
          />
          <Typography variant="caption" color="text.secondary">
            {isConnected ? 'Connected' : 'Disconnected'}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export default ChatPane;
