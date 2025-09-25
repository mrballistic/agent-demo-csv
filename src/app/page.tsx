'use client';

import { useState, useEffect } from 'react';
import { AnalystMuiScaffold } from '@/components/layout';
import { ChatPane, FileUploader } from '@/components/ui';
import { useChat } from '@/hooks';
import {
  Typography,
  Box,
  Paper,
  Button,
  Stack,
  Grid,
  Alert,
  Chip,
} from '@mui/material';
import {
  CloudUpload,
  TrendingUp,
  Assessment,
  Chat,
  Analytics,
} from '@mui/icons-material';
import { ChatMessage } from '@/types';

export default function Home() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [hasUploadedFile, setHasUploadedFile] = useState(false);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [runStatus, setRunStatus] = useState<
    'idle' | 'running' | 'completed' | 'failed'
  >('idle');

  const {
    messages,
    isConnected,
    isRunning,
    connectionError,
    sendMessage,
    cancelRun,
    addMessage,
  } = useChat(
    threadId
      ? {
          threadId,
          onArtifactCreated: artifact => {
            setArtifacts(prev => [...prev, artifact]);
          },
          onRunStatusChange: setRunStatus,
        }
      : {}
  );

  // Initialize thread on mount
  useEffect(() => {
    // For demo purposes, create a mock thread ID
    const mockThreadId = `thread_${Date.now()}`;
    setThreadId(mockThreadId);
  }, []);

  const handleFileUpload = (result: any) => {
    setHasUploadedFile(true);

    // Add system message about file upload
    const systemMessage: ChatMessage = {
      id: `system_${Date.now()}`,
      role: 'system',
      content: `📁 File uploaded: ${result.filename} (${result.size} bytes, ${result.rowCount} rows)`,
      timestamp: new Date(),
    };

    addMessage(systemMessage);
  };

  const handleQuickAction = async (action: string) => {
    if (!hasUploadedFile) {
      return;
    }

    const queries = {
      profile: 'Profile this dataset and show me key statistics',
      trends: 'Show me trends in this data over time',
      'top-sku': 'What are the top performing products or SKUs?',
      'channel-mix': 'Analyze performance by channel or category',
    };

    const query = queries[action as keyof typeof queries] || action;
    await sendMessage(query);
  };

  return (
    <AnalystMuiScaffold>
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h4" component="h1" gutterBottom>
            AI Data Analyst
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Upload your CSV data and get instant insights with AI-powered
            analysis.
          </Typography>

          {/* Status indicators */}
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Chip
              icon={<Chat />}
              label={isConnected ? 'Connected' : 'Disconnected'}
              color={isConnected ? 'success' : 'error'}
              variant="outlined"
              size="small"
            />
            {hasUploadedFile && (
              <Chip
                icon={<CloudUpload />}
                label="File Ready"
                color="primary"
                variant="outlined"
                size="small"
              />
            )}
            {runStatus !== 'idle' && (
              <Chip
                icon={<Analytics />}
                label={
                  runStatus === 'running'
                    ? 'Analyzing...'
                    : `Analysis ${runStatus}`
                }
                color={
                  runStatus === 'running'
                    ? 'warning'
                    : runStatus === 'completed'
                      ? 'success'
                      : 'error'
                }
                variant="outlined"
                size="small"
              />
            )}
          </Stack>
        </Box>

        {/* Main content */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <Grid container sx={{ height: '100%' }}>
            {/* Left sidebar - File upload and quick actions */}
            <Grid
              item
              xs={12}
              md={3}
              sx={{ borderRight: 1, borderColor: 'divider', p: 2 }}
            >
              <Stack spacing={3}>
                {/* File upload */}
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Upload Data
                  </Typography>
                  <FileUploader
                    onFileUploaded={handleFileUpload}
                    onSystemMessage={message => {
                      const systemMessage: ChatMessage = {
                        id: `system_${Date.now()}`,
                        role: 'system',
                        content: message,
                        timestamp: new Date(),
                      };
                      addMessage(systemMessage);
                    }}
                    disabled={isRunning}
                  />
                </Box>

                {/* Quick actions */}
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Quick Actions
                  </Typography>
                  <Stack spacing={1}>
                    <Button
                      variant="outlined"
                      startIcon={<Assessment />}
                      onClick={() => handleQuickAction('profile')}
                      disabled={!hasUploadedFile || isRunning}
                      fullWidth
                    >
                      Profile Data
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<TrendingUp />}
                      onClick={() => handleQuickAction('trends')}
                      disabled={!hasUploadedFile || isRunning}
                      fullWidth
                    >
                      Show Trends
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => handleQuickAction('top-sku')}
                      disabled={!hasUploadedFile || isRunning}
                      fullWidth
                    >
                      Top Products
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => handleQuickAction('channel-mix')}
                      disabled={!hasUploadedFile || isRunning}
                      fullWidth
                    >
                      Channel Analysis
                    </Button>
                  </Stack>
                </Box>

                {/* Artifacts */}
                {artifacts.length > 0 && (
                  <Box>
                    <Typography variant="h6" gutterBottom>
                      Generated Files
                    </Typography>
                    <Stack spacing={1}>
                      {artifacts.map((artifact, index) => (
                        <Paper key={index} sx={{ p: 1 }}>
                          <Typography variant="body2" noWrap>
                            📄 {artifact.filename}
                          </Typography>
                        </Paper>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>
            </Grid>

            {/* Main chat area */}
            <Grid
              item
              xs={12}
              md={9}
              sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              {connectionError && (
                <Alert severity="warning" sx={{ m: 2 }}>
                  {connectionError}
                </Alert>
              )}

              <Box sx={{ flex: 1, m: 2, mt: connectionError ? 0 : 2 }}>
                {threadId ? (
                  <ChatPane
                    threadId={threadId}
                    messages={messages}
                    onSendMessage={sendMessage}
                    onCancelRun={cancelRun}
                    disabled={!hasUploadedFile}
                    isRunning={isRunning}
                  />
                ) : (
                  <Paper
                    sx={{
                      p: 3,
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Initializing chat...
                    </Typography>
                  </Paper>
                )}
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </AnalystMuiScaffold>
  );
}
