'use client';

import React from 'react';
import { Chip, CircularProgress, Box } from '@mui/material';
import {
  Schedule,
  PlayArrow,
  CheckCircle,
  Error,
  Cancel,
  HourglassEmpty,
} from '@mui/icons-material';

interface RunStatusChipProps {
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  elapsedTime?: number;
  queuePosition?: number;
  onRetry?: () => void;
  onCancel?: () => void;
  className?: string;
}

const RunStatusChip: React.FC<RunStatusChipProps> = ({
  status,
  elapsedTime,
  queuePosition,
  onRetry,
  onCancel,
  className,
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'idle':
        return {
          label: 'Ready',
          color: 'default' as const,
          icon: <Schedule />,
          variant: 'outlined' as const,
        };
      case 'queued':
        return {
          label: queuePosition ? `Queued (#${queuePosition})` : 'Queued',
          color: 'info' as const,
          icon: <HourglassEmpty />,
          variant: 'filled' as const,
        };
      case 'running':
        return {
          label: elapsedTime
            ? `Running (${Math.round(elapsedTime / 1000)}s)`
            : 'Running',
          color: 'primary' as const,
          icon: <CircularProgress size={16} />,
          variant: 'filled' as const,
        };
      case 'completed':
        return {
          label: elapsedTime
            ? `Completed (${Math.round(elapsedTime / 1000)}s)`
            : 'Completed',
          color: 'success' as const,
          icon: <CheckCircle />,
          variant: 'filled' as const,
        };
      case 'failed':
        return {
          label: 'Failed',
          color: 'error' as const,
          icon: <Error />,
          variant: 'filled' as const,
        };
      case 'cancelled':
        return {
          label: 'Cancelled',
          color: 'warning' as const,
          icon: <Cancel />,
          variant: 'filled' as const,
        };
      default:
        return {
          label: 'Unknown',
          color: 'default' as const,
          icon: <Schedule />,
          variant: 'outlined' as const,
        };
    }
  };

  const config = getStatusConfig();

  const handleClick = () => {
    if (status === 'failed' && onRetry) {
      onRetry();
    } else if ((status === 'running' || status === 'queued') && onCancel) {
      onCancel();
    }
  };

  const isClickable = Boolean(
    (status === 'failed' && onRetry) ||
      ((status === 'running' || status === 'queued') && onCancel)
  );

  return (
    <Box className={className}>
      <Chip
        icon={config.icon}
        label={config.label}
        color={config.color}
        variant={config.variant}
        size="small"
        onClick={isClickable ? handleClick : undefined}
        clickable={isClickable}
        sx={{
          cursor: isClickable ? 'pointer' : 'default',
          '& .MuiChip-icon': {
            fontSize: '16px',
          },
          ...(status === 'running' && {
            animation: 'pulse 2s infinite',
            '@keyframes pulse': {
              '0%': { opacity: 1 },
              '50%': { opacity: 0.7 },
              '100%': { opacity: 1 },
            },
          }),
        }}
      />

      {/* Additional action hints */}
      {status === 'failed' && onRetry && (
        <Box
          component="span"
          sx={{ ml: 1, fontSize: '0.75rem', color: 'text.secondary' }}
        >
          Click to retry
        </Box>
      )}
      {(status === 'running' || status === 'queued') && onCancel && (
        <Box
          component="span"
          sx={{ ml: 1, fontSize: '0.75rem', color: 'text.secondary' }}
        >
          Click to cancel
        </Box>
      )}
    </Box>
  );
};

export default RunStatusChip;
