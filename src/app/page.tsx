'use client';

import { useState, useEffect } from 'react';
import { AnalystMuiScaffold } from '@/components/layout';
import {
  ChatPane,
  FileUploader,
  QuickActions,
  ArtifactsPanel,
  HelpText,
} from '@/components/ui';
import DataDeletionDialog from '@/components/ui/DataDeletionDialog';
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
  IconButton,
  Tooltip,
  Snackbar,
} from '@mui/material';
import { CloudUpload, Chat, DeleteForever } from '@mui/icons-material';
import { ChatMessage, ArtifactItem } from '@/types';

export default function Home() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [hasUploadedFile, setHasUploadedFile] = useState(false);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [runStatus, setRunStatus] = useState<
    'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  >('idle');
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [queuePosition, setQueuePosition] = useState<number | undefined>();
  const [estimatedWaitTime, setEstimatedWaitTime] = useState<
    number | undefined
  >();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

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
            const artifactItem: ArtifactItem = {
              id: artifact.artifactId,
              name: artifact.filename,
              type:
                artifact.type === 'image'
                  ? 'image'
                  : artifact.type === 'data'
                    ? 'data'
                    : 'file',
              downloadUrl: artifact.downloadUrl,
              createdAt: Date.now(),
            };
            setArtifacts(prev => [...prev, artifactItem]);
          },
          onRunStatusChange: status => {
            setRunStatus(status);
          },
          onQueueUpdate: (position, waitTime) => {
            setQueuePosition(position);
            setEstimatedWaitTime(waitTime);
          },
        }
      : {}
  );

  // Initialize thread on mount - will be replaced with real thread when profiling starts
  useEffect(() => {
    // Start with null threadId - will be set when profiling begins
    setThreadId(null);
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

  const handleFileUpload = async (result: any) => {
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

    // Automatically start profiling to create OpenAI thread
    try {
      setRunStatus('running');

      const profileResponse = await fetch('/api/analysis/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId: result.fileId,
        }),
      });

      if (!profileResponse.ok) {
        throw new Error(`Profile API failed: ${profileResponse.status}`);
      }

      const profileData = await profileResponse.json();

      // Set the real OpenAI thread ID
      setThreadId(profileData.threadId);

      // Add a message about starting profiling
      const profilingMessage: ChatMessage = {
        id: `system_${Date.now()}`,
        role: 'system',
        content: '🔍 Starting data profiling...',
        timestamp: new Date(),
      };

      addMessage(profilingMessage);
    } catch (error) {
      console.error('Failed to start profiling:', error);
      setRunStatus('idle');

      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        role: 'system',
        content: `❌ Failed to start analysis: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };

      addMessage(errorMessage);
    }
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

  const handleDataDeletion = async () => {
    // Reset all state
    setHasUploadedFile(false);
    setCurrentFileId(null);
    setArtifacts([]);
    setRunStatus('idle');
    setElapsedTime(0);
    setQueuePosition(undefined);
    setEstimatedWaitTime(undefined);

    // Show success message
    setDeleteSuccess(true);

    // Reset to null threadId - will be set when next profiling begins
    setThreadId(null);
  };

  return (
    <AnalystMuiScaffold>
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <Box>
              <Typography variant="h4" component="h1" gutterBottom>
                AI Data Analyst
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Upload your CSV data and get instant insights with AI-powered
                analysis.
              </Typography>
            </Box>

            {/* Data deletion button */}
            {(hasUploadedFile ||
              messages.length > 0 ||
              artifacts.length > 0) && (
              <Tooltip title="Delete all my data">
                <IconButton
                  onClick={() => setShowDeleteDialog(true)}
                  color="error"
                  size="small"
                  sx={{ mt: 1 }}
                >
                  <DeleteForever />
                </IconButton>
              </Tooltip>
            )}
          </Box>

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
              {...(estimatedWaitTime !== undefined && { estimatedWaitTime })}
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

                {/* Help Text */}
                {!hasUploadedFile && <HelpText section="upload" compact />}

                {/* Artifacts */}
                <ArtifactsPanel
                  artifacts={artifacts}
                  threadId={threadId ?? undefined}
                />

                {/* Additional Help */}
                {hasUploadedFile && <HelpText section="analysis" />}
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
                    {...(queuePosition !== undefined && { queuePosition })}
                    {...(estimatedWaitTime !== undefined && {
                      estimatedWaitTime,
                    })}
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

      {/* Data Deletion Dialog */}
      <DataDeletionDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDataDeletion}
        sessionId={threadId || ''}
      />

      {/* Success Snackbar */}
      <Snackbar
        open={deleteSuccess}
        autoHideDuration={4000}
        onClose={() => setDeleteSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setDeleteSuccess(false)}
          severity="success"
          variant="filled"
          sx={{ width: '100%' }}
        >
          All your data has been permanently deleted
        </Alert>
      </Snackbar>
    </AnalystMuiScaffold>
  );
}
