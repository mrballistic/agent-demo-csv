'use client';

import React from 'react';
import {
  Alert,
  AlertTitle,
  Button,
  Box,
  Typography,
  Stack,
  Chip,
  Paper,
} from '@mui/material';
import {
  Refresh,
  BugReport,
  Help,
  Warning,
  Error as ErrorIcon,
  Info,
} from '@mui/icons-material';

interface ErrorRecoveryProps {
  error: {
    type: 'validation' | 'api' | 'timeout' | 'system' | 'user';
    message: string;
    details?: string;
    code?: string;
  };
  onRetry?: () => void;
  onReset?: () => void;
  showDetails?: boolean;
  className?: string;
}

const ErrorRecovery: React.FC<ErrorRecoveryProps> = ({
  error,
  onRetry,
  onReset,
  showDetails = false,
  className,
}) => {
  const getErrorSeverity = (type: string) => {
    switch (type) {
      case 'validation':
      case 'user':
        return 'warning';
      case 'timeout':
        return 'info';
      case 'api':
      case 'system':
        return 'error';
      default:
        return 'error';
    }
  };

  const getErrorIcon = (type: string) => {
    switch (type) {
      case 'validation':
      case 'user':
        return <Warning />;
      case 'timeout':
        return <Info />;
      case 'api':
      case 'system':
        return <ErrorIcon />;
      default:
        return <BugReport />;
    }
  };

  const getRecoveryActions = (type: string) => {
    switch (type) {
      case 'validation':
        return {
          primary: 'Fix Data',
          secondary: 'Upload New File',
          guidance: 'Check your CSV file format and required columns.',
        };
      case 'user':
        return {
          primary: 'Try Again',
          secondary: 'Get Help',
          guidance: 'Review the requirements and try a different approach.',
        };
      case 'timeout':
        return {
          primary: 'Retry',
          secondary: 'Simplify Query',
          guidance: 'Try with a smaller dataset or simpler analysis.',
        };
      case 'api':
        return {
          primary: 'Retry',
          secondary: 'Check Status',
          guidance: 'This might be a temporary issue. Please try again.',
        };
      case 'system':
        return {
          primary: 'Refresh Page',
          secondary: 'Report Issue',
          guidance: 'A system error occurred. Refreshing might help.',
        };
      default:
        return {
          primary: 'Retry',
          secondary: 'Reset',
          guidance: 'An unexpected error occurred.',
        };
    }
  };

  const severity = getErrorSeverity(error.type) as 'warning' | 'info' | 'error';
  const icon = getErrorIcon(error.type);
  const actions = getRecoveryActions(error.type);

  const handlePrimaryAction = () => {
    if (error.type === 'system') {
      window.location.reload();
    } else if (onRetry) {
      onRetry();
    }
  };

  const handleSecondaryAction = () => {
    if (error.type === 'validation' || error.type === 'user') {
      if (onReset) {
        onReset();
      }
    } else if (error.type === 'system') {
      // Open support or report issue
      console.error('System error reported:', error);
    } else if (onReset) {
      onReset();
    }
  };

  return (
    <Paper
      {...(className && { className })}
      sx={{
        p: 3,
        border: 1,
        borderColor: `${severity}.main`,
        bgcolor: `${severity}.light`,
        borderRadius: 2,
      }}
    >
      <Alert
        severity={severity}
        icon={icon}
        sx={{
          bgcolor: 'transparent',
          border: 'none',
          p: 0,
          '& .MuiAlert-message': {
            width: '100%',
          },
        }}
      >
        <AlertTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {error.type === 'validation' && 'Data Validation Error'}
          {error.type === 'user' && 'User Input Error'}
          {error.type === 'timeout' && 'Analysis Timeout'}
          {error.type === 'api' && 'Service Error'}
          {error.type === 'system' && 'System Error'}
          {error.code && (
            <Chip
              label={error.code}
              size="small"
              variant="outlined"
              sx={{ ml: 'auto' }}
            />
          )}
        </AlertTitle>

        <Typography variant="body1" sx={{ mb: 2 }}>
          {error.message}
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {actions.guidance}
        </Typography>

        {showDetails && error.details && (
          <Box
            sx={{
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 1,
              mb: 2,
              border: 1,
              borderColor: 'divider',
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mb: 1, display: 'block' }}
            >
              Technical Details:
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
            >
              {error.details}
            </Typography>
          </Box>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button
            variant="contained"
            startIcon={error.type === 'system' ? <Refresh /> : <Refresh />}
            onClick={handlePrimaryAction}
            size="small"
          >
            {actions.primary}
          </Button>

          {(onReset || error.type === 'system') && (
            <Button
              variant="outlined"
              startIcon={error.type === 'system' ? <BugReport /> : <Help />}
              onClick={handleSecondaryAction}
              size="small"
            >
              {actions.secondary}
            </Button>
          )}
        </Stack>
      </Alert>
    </Paper>
  );
};

export default ErrorRecovery;
