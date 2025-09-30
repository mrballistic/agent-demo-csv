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

interface DataProfile {
  id: string;
  metadata: {
    filename: string;
    size: number;
    rowCount: number;
    columnCount: number;
    processingTime: number;
  };
  schema: {
    columns: Array<{
      name: string;
      type: string;
      unique: boolean;
      nullable: boolean;
      qualityFlags: string[];
      sampleValues: string[];
      statistics?: any;
    }>;
  };
  quality: {
    overall: number;
    dimensions: {
      completeness: number;
      consistency: number;
      accuracy: number;
      uniqueness: number;
      validity: number;
    };
    issues: string[];
  };
  insights: {
    keyFindings: string[];
    recommendations: string[];
    suggestedQueries: string[];
  };
  security: {
    piiColumns: string[];
    riskLevel: string;
    recommendations: string[];
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
  isProfileLoading: boolean;
  profile: DataProfile | null;
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
    isProfileLoading: false,
    profile: null,
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
      isProfileLoading: false,
      profile: null,
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

    // Check file size (4MB limit for Vercel compatibility)
    const maxSize = 4 * 1024 * 1024; // 4MB
    if (file.size > maxSize) {
      const sizeMB = Math.round(file.size / 1024 / 1024);
      return `File size (${sizeMB}MB) exceeds the 4MB limit for serverless deployment. Please upload a smaller file or use the sample data.`;
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
        isProfileLoading: false,
        profile: null,
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
          isProfileLoading: true,
          profile: null,
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

        // Now fetch the data profile
        try {
          const profileResponse = await fetch('/api/analysis/profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fileId: result.fileId }),
          });

          if (profileResponse.ok) {
            const profileResult = await profileResponse.json();
            if (profileResult.success && profileResult.data.profile) {
              setUploadState(prev => ({
                ...prev,
                isProfileLoading: false,
                profile: profileResult.data.profile,
              }));
            }
          }
        } catch (profileError) {
          console.warn('Failed to fetch data profile:', profileError);
          setUploadState(prev => ({
            ...prev,
            isProfileLoading: false,
          }));
        }

        // Collapse uploader after a short delay (but keep success state)
        setTimeout(() => {
          setExpanded(false);
        }, 3000);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Upload failed';
        setUploadState({
          isUploading: false,
          progress: 0,
          error: errorMessage,
          success: false,
          isProfileLoading: false,
          profile: null,
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
            isProfileLoading: false,
            profile: null,
          });
          return;
        }

