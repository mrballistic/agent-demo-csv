'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
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
  Skeleton,
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
import { announceToScreenReader, srOnlyStyles } from '@/lib/accessibility';

interface StreamingMessage extends ChatMessage {
  isStreaming?: boolean;
  isComplete?: boolean;
}

interface ChatPaneProps {
  threadId?: string;
  messages: ChatMessage[];
  onSendMessage?: (content: string, fileId?: string | null) => void;
  onCancelRun?: () => void;
  className?: string;
  disabled?: boolean;
  isRunning?: boolean;
  fileId?: string | null;
  queuePosition?: number;
  estimatedWaitTime?: number;
  isLoading?: boolean;
  isConnected?: boolean;
  connectionError?: string | null;
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
  fileId,
  queuePosition,
  estimatedWaitTime,
  isLoading = false,
  isConnected = false,
  connectionError = null,
}) => {
  const [messages, setMessages] = useState<StreamingMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [currentQueuePosition, setCurrentQueuePosition] = useState<
    number | undefined
  >(queuePosition);
  const [currentWaitTime, setCurrentWaitTime] = useState<number | undefined>(
    estimatedWaitTime
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // EventSource connection is managed by useChat hook in parent component

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

    // Announce completion to screen readers
    announceToScreenReader('Analysis response completed', 'polite');
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

  // Update internal state when props change
  useEffect(() => {
    setCurrentQueuePosition(queuePosition);
  }, [queuePosition]);

  useEffect(() => {
    setCurrentWaitTime(estimatedWaitTime);
  }, [estimatedWaitTime]);

  // Handle SSE connection and streaming - REMOVED: useChat hook handles this
  // The streaming connection is managed by the useChat hook in the parent component

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
    onSendMessage?.(inputValue.trim(), fileId);

    // Clear input
    setInputValue('');

    // Scroll to bottom
    setTimeout(() => scrollToBottom(), 100);
  }, [inputValue, disabled, onSendMessage, scrollToBottom, fileId]);

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
      role="main"
      aria-label="Chat conversation"
    >
      {/* Connection status */}
      {connectionError && (
        <Alert
          severity={
            connectionError.includes('expired') ||
            connectionError.includes('restarted')
              ? 'error'
              : 'warning'
          }
          sx={{ m: 1 }}
          action={
            connectionError.includes('expired') ||
            connectionError.includes('restarted') ? (
              <IconButton
                color="inherit"
                size="small"
                onClick={() => window.location.reload()}
                aria-label="Refresh page"
              >
                ↻
              </IconButton>
            ) : undefined
          }
        >
          {connectionError}
          {(connectionError.includes('expired') ||
            connectionError.includes('restarted')) && (
            <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
              Click the refresh button to start over.
            </Typography>
          )}
        </Alert>
      )}

      {/* Queue status */}
      {currentQueuePosition && (
        <Alert severity="info" sx={{ m: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="body2">
              Queued (position #{currentQueuePosition})
              {currentWaitTime &&
                ` - estimated wait: ${Math.ceil(currentWaitTime / 1000)}s`}
            </Typography>
            {onCancelRun && (
              <IconButton size="small" onClick={onCancelRun} color="error">
                <Stop fontSize="small" />
              </IconButton>
            )}
          </Box>
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
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        aria-atomic="false"
      >
        {isLoading ? (
          <Stack spacing={2}>
            {/* Loading shimmer for messages */}
            {[1, 2, 3].map(i => (
              <Box
                key={i}
                sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}
              >
                <Skeleton
                  variant="rectangular"
                  width={80}
                  height={24}
                  sx={{ borderRadius: 12 }}
                />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="80%" height={24} />
                  <Skeleton variant="text" width="60%" height={20} />
                  <Skeleton variant="text" width="40%" height={16} />
                </Box>
              </Box>
            ))}
          </Stack>
        ) : messages.length === 0 ? (
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
              <br />
              <Typography variant="caption" color="text.disabled">
                Try our sample data files to get started quickly.
              </Typography>
            </Typography>
          </Box>
        ) : (
          <Stack spacing={2}>
            {messages.map((message, index) => (
              <Box
                key={message.id}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  opacity: message.isComplete === false ? 0.7 : 1,
                  transition: 'opacity 0.3s ease',
                }}
                role="article"
                aria-label={`Message from ${message.role} at ${message.timestamp.toLocaleTimeString()}`}
                tabIndex={0}
              >
                <Chip
                  icon={getMessageIcon(message.role)}
                  label={message.role}
                  size="small"
                  color={getMessageColor(message.role) as any}
                  variant="outlined"
                  aria-hidden="true"
                />
                <Box sx={{ flex: 1 }}>
                  <Box sx={srOnlyStyles}>
                    {message.role === 'user'
                      ? 'You said:'
                      : message.role === 'assistant'
                        ? 'AI responded:'
                        : 'System message:'}
                  </Box>
                  <Box
                    sx={{
                      '& p': { mb: 1 },
                      '& pre': {
                        bgcolor: 'grey.100',
                        p: 1,
                        borderRadius: 1,
                        overflow: 'auto',
                      },
                      '& code': {
                        bgcolor: 'grey.100',
                        p: 0.5,
                        borderRadius: 0.5,
                        fontSize: '0.875em',
                        fontFamily: 'monospace',
                      },
                      '& blockquote': {
                        borderLeft: '4px solid',
                        borderColor: 'primary.main',
                        pl: 2,
                        ml: 0,
                        fontStyle: 'italic',
                      },
                      '& ul, & ol': {
                        pl: 2,
                      },
                      '& table': {
                        borderCollapse: 'collapse',
                        width: '100%',
                        mb: 1,
                      },
                      '& th, & td': {
                        border: '1px solid',
                        borderColor: 'divider',
                        p: 1,
                        textAlign: 'left',
                      },
                      '& th': {
                        bgcolor: 'grey.50',
                        fontWeight: 'bold',
                      },
                    }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        // Override paragraph to use MUI Typography
                        p: ({ children }) => (
                          <Typography
                            variant="body1"
                            sx={{
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              mb: 1,
                            }}
                          >
                            {children}
                          </Typography>
                        ),
                        // Override code to ensure proper styling
                        code: ({ children, className }) => {
                          const isInline = !className?.includes('language-');
                          return (
                            <Box
                              component={isInline ? 'code' : 'pre'}
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.875em',
                                ...(isInline
                                  ? {
                                      bgcolor: 'grey.100',
                                      px: 0.5,
                                      py: 0.25,
                                      borderRadius: 0.5,
                                      display: 'inline',
                                    }
                                  : {
                                      bgcolor: 'grey.100',
                                      p: 1,
                                      borderRadius: 1,
                                      overflow: 'auto',
                                      display: 'block',
                                      whiteSpace: 'pre',
                                    }),
                              }}
                            >
                              {children}
                            </Box>
                          );
                        },
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </Box>
                  {message.isStreaming && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mt: 1,
                      }}
                    >
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-block',
                          width: 2,
                          height: '1.2em',
                          bgcolor: 'primary.main',
                          animation: 'blink 1s infinite',
                          '@keyframes blink': {
                            '0%, 50%': { opacity: 1 },
                            '51%, 100%': { opacity: 0 },
                          },
                        }}
                        aria-hidden="true"
                      />
                      <Box sx={srOnlyStyles} aria-live="polite">
                        AI is typing...
                      </Box>
                    </Box>
                  )}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1, display: 'block' }}
                  >
                    {message.timestamp.toLocaleTimeString()}
                    {message.isStreaming && (
                      <CircularProgress
                        size={12}
                        sx={{ ml: 1 }}
                        aria-hidden="true"
                      />
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
          aria-label="Scroll to bottom of chat"
          title="Scroll to latest message"
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
            inputProps={{
              'aria-label': 'Chat input',
              'aria-describedby': 'chat-input-help',
            }}
          />
          {isRunning ? (
            <IconButton
              onClick={onCancelRun}
              color="error"
              disabled={!onCancelRun}
              sx={{ mb: 0.5 }}
              aria-label="Cancel analysis"
              title="Cancel current analysis"
            >
              <Stop />
            </IconButton>
          ) : (
            <IconButton
              onClick={handleSendMessage}
              disabled={disabled || !inputValue.trim()}
              color="primary"
              sx={{ mb: 0.5 }}
              aria-label="Send message"
              title="Send message (Enter)"
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
            aria-hidden="true"
          />
          <Typography
            variant="caption"
            color="text.secondary"
            id="chat-input-help"
            role="status"
            aria-live="polite"
          >
            {isConnected ? 'Connected' : 'Disconnected'}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export default ChatPane;
