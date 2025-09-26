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
  Divider,
  Link,
  Card,
  CardContent,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
} from '@mui/material';
import {
  CloudUpload,
  InsertDriveFile,
  CheckCircle,
  Error as ErrorIcon,
  Download,
  DataObject,
  Warning,
  TrendingUp,
  ExpandMore,
  ExpandLess,
  Upload,
  PlayArrow,
} from '@mui/icons-material';
import { announceToScreenReader, srOnlyStyles } from '@/lib/accessibility';

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
  showSampleData?: boolean;
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
  showSampleData = true,
}) => {
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    success: false,
  });
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [expanded, setExpanded] = useState<string | false>('upload');
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

  const handleAccordionChange = useCallback(
    (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
      setExpanded(isExpanded ? panel : false);
    },
    []
  );

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

        // Announce success to screen readers
        announceToScreenReader(
          `File uploaded successfully: ${file.name}`,
          'polite'
        );

        // Call success callback
        onFileUploaded(result);

        // Collapse uploader after a short delay (but keep success state)
        setTimeout(() => {
          setExpanded(false);
        }, 2000);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Upload failed';
        setUploadState({
          isUploading: false,
          progress: 0,
          error: errorMessage,
          success: false,
        });

        // Announce error to screen readers
        announceToScreenReader(`Upload failed: ${errorMessage}`, 'assertive');
      }
    },
    [validateFile, onFileUploaded, onSystemMessage]
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

  const handleSampleDataClick = useCallback(
    async (filename: string, datasetName: string) => {
      if (isDisabled) return;

      try {
        // Fetch the sample CSV file
        const response = await fetch(`/sample-data/${filename}`);
        if (!response.ok) {
          throw new Error('Failed to load sample data');
        }

        const csvContent = await response.text();

        // Create a File object from the CSV content
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const file = new File([blob], filename, { type: 'text/csv' });

        // Validate the file (same as regular upload)
        const validationError = validateFile(file);
        if (validationError) {
          setUploadState({
            isUploading: false,
            progress: 0,
            error: validationError,
            success: false,
          });
          return;
        }

        // Update upload state to show progress
        setUploadState({
          isUploading: true,
          progress: 0,
          error: null,
          success: false,
        });

        // Simulate progress for demo effect
        let progress = 0;
        const progressInterval = setInterval(() => {
          progress = Math.min(progress + Math.random() * 30, 85);
          setUploadState(prev => ({ ...prev, progress }));
        }, 100);

        // Create form data and upload
        const formData = new FormData();
        formData.append('file', file);

        const uploadResponse = await fetch('/api/files/upload', {
          method: 'POST',
          body: formData,
        });

        clearInterval(progressInterval);

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const result: FileUploadResult = await uploadResponse.json();

        setUploadState({
          isUploading: false,
          progress: 100,
          error: null,
          success: true,
        });

        // Post system message
        const sizeKB = Math.round(file.size / 1024);
        const systemMessage = `Sample data loaded: ${datasetName} (${sizeKB}KB, ${result.rowCount} rows, ${result.profileHints.columnCount} columns)`;
        onSystemMessage(systemMessage);

        // Announce success to screen readers
        announceToScreenReader(
          `Sample data loaded successfully: ${datasetName}`,
          'polite'
        );

        // Call success callback
        onFileUploaded(result);

        // Collapse uploader after a short delay (but keep success state)
        setTimeout(() => {
          setExpanded(false);
        }, 1500);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to load sample data';
        setUploadState({
          isUploading: false,
          progress: 0,
          error: errorMessage,
          success: false,
        });

        // Announce error to screen readers
        announceToScreenReader(
          `Error loading sample data: ${errorMessage}`,
          'assertive'
        );
      }
    },
    [isDisabled, validateFile, onFileUploaded, onSystemMessage, setExpanded]
  );

  const sampleDatasets = [
    {
      name: 'Valid Sales Data',
      filename: 'valid-sales-data.csv',
      description: 'Clean sales data with all required columns',
      icon: <DataObject color="primary" />,
      rows: 20,
      features: ['Revenue analysis', 'Channel performance', 'Trend analysis'],
    },
    {
      name: 'Data with PII',
      filename: 'pii-sales-data.csv',
      description: 'Sales data containing email and phone columns',
      icon: <Warning color="warning" />,
      rows: 15,
      features: [
        'PII detection demo',
        'Data privacy handling',
        'Aggregated insights',
      ],
    },
    {
      name: 'Data with Outliers',
      filename: 'outliers-sales-data.csv',
      description: 'Sales data with unusual patterns and outliers',
      icon: <TrendingUp color="secondary" />,
      rows: 20,
      features: ['Outlier detection', 'Data quality issues', 'Error handling'],
    },
  ];

  return (
    <Accordion
      expanded={expanded === 'upload'}
      onChange={handleAccordionChange('upload')}
      sx={{ mb: 1 }}
    >
      <AccordionSummary
        expandIcon={<ExpandMore />}
        aria-controls="upload-content"
        id="upload-header"
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Upload color={uploadState.success ? 'success' : 'primary'} />
          <Typography variant="subtitle2">
            Upload Data
            {uploadState.success && (
              <Chip
                label="Complete"
                size="small"
                color="success"
                variant="outlined"
                sx={{ ml: 1 }}
              />
            )}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {/* Upload widget */}
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
            opacity: isDisabled ? 0.6 : 1,
          }}
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={isDisabled}
            aria-label="Choose CSV file"
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
                    : 'Drag and drop your CSV file here'}
            </Typography>

            {!uploadState.success && !uploadState.error && (
              <Box sx={{ textAlign: 'center' }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  id="upload-instructions"
                  sx={{ mb: 1 }}
                >
                  Drag and drop your CSV file here, or click to browse
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  Maximum file size: 50MB • Supported format: CSV
                  <br />
                  Required columns: order_date, qty, unit_price (or net_revenue)
                </Typography>
              </Box>
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
                  aria-label={`Upload progress: ${uploadState.progress}%`}
                />
                <Typography
                  variant="body2"
                  color="text.secondary"
                  align="center"
                  role="status"
                  aria-live="polite"
                >
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
                  aria-label="Choose CSV file to upload"
                  aria-describedby="upload-instructions"
                >
                  Choose File
                </Button>
              )}
          </Stack>
        </Paper>

        {/* Sample Data Section */}
        {showSampleData && (
          <Box sx={{ mt: 3 }}>
            <Divider sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Try sample data instantly
              </Typography>
            </Divider>

            <Grid container spacing={2}>
              {sampleDatasets.map(dataset => (
                <Grid item xs={12} key={dataset.filename}>
                  <Card
                    variant="outlined"
                    sx={{
                      transition: 'all 0.2s ease-in-out',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      opacity: isDisabled ? 0.6 : 1,
                      '&:hover': {
                        boxShadow: isDisabled ? 'none' : 2,
                        borderColor: isDisabled ? 'divider' : 'primary.main',
                        bgcolor: isDisabled ? 'transparent' : 'action.hover',
                      },
                    }}
                    onClick={() =>
                      !isDisabled &&
                      handleSampleDataClick(dataset.filename, dataset.name)
                    }
                  >
                    <CardContent sx={{ p: 2 }}>
                      <Box sx={{ position: 'relative' }}>
                        {/* Feature chips in top-right */}
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 0.5,
                            justifyContent: 'flex-end',
                          }}
                        >
                          {dataset.features.slice(0, 2).map(feature => (
                            <Chip
                              key={feature}
                              label={feature}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.7rem', height: 20 }}
                            />
                          ))}
                          {dataset.features.length > 2 && (
                            <Chip
                              label={`+${dataset.features.length - 2} more`}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.7rem', height: 20 }}
                            />
                          )}
                        </Box>

                        {/* Main content area */}
                        <Box sx={{ pr: 12 }}>
                          {/* Header with icon and title */}
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              mb: 1,
                            }}
                          >
                            <Box sx={{ mr: 2 }}>{dataset.icon}</Box>
                            <Typography
                              variant="subtitle2"
                              sx={{ fontWeight: 'medium' }}
                            >
                              {dataset.name}
                            </Typography>
                          </Box>

                          {/* Description text */}
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mb: 1, lineHeight: 1.4 }}
                          >
                            {dataset.description}
                          </Typography>

                          {/* Metadata */}
                          <Typography
                            variant="caption"
                            color="text.disabled"
                            sx={{ mb: 2, display: 'block' }}
                          >
                            {dataset.rows} rows • CSV format
                          </Typography>

                          {/* Try Demo button in bottom-left */}
                          <Button
                            size="small"
                            startIcon={
                              uploadState.isUploading ? (
                                <CircularProgress size={16} />
                              ) : (
                                <PlayArrow />
                              )
                            }
                            variant="contained"
                            disabled={isDisabled}
                            onClick={e => {
                              e.stopPropagation();
                              !isDisabled &&
                                handleSampleDataClick(
                                  dataset.filename,
                                  dataset.name
                                );
                            }}
                            aria-label={`Try ${dataset.name} sample data`}
                            sx={{ minWidth: 100 }}
                          >
                            {uploadState.isUploading
                              ? 'Loading...'
                              : 'Try Demo'}
                          </Button>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Typography variant="caption" color="text.disabled">
                Click any sample dataset above to try it instantly, or upload
                your own CSV file.
              </Typography>
            </Box>
          </Box>
        )}

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
      </AccordionDetails>
    </Accordion>
  );
};

export default FileUploader;
