'use client';

import React from 'react';
import { Box, Paper, Typography, Stack, Chip } from '@mui/material';
import { Person, SmartToy, Info } from '@mui/icons-material';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface ChatPaneProps {
  messages: ChatMessage[];
  className?: string;
}

const ChatPane: React.FC<ChatPaneProps> = ({ messages, className }) => {
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

  if (messages.length === 0) {
    return (
      <Paper
        {...(className && { className })}
        sx={{ p: 3, minHeight: 300, bgcolor: 'background.paper' }}
      >
        <Typography variant="body2" color="text.secondary" align="center">
          Upload a CSV file to start analyzing your data.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      {...(className && { className })}
      sx={{ p: 2, minHeight: 300, bgcolor: 'background.paper' }}
    >
      <Stack spacing={2}>
        {messages.map(message => (
          <Box
            key={message.id}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
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
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                {message.content}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {message.timestamp.toLocaleTimeString()}
              </Typography>
            </Box>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
};

export default ChatPane;
