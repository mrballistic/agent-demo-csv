'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import {
  Download,
  Archive,
  Image,
  InsertDriveFile,
  TableChart,
  SelectAll,
  Clear,
} from '@mui/icons-material';
import {
  KeyboardNavigation,
  generateChartAltText,
  announceToScreenReader,
  srOnlyStyles,
} from '@/lib/accessibility';

export interface ArtifactItem {
  id: string;
  name: string;
  type: 'file' | 'image' | 'data';
  size?: number;
  downloadUrl: string;
  createdAt?: number;
  mimeType?: string;
  altText?: string;
  manifest?: {
    insight?: string;
    metadata?: {
      analysis_type?: string;
      columns_used?: string[];
    };
  };
}

interface ArtifactsPanelProps {
  artifacts: ArtifactItem[];
  sessionId?: string | undefined;
  threadId?: string | undefined;
  onDownload?: (artifactId: string) => void;
  onBulkExport?: (artifactIds: string[]) => void;
}

export function ArtifactsPanel({
  artifacts,
  sessionId,
  threadId,
  onDownload,
  onBulkExport,
}: ArtifactsPanelProps) {
  const [selectedArtifacts, setSelectedArtifacts] = useState<Set<string>>(
    new Set()
  );
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const handleDownload = async (artifactId: string) => {
    try {
      const artifact = artifacts.find(a => a.id === artifactId);
      if (onDownload) {
        onDownload(artifactId);
      } else {
        // Default download behavior
        if (artifact) {
          window.open(artifact.downloadUrl, '_blank');
        }
      }

      // Announce download to screen readers
      if (artifact) {
        announceToScreenReader(`Downloading ${artifact.name}`, 'polite');
      }
    } catch (error) {
      console.error('Download failed:', error);
      announceToScreenReader('Download failed', 'assertive');
    }
  };

  const handleBulkExport = async () => {
    if (selectedArtifacts.size === 0) {
      return;
    }

    setIsExporting(true);
    setExportError(null);
    announceToScreenReader('Starting export...', 'polite');

    try {
      const artifactIds = Array.from(selectedArtifacts);

      if (onBulkExport) {
        await onBulkExport(artifactIds);
      } else {
        // Default bulk export behavior
        const response = await fetch('/api/export/artifacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId,
            threadId,
            artifactIds,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Export failed');
        }

        const result = await response.json();

        // Download the exported ZIP file
        window.open(result.downloadUrl, '_blank');
      }

      setExportDialogOpen(false);
      setSelectedArtifacts(new Set());
      announceToScreenReader('Export completed successfully', 'polite');
    } catch (error) {
      console.error('Bulk export failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Export failed';
      setExportError(errorMessage);
      announceToScreenReader(`Export failed: ${errorMessage}`, 'assertive');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedArtifacts.size === artifacts.length) {
      setSelectedArtifacts(new Set());
    } else {
      setSelectedArtifacts(new Set(artifacts.map(a => a.id)));
    }
  };

  const handleArtifactToggle = (artifactId: string) => {
    const newSelected = new Set(selectedArtifacts);
    if (newSelected.has(artifactId)) {
      newSelected.delete(artifactId);
    } else {
      newSelected.add(artifactId);
    }
    setSelectedArtifacts(newSelected);
  };

  const getArtifactIcon = (type: string, mimeType?: string) => {
    if (type === 'image' || mimeType?.startsWith('image/')) {
      return <Image color="primary" aria-label="Image file" />;
    }
    if (type === 'data' || mimeType === 'text/csv') {
      return <TableChart color="success" aria-label="Data file" />;
    }
    return <InsertDriveFile color="action" aria-label="File" />;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${Math.round(kb)} KB`;
    }
    const mb = kb / 1024;
    return `${Math.round(mb * 10) / 10} MB`;
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString();
  };

  // Set up keyboard navigation for artifact list
  useEffect(() => {
    if (artifacts.length === 0 || !listRef.current) return;

    const listItems = Array.from(
      listRef.current.querySelectorAll('[role="listitem"]')
    ) as HTMLElement[];

    if (listItems.length > 0) {
      cleanupRef.current = KeyboardNavigation.setupRovingTabIndex(
        listItems,
        focusedIndex
      );
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [artifacts, focusedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        const nextIndex = (index + 1) % artifacts.length;
        setFocusedIndex(nextIndex);
        break;
      case 'ArrowUp':
        event.preventDefault();
        const prevIndex = index === 0 ? artifacts.length - 1 : index - 1;
        setFocusedIndex(prevIndex);
        break;
      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setFocusedIndex(artifacts.length - 1);
        break;
    }
  };

  if (artifacts.length === 0) {
    return (
      <Box role="region" aria-labelledby="artifacts-heading">
        <Typography variant="h6" gutterBottom id="artifacts-heading">
          Generated Files
        </Typography>
        <Paper sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No artifacts generated yet. Upload a file and run an analysis to see
            results here.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box role="region" aria-labelledby="artifacts-heading">
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Typography variant="h6" id="artifacts-heading">
          Generated Files
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          role="toolbar"
          aria-label="Artifact actions"
        >
          <IconButton
            size="small"
            onClick={handleSelectAll}
            aria-label={
              selectedArtifacts.size === artifacts.length
                ? 'Clear selection'
                : 'Select all artifacts'
            }
            title={
              selectedArtifacts.size === artifacts.length
                ? 'Clear selection'
                : 'Select all'
            }
          >
            {selectedArtifacts.size === artifacts.length ? (
              <Clear />
            ) : (
              <SelectAll />
            )}
          </IconButton>
          <IconButton
            size="small"
            onClick={() => setExportDialogOpen(true)}
            disabled={selectedArtifacts.size === 0}
            aria-label={`Export ${selectedArtifacts.size} selected artifacts`}
            title="Export selected"
          >
            <Archive />
          </IconButton>
        </Stack>
      </Box>

      <Paper sx={{ maxHeight: 300, overflow: 'auto' }}>
        <List dense ref={listRef} aria-label="Generated artifacts">
          {artifacts.map((artifact, index) => (
            <ListItem
              key={artifact.id}
              sx={{
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:last-child': { borderBottom: 'none' },
              }}
              tabIndex={index === focusedIndex ? 0 : -1}
              aria-describedby={`artifact-${artifact.id}-description`}
              onKeyDown={event => handleKeyDown(event, index)}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={selectedArtifacts.has(artifact.id)}
                    onChange={() => handleArtifactToggle(artifact.id)}
                    aria-label={`Select ${artifact.name}`}
                  />
                }
                label=""
                sx={{ mr: 1 }}
              />

              {getArtifactIcon(artifact.type, artifact.mimeType)}

              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" noWrap>
                  {artifact.name}
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    mt: 0.5,
                  }}
                >
                  <Chip
                    label={artifact.type}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.7rem', height: 20 }}
                    aria-label={`File type: ${artifact.type}`}
                  />
                  {artifact.size && (
                    <Typography variant="caption" color="text.secondary">
                      {formatFileSize(artifact.size)}
                    </Typography>
                  )}
                  {artifact.createdAt && (
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(artifact.createdAt)}
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Hidden description for screen readers */}
              <Box sx={srOnlyStyles} id={`artifact-${artifact.id}-description`}>
                {artifact.type === 'image' && artifact.manifest
                  ? generateChartAltText(artifact.manifest)
                  : `${artifact.type} file: ${artifact.name}${
                      artifact.size ? `, ${formatFileSize(artifact.size)}` : ''
                    }${
                      artifact.createdAt
                        ? `, created ${formatDate(artifact.createdAt)}`
                        : ''
                    }`}
              </Box>

              <ListItemSecondaryAction>
                <IconButton
                  size="small"
                  onClick={() => handleDownload(artifact.id)}
                  aria-label={`Download ${artifact.name}`}
                  title="Download"
                >
                  <Download />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </Paper>

      {/* Export Dialog */}
      <Dialog
        open={exportDialogOpen}
        onClose={() => !isExporting && setExportDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        aria-labelledby="export-dialog-title"
        aria-describedby="export-dialog-description"
      >
        <DialogTitle id="export-dialog-title">
          Export Selected Artifacts
        </DialogTitle>
        <DialogContent>
          {exportError && (
            <Alert severity="error" sx={{ mb: 2 }} role="alert">
              {exportError}
            </Alert>
          )}

          <Typography
            variant="body2"
            color="text.secondary"
            paragraph
            id="export-dialog-description"
          >
            Export {selectedArtifacts.size} selected artifact
            {selectedArtifacts.size !== 1 ? 's' : ''} as a ZIP file with
            manifest.
          </Typography>

          <Typography variant="subtitle2" gutterBottom>
            Selected files:
          </Typography>
          <List dense>
            {artifacts
              .filter(a => selectedArtifacts.has(a.id))
              .map(artifact => (
                <ListItem key={artifact.id} sx={{ py: 0.5 }}>
                  {getArtifactIcon(artifact.type, artifact.mimeType)}
                  <ListItemText
                    primary={artifact.name}
                    secondary={formatFileSize(artifact.size)}
                    sx={{ ml: 1 }}
                  />
                </ListItem>
              ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setExportDialogOpen(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleBulkExport}
            variant="contained"
            disabled={isExporting}
            startIcon={
              isExporting ? <CircularProgress size={16} /> : <Archive />
            }
          >
            {isExporting ? 'Exporting...' : 'Export ZIP'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
