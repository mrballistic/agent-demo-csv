'use client';

import React, { useCallback, useState, useRef } from 'react';
import {
  Box,
  Button,
  Typography,
  LinearProgress,
  Alert,
  Snackbar,
  Paper,
  Stack,
  Chip,
} from '@mui/material';
import {
  CloudUpload,
  InsertDriveFile,
  CheckCircle,
  Error as ErrorIcon,
} from '@mui/icons-material';

interface FileUploadResult {
  fileId: string;
  filename: string;
  size: number;
  rowCount: number;
  profileHints: {
    columnCount: number;
    hasHeaders: boolean;
    sampleData: string[][];
  };
}

interface FileUploaderProps {
  onFileUploaded: (result: FileUploadResult) => void;
  onSystemMessage: (message: string) => void;
  disabled?: boolean;
  className?: string;
}

interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  success: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  onFileUploaded,
  onSystemMessage,
  disabled = false,
  className,
}) => {
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    success: false,
  });
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetUploadState = useCallback(() => {
    setUploadState({
      isUploading: false,
      progress: 0,
      error: null,
      success: false,
    });
    setSelectedFile(null);
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    // Check file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return 'Please upload a CSV file. Other formats are not supported.';
    }

    // Check file size (50MB limit)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      const sizeMB = Math.round(file.size / 1024 / 1024);
      return `File size (${sizeMB}MB) exceeds the 50MB limit. Please upload a smaller file.`;
    }

    // Check if file is empty
    if (file.size === 0) {
      return 'The selected file appears to be empty. Please upload a valid CSV file.';
    }

    return null;
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setUploadState(prev => ({
          ...prev,
          error: validationError,
        }));
        return;
      }

      setUploadState({
        isUploading: true,
        progress: 0,
        error: null,
        success: false,
      });

      try {
        const formData = new FormData();
        formData.append('file', file);

        // Simulate progress for better UX
        const progressInterval = setInterval(() => {
          setUploadState(prev => ({
            ...prev,
            progress: Math.min(prev.progress + 10, 90),
          }));
        }, 200);

        const response = await fetch('/api/files/upload', {
          method: 'POST',
          body: formData,
        });

        clearInterval(progressInterval);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const result: FileUploadResult = await response.json();

        setUploadState({
          isUploading: false,
          progress: 100,
          error: null,
          success: true,
        });

        // Post system message
        const sizeKB = Math.round(file.size / 1024);
        const systemMessage = `File received: ${file.name} (${sizeKB}KB, ${result.rowCount} rows, ${result.profileHints.columnCount} columns)`;
        onSystemMessage(systemMessage);

        // Call success callback
        onFileUploaded(result);

        // Reset after a short delay
        setTimeout(resetUploadState, 2000);
      } catch (error) {
        setUploadState({
          isUploading: false,
          progress: 0,
          error: error instanceof Error ? error.message : 'Upload failed',
          success: false,
        });
      }
    },
    [validateFile, onFileUploaded, onSystemMessage, resetUploadState]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (disabled || uploadState.isUploading) {
        return;
      }

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file) {
          setSelectedFile(file);
          uploadFile(file);
        }
      }
    },
    [disabled, uploadState.isUploading, uploadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled || uploadState.isUploading) {
        return;
      }

      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file) {
          setSelectedFile(file);
          uploadFile(file);
        }
      }
    },
    [disabled, uploadState.isUploading, uploadFile]
  );

  const handleButtonClick = useCallback(() => {
    if (disabled || uploadState.isUploading) {
      return;
    }
    fileInputRef.current?.click();
  }, [disabled, uploadState.isUploading]);

  const handleCloseError = useCallback(() => {
    setUploadState(prev => ({ ...prev, error: null }));
  }, []);

  const isDisabled = disabled || uploadState.isUploading;

  return (
    <>
      <Paper
        {...(className && { className })}
        sx={{
          p: 3,
          border: 2,
          borderStyle: 'dashed',
          borderColor: dragActive
            ? 'primary.main'
            : uploadState.success
              ? 'success.main'
              : uploadState.error
                ? 'error.main'
                : 'divider',
          bgcolor: dragActive
            ? 'action.hover'
            : uploadState.success
              ? 'success.light'
              : uploadState.error
                ? 'error.light'
                : 'background.paper',
          transition: 'all 0.2s ease-in-out',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.6 : 1,
          '&:hover': {
            borderColor: isDisabled ? 'divider' : 'primary.main',
            bgcolor: isDisabled ? 'background.paper' : 'action.hover',
          },
        }}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleButtonClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          disabled={isDisabled}
        />

        <Stack spacing={2} alignItems="center">
          {uploadState.success ? (
            <CheckCircle color="success" sx={{ fontSize: 48 }} />
          ) : uploadState.error ? (
            <ErrorIcon color="error" sx={{ fontSize: 48 }} />
          ) : (
            <CloudUpload
              color={dragActive ? 'primary' : 'action'}
              sx={{ fontSize: 48 }}
            />
          )}

          <Typography
            variant="h6"
            color={
              uploadState.success
                ? 'success.main'
                : uploadState.error
                  ? 'error.main'
                  : 'text.primary'
            }
            align="center"
          >
            {uploadState.success
              ? 'File uploaded successfully!'
              : uploadState.error
                ? 'Upload failed'
                : dragActive
                  ? 'Drop your CSV file here'
                  : 'Upload CSV File'}
          </Typography>

          {!uploadState.success && !uploadState.error && (
            <Typography variant="body2" color="text.secondary" align="center">
              Drag and drop your CSV file here, or click to browse
              <br />
              Maximum file size: 50MB
            </Typography>
          )}

          {selectedFile && !uploadState.success && !uploadState.error && (
            <Chip
              icon={<InsertDriveFile />}
              label={`${selectedFile.name} (${Math.round(selectedFile.size / 1024)}KB)`}
              variant="outlined"
              size="small"
            />
          )}

          {uploadState.isUploading && (
            <Box sx={{ width: '100%', maxWidth: 300 }}>
              <LinearProgress
                variant="determinate"
                value={uploadState.progress}
                sx={{ mb: 1 }}
              />
              <Typography variant="body2" color="text.secondary" align="center">
                Uploading... {uploadState.progress}%
              </Typography>
            </Box>
          )}

          {!uploadState.isUploading &&
            !uploadState.success &&
            !uploadState.error && (
              <Button
                variant="contained"
                startIcon={<CloudUpload />}
                disabled={isDisabled}
                onClick={handleButtonClick}
              >
                Choose File
              </Button>
            )}
        </Stack>
      </Paper>

      {/* Error Toast */}
      <Snackbar
        open={!!uploadState.error}
        autoHideDuration={6000}
        onClose={handleCloseError}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseError}
          severity="error"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {uploadState.error}
        </Alert>
      </Snackbar>
    </>
  );
};

export default FileUploader;
