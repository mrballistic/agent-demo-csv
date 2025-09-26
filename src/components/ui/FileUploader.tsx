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

  const handleSampleDataDownload = useCallback((filename: string) => {
    const link = document.createElement('a');
    link.href = `/sample-data/${filename}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const isDisabled = disabled || uploadState.isUploading;

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
                Or try our sample data
              </Typography>
            </Divider>

            <Grid container spacing={2}>
              {sampleDatasets.map(dataset => (
                <Grid item xs={12} md={4} key={dataset.filename}>
                  <Card
                    variant="outlined"
                    sx={{
                      height: '100%',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        boxShadow: 2,
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <CardContent sx={{ p: 2 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          mb: 1,
                        }}
                      >
                        {dataset.icon}
                        <Typography
                          variant="subtitle2"
                          sx={{ ml: 1, fontWeight: 'medium' }}
                        >
                          {dataset.name}
                        </Typography>
                      </Box>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 1 }}
                      >
                        {dataset.description}
                      </Typography>

                      <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={{ mb: 1, display: 'block' }}
                      >
                        {dataset.rows} rows • CSV format
                      </Typography>

                      <Box
                        sx={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 0.5,
                          mb: 1,
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

                      <Button
                        size="small"
                        startIcon={<Download />}
                        fullWidth
                        variant="outlined"
                        sx={{ mt: 'auto' }}
                        onClick={() =>
                          handleSampleDataDownload(dataset.filename)
                        }
                        aria-label={`Download ${dataset.name} sample data`}
                      >
                        Download Sample
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Typography variant="caption" color="text.disabled">
                Download a sample file, then upload it to see the AI data
                analyst in action
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