        // Update upload state to show progress
        setUploadState({
          isUploading: true,
          progress: 0,
          error: null,
          success: false,
          isProfileLoading: false,
          profile: null,
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
          isProfileLoading: true,
          profile: null,
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

        // Now fetch the data profile
        try {
          const profileResponse = await fetch('/api/analysis/profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fileId: result.fileId }),
          });

          if (profileResponse.ok) {
            const profileResult = await profileResponse.json();
            if (profileResult.success && profileResult.data.profile) {
              setUploadState(prev => ({
                ...prev,
                isProfileLoading: false,
                profile: profileResult.data.profile,
              }));
            }
          }
        } catch (profileError) {
          console.warn('Failed to fetch data profile:', profileError);
          setUploadState(prev => ({
            ...prev,
            isProfileLoading: false,
          }));
        }

        // Collapse uploader after a short delay (but keep success state)
        setTimeout(() => {
          setExpanded(false);
        }, 3000);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to load sample data';
        setUploadState({
          isUploading: false,
          progress: 0,
          error: errorMessage,
          success: false,
          isProfileLoading: false,
          profile: null,
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
      name: 'Comprehensive Sales Data',
      filename: 'ai-analyst-demo_orders_medium.csv',
      description:
        'Rich sales dataset with customer details, channels, and product categories',
      icon: <DataObject color="primary" />,
      rows: 20000,
      features: [
        'Deep revenue analysis',
        'Customer segmentation',
        'Multi-channel insights',
        'Geographic analysis',
      ],
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
              <CheckCircle sx={{ fontSize: 48, color: 'success.dark' }} />
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
                  ? 'success.dark'
                  : uploadState.error
                    ? 'error.main'
                    : dragActive
                      ? 'text.secondary'
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
                  color={dragActive ? 'text.secondary' : 'text.secondary'}
                  id="upload-instructions"
                  sx={{ mb: 1 }}
                >
                  Drag and drop your CSV file here, or click to browse
                </Typography>
                <Typography
                  variant="caption"
                  color={dragActive ? 'text.secondary' : 'text.disabled'}
                >
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
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          height: '100%',
                        }}
                      >
                        {/* Left side - Content */}
                        <Box sx={{ flex: 1, mr: 2 }}>
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
                            sx={{ mb: 0, display: 'block' }}
                          >
                            {dataset.rows} rows • CSV format
                          </Typography>
                        </Box>

                        {/* Right side - Action button */}
                        <Box sx={{ flexShrink: 0 }}>
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

        {/* Data Profile Display */}
        {uploadState.success &&
          (uploadState.isProfileLoading || uploadState.profile) && (
            <Box sx={{ mt: 3 }}>
              <Divider sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Data Profile Analysis
                </Typography>
              </Divider>

              {uploadState.isProfileLoading ? (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    py: 4,
                  }}
                >
                  <CircularProgress size={24} sx={{ mr: 2 }} />
                  <Typography variant="body2" color="text.secondary">
                    Analyzing data structure and quality...
                  </Typography>
                </Box>
              ) : uploadState.profile ? (
                <Grid container spacing={2}>
                  {/* Overview Card */}
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography
                          variant="subtitle2"
                          gutterBottom
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <DataObject color="primary" fontSize="small" />
                          Dataset Overview
                        </Typography>
                        <Stack spacing={1}>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              Rows:
                            </Typography>
                            <Typography variant="body2" fontWeight="medium">
                              {uploadState.profile.metadata.rowCount.toLocaleString()}
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              Columns:
                            </Typography>
                            <Typography variant="body2" fontWeight="medium">
                              {uploadState.profile.metadata.columnCount}
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              Processing Time:
                            </Typography>
                            <Typography variant="body2" fontWeight="medium">
                              {uploadState.profile.metadata.processingTime}ms
                            </Typography>
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* Quality Score Card */}
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography
                          variant="subtitle2"
                          gutterBottom
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <CheckCircle color="success" fontSize="small" />
                          Data Quality Score
                        </Typography>
                        <Box
                          sx={{ display: 'flex', alignItems: 'center', mb: 2 }}
                        >
                          <Typography
                            variant="h4"
                            color="success.main"
                            fontWeight="bold"
                          >
                            {uploadState.profile.quality.overall}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ ml: 1 }}
                          >
                            / 100
                          </Typography>
                        </Box>
                        <Stack spacing={1}>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              Completeness:
                            </Typography>
                            <Typography variant="body2" fontWeight="medium">
                              {
                                uploadState.profile.quality.dimensions
                                  .completeness
                              }
                              %
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              Consistency:
                            </Typography>
                            <Typography variant="body2" fontWeight="medium">
                              {
                                uploadState.profile.quality.dimensions
                                  .consistency
                              }
                              %
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              Accuracy:
                            </Typography>
                            <Typography variant="body2" fontWeight="medium">
                              {uploadState.profile.quality.dimensions.accuracy}%
                            </Typography>
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* Column Analysis */}
                  <Grid item xs={12}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography
                          variant="subtitle2"
                          gutterBottom
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <TrendingUp color="secondary" fontSize="small" />
                          Column Analysis
                        </Typography>
                        <Grid container spacing={1}>
                          {uploadState.profile.schema.columns
                            .slice(0, 6)
                            .map((column, index) => (
                              <Grid item xs={12} sm={6} md={4} key={index}>
                                <Box
                                  sx={{
                                    p: 1,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 1,
                                  }}
                                >
                                  <Typography
                                    variant="body2"
                                    fontWeight="medium"
                                    noWrap
                                    title={column.name}
                                  >
                                    {column.name}
                                  </Typography>
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 1,
                                      mt: 0.5,
                                    }}
                                  >
                                    <Chip
                                      label={column.type}
                                      size="small"
                                      color={
                                        column.type === 'numeric'
                                          ? 'primary'
                                          : column.type === 'text'
                                            ? 'secondary'
                                            : 'default'
                                      }
                                      variant="outlined"
                                    />
                                    {column.qualityFlags.length > 0 && (
                                      <Warning
                                        color="warning"
                                        fontSize="small"
                                      />
                                    )}
                                  </Box>
                                </Box>
                              </Grid>
                            ))}
                        </Grid>
                        {uploadState.profile.schema.columns.length > 6 && (
                          <Typography
                            variant="caption"
                            color="text.disabled"
                            sx={{ mt: 1, display: 'block' }}
                          >
                            ... and{' '}
                            {uploadState.profile.schema.columns.length - 6} more
                            columns
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* Insights & Recommendations */}
                  {(uploadState.profile.insights.keyFindings.length > 0 ||
                    uploadState.profile.insights.recommendations.length >
                      0) && (
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography
                            variant="subtitle2"
                            gutterBottom
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            <TrendingUp color="info" fontSize="small" />
                            Key Insights & Recommendations
                          </Typography>
                          {uploadState.profile.insights.keyFindings.length >
                            0 && (
                            <Box sx={{ mb: 2 }}>
                              <Typography
                                variant="body2"
                                fontWeight="medium"
                                color="text.secondary"
                                gutterBottom
                              >
                                Key Findings:
                              </Typography>
                              <Stack spacing={0.5}>
                                {uploadState.profile.insights.keyFindings.map(
                                  (finding, index) => (
                                    <Typography
                                      key={index}
                                      variant="body2"
                                      sx={{ '&::before': { content: '"• "' } }}
                                    >
                                      {finding}
                                    </Typography>
                                  )
                                )}
                              </Stack>
                            </Box>
                          )}
                          {uploadState.profile.insights.recommendations.length >
                            0 && (
                            <Box>
                              <Typography
                                variant="body2"
                                fontWeight="medium"
                                color="text.secondary"
                                gutterBottom
                              >
                                Recommendations:
                              </Typography>
                              <Stack spacing={0.5}>
                                {uploadState.profile.insights.recommendations.map(
                                  (rec, index) => (
                                    <Typography
                                      key={index}
                                      variant="body2"
                                      sx={{ '&::before': { content: '"• "' } }}
                                    >
                                      {rec}
                                    </Typography>
                                  )
                                )}
                              </Stack>
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  )}

                  {/* Security & PII Information */}
                  {uploadState.profile.security.piiColumns.length > 0 && (
                    <Grid item xs={12}>
                      <Card
                        variant="outlined"
                        sx={{ borderColor: 'warning.main' }}
                      >
                        <CardContent>
                          <Typography
                            variant="subtitle2"
                            gutterBottom
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            <Warning color="warning" fontSize="small" />
                            Privacy and Security Notice
                          </Typography>
                          <Alert severity="warning" variant="outlined">
                            <Typography variant="body2">
                              Detected{' '}
                              {uploadState.profile.security.piiColumns.length}{' '}
                              column(s) with potentially sensitive data:{' '}
                              <strong>
                                {uploadState.profile.security.piiColumns.join(
                                  ', '
                                )}
                              </strong>
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              Risk Level:{' '}
                              <strong>
                                {uploadState.profile.security.riskLevel}
                              </strong>
                            </Typography>
                          </Alert>
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                </Grid>
              ) : null}
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
