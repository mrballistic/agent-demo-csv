'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Alert,
  Box,
  CircularProgress,
} from '@mui/material';
import { Warning, Delete } from '@mui/icons-material';

interface DataDeletionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  sessionId?: string;
}

const DataDeletionDialog: React.FC<DataDeletionDialogProps> = ({
  open,
  onClose,
  onConfirm,
  sessionId,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredText = 'DELETE ALL MY DATA';
  const isConfirmValid = confirmText === requiredText;

  const handleConfirm = async () => {
    if (!isConfirmValid || !sessionId) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch('/api/data/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          confirmText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete data');
      }

      // Call parent confirmation handler
      await onConfirm();

      // Close dialog
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete data');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmText('');
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="data-deletion-title"
      aria-describedby="data-deletion-description"
    >
      <DialogTitle
        id="data-deletion-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          color: 'error.main',
        }}
      >
        <Warning />
        Delete All My Data
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography
            id="data-deletion-description"
            variant="body1"
            sx={{ mb: 2 }}
          >
            This action will permanently delete:
          </Typography>

          <Box component="ul" sx={{ pl: 2, mb: 2 }}>
            <Typography component="li" variant="body2">
              All uploaded CSV files
            </Typography>
            <Typography component="li" variant="body2">
              All generated analysis results and charts
            </Typography>
            <Typography component="li" variant="body2">
              Your chat history and session data
            </Typography>
            <Typography component="li" variant="body2">
              Any exported artifacts and reports
            </Typography>
          </Box>

          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>This action cannot be undone.</strong> All your data will
              be permanently removed from our servers.
            </Typography>
          </Alert>
        </Box>

        <Typography variant="body2" sx={{ mb: 1, fontWeight: 'medium' }}>
          To confirm, type &quot;{requiredText}&quot; below:
        </Typography>

        <TextField
          fullWidth
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder={requiredText}
          disabled={isDeleting}
          error={confirmText.length > 0 && !isConfirmValid}
          helperText={
            confirmText.length > 0 && !isConfirmValid
              ? 'Text must match exactly'
              : ''
          }
          sx={{ mb: 2 }}
          aria-label="Confirmation text input"
        />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={isDeleting} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={!isConfirmValid || isDeleting}
          color="error"
          variant="contained"
          startIcon={
            isDeleting ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <Delete />
            )
          }
          aria-label="Confirm data deletion"
        >
          {isDeleting ? 'Deleting...' : 'Delete All Data'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DataDeletionDialog;
