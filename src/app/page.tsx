'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChatPane,
  FileUploader,
  QuickActions,
  ArtifactsPanel,
  HelpText,
  SecurityWarnings,
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
  AppBar,
  Toolbar,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  CloudUpload,
  Chat,
  DeleteForever,
  Assessment as AssessmentIcon,
  Menu as MenuIcon,
} from '@mui/icons-material';
import { ChatMessage, ArtifactItem } from '@/types';

export default function Home() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [hasUploadedFile, setHasUploadedFile] = useState(false);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [queuePosition, setQueuePosition] = useState<number | undefined>();
  const [estimatedWaitTime, setEstimatedWaitTime] = useState<
    number | undefined
  >();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [securityData, setSecurityData] = useState<any>(null);
  const [securityExpanded, setSecurityExpanded] = useState(false);
  const [isProfiling, setIsProfiling] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [showArtifactsDrawer, setShowArtifactsDrawer] = useState(false);

  // Memoize callbacks to prevent useChat hook from recreating connections
  const handleArtifactCreated = useCallback((artifact: any) => {
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
  }, []);

  const handleQueueUpdate = useCallback(
    (position?: number, waitTime?: number) => {
      setQueuePosition(position);
      setEstimatedWaitTime(waitTime);
    },
    []
  );

  const {
    messages,
    isConnected,
    isRunning,
    runStatus: hookRunStatus,
    connectionError,
    sendMessage,
    cancelRun,
    addMessage,
  } = useChat({
    threadId: threadId ?? undefined,
    onArtifactCreated: handleArtifactCreated,
    onQueueUpdate: handleQueueUpdate,
  });

  // Initialize thread on mount - will be replaced with real thread when profiling starts
  useEffect(() => {
    // Start with null threadId - will be set when profiling begins
    setThreadId(null);
  }, []);

  // Update elapsed time for running analyses
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let startTime: number;

    if (hookRunStatus === 'running') {
      startTime = Date.now();
      setElapsedTime(0); // Start from 0
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

    // System message suppressed - file upload status no longer shown in chat

    // Automatically start profiling to create OpenAI thread
    setIsProfiling(true);
    try {
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

      // Capture security data from profile response
      console.log('🛡️ [Main] Profile data received:', {
        status: profileData.status,
        hasProfile: !!profileData.profile,
        hasSecurity: !!profileData.profile?.security,
        securityData: profileData.profile?.security,
      });

      if (profileData.status === 'completed' && profileData.profile?.security) {
        console.log(
          '🛡️ [Main] Setting security data:',
          profileData.profile.security
        );
        // Add metadata and quality info for complete SecurityWarnings component
        const securityDataWithExtras = {
          ...profileData.profile.security,
          metadata: profileData.profile.metadata,
          quality: profileData.profile.quality,
          insights: profileData.profile.insights,
        };
        setSecurityData(securityDataWithExtras);
        // Expand security accordion when file upload completes
        setSecurityExpanded(true);
      }

      // System message suppressed - no need to show profiling status to user
    } catch (error) {
      console.error('Failed to start profiling:', error);

      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        role: 'system',
        content: `❌ Failed to start analysis: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };

      addMessage(errorMessage);
    } finally {
      setIsProfiling(false);
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

    // Send the message using the useChat hook's sendMessage function
    // This ensures the user message is properly displayed in the chat
    try {
      await sendMessage(query, currentFileId);
    } catch (error) {
      console.error('Failed to send quick action message:', error);
      // Add error message to chat
      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        role: 'system',
        content: `❌ Failed to start ${actionId} analysis: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
      addMessage(errorMessage);
    }
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
    setElapsedTime(0);
    setQueuePosition(undefined);
    setEstimatedWaitTime(undefined);

    // Show success message
    setDeleteSuccess(true);

    // Reset to null threadId - will be set when next profiling begins
    setThreadId(null);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{ zIndex: theme.zIndex.drawer + 1 }}
        elevation={1}
      >
        <Toolbar>
          <AssessmentIcon sx={{ mr: 2 }} />
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            AI Data Analyst
          </Typography>
          <Tooltip title="Toggle artifacts panel">
            <IconButton
              color="inherit"
              onClick={() => setShowArtifactsDrawer(!showArtifactsDrawer)}
              edge="end"
            >
              <MenuIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        {/* Spacer for fixed AppBar */}
        <Toolbar />
        {/* Content area - full height */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header section */}
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

          {/* Main grid content */}
          <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <Grid container sx={{ height: '100%', position: 'relative' }}>
              {/* Left sidebar - File upload and quick actions */}
              <Grid
                item
                xs={12}
                md={showArtifactsDrawer && !isMobile ? 3 : 4}
                sx={{ borderRight: 1, borderColor: 'divider', p: 2 }}
              >
                <Stack spacing={3}>
                  {/* File upload */}
                  <Box>
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

                  {/* Security warnings */}
                  <SecurityWarnings
                    securityData={securityData}
                    expanded={securityExpanded}
                    onExpandedChange={setSecurityExpanded}
                  />

                  {/* Help Text */}
                  {!hasUploadedFile && <HelpText section="upload" compact />}

                  {/* Additional Help */}
                  {hasUploadedFile && <HelpText section="analysis" />}
                </Stack>
              </Grid>

              {/* Main chat area */}
              <Grid
                item
                xs={12}
                md={showArtifactsDrawer && !isMobile ? 6 : 8}
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box sx={{ flex: 1, m: 2 }}>
                  {threadId ? (
                    <ChatPane
                      threadId={threadId}
                      messages={messages}
                      onSendMessage={sendMessage}
                      onCancelRun={cancelRun}
                      disabled={!hasUploadedFile}
                      isRunning={isRunning || isProfiling}
                      fileId={currentFileId}
                      isConnected={isConnected}
                      connectionError={connectionError}
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
      </Box>

      {/* Artifacts drawer - full height */}
      {showArtifactsDrawer && (
        <Box
          sx={{
            position: 'fixed',
            top: 64, // Height of AppBar
            right: 0,
            width: isMobile ? '100vw' : 320,
            height: 'calc(100vh - 64px)',
            bgcolor: 'background.paper',
            borderLeft: 1,
            borderColor: 'divider',
            p: 2,
            zIndex: theme.zIndex.drawer,
            overflow: 'auto',
          }}
        >
          <Typography variant="h6" gutterBottom>
            Artifacts
          </Typography>
          <ArtifactsPanel
            artifacts={artifacts}
            threadId={threadId ?? undefined}
          />
        </Box>
      )}
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
    </Box>
  );
}
