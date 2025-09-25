'use client';

import { useState, useEffect } from 'react';
import { AnalystMuiScaffold } from '@/components/layout';
import { ChatPane, FileUploader, QuickActions } from '@/components/ui';
import RunStatusChip from '@/components/ui/RunStatusChip';
import { useChat } from '@/hooks';
import {
  Typography,
  Box,
  Paper,
  Stack,
  Grid,
  Alert,
  Chip,
} from '@mui/material';
import { CloudUpload, Chat } from '@mui/icons-material';
import { ChatMessage } from '@/types';

export default function Home() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [hasUploadedFile, setHasUploadedFile] = useState(false);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [runStatus, setRunStatus] = useState<
    'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  >('idle');
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [queuePosition, setQueuePosition] = useState<number | undefined>();

  const {
    messages,
    isConnected,
    isRunning,
    runStatus: hookRunStatus,
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
          onRunStatusChange: status => {
            setRunStatus(status);
          },
        }
      : {}
  );

  // Initialize thread on mount
  useEffect(() => {
    // For demo purposes, create a mock thread ID
    const mockThreadId = `thread_${Date.now()}`;
    setThreadId(mockThreadId);
  }, []);

  // Update elapsed time for running analyses
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (hookRunStatus === 'running') {
      const startTime = Date.now();
      interval = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 1000);
    } else {
      setElapsedTime(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [hookRunStatus]);

  const handleFileUpload = (result: any) => {
    setHasUploadedFile(true);
    setCurrentFileId(result.fileId);

    // Add system message about file upload
    const systemMessage: ChatMessage = {
      id: `system_${Date.now()}`,
      role: 'system',
      content: `📁 File uploaded: ${result.filename} (${result.size} bytes, ${result.rowCount} rows)`,
      timestamp: new Date(),
    };

    addMessage(systemMessage);
  };

  const handleQuickAction = async (actionId: string, analysisType: string) => {
    if (!hasUploadedFile || !currentFileId) {
      return;
    }

    const queries = {
      profile: 'Profile this dataset and show me key statistics',
      trends: 'Show me trends in this data over time',
      'top-products': 'What are the top performing products or SKUs?',
      'channel-mix': 'Analyze performance by channel or category',
      'customer-analysis': 'Analyze customer behavior and value distribution',
    };

    const query =
      queries[actionId as keyof typeof queries] ||
      `Perform ${analysisType} analysis on this data`;
    await sendMessage(query, currentFileId);
  };

  const handleRetryAnalysis = () => {
    // Retry the last user message
    const lastUserMessage = messages
      .slice()
      .reverse()
      .find(msg => msg.role === 'user');

    if (lastUserMessage && currentFileId) {
      sendMessage(lastUserMessage.content, currentFileId);
    }
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
            <RunStatusChip
              status={hookRunStatus}
              elapsedTime={elapsedTime}
              {...(queuePosition !== undefined && { queuePosition })}
              onRetry={handleRetryAnalysis}
              onCancel={cancelRun}
            />
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
                <QuickActions
                  fileId={currentFileId}
                  onAction={handleQuickAction}
                  disabled={isRunning}
                />

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
                    fileId={currentFileId}
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
