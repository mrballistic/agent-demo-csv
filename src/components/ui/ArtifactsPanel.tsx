'use client';

import React, { useState } from 'react';
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

export interface ArtifactItem {
  id: string;
  name: string;
  type: 'file' | 'image' | 'data';
  size?: number;
  downloadUrl: string;
  createdAt?: number;
  mimeType?: string;
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

  const handleDownload = async (artifactId: string) => {
    try {
      if (onDownload) {
        onDownload(artifactId);
      } else {
        // Default download behavior
        const artifact = artifacts.find(a => a.id === artifactId);
        if (artifact) {
          window.open(artifact.downloadUrl, '_blank');
        }
      }
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleBulkExport = async () => {
    if (selectedArtifacts.size === 0) {
      return;
    }

    setIsExporting(true);
    setExportError(null);

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
    } catch (error) {
      console.error('Bulk export failed:', error);
      setExportError(error instanceof Error ? error.message : 'Export failed');
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
      return <Image color="primary" titleAccess="Image file" />;
    }
    if (type === 'data' || mimeType === 'text/csv') {
      return <TableChart color="success" titleAccess="Data file" />;
    }
    return <InsertDriveFile color="action" titleAccess="File" />;
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

  if (artifacts.length === 0) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom>
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
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Typography variant="h6">Generated Files</Typography>
        <Stack direction="row" spacing={1}>
          <IconButton
            size="small"
            onClick={handleSelectAll}
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
            title="Export selected"
          >
            <Archive />
          </IconButton>
        </Stack>
      </Box>

      <Paper sx={{ maxHeight: 300, overflow: 'auto' }}>
        <List dense>
          {artifacts.map(artifact => (
            <ListItem
              key={artifact.id}
              sx={{
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:last-child': { borderBottom: 'none' },
              }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={selectedArtifacts.has(artifact.id)}
                    onChange={() => handleArtifactToggle(artifact.id)}
                  />
                }
                label=""
                sx={{ mr: 1 }}
              />

              {getArtifactIcon(artifact.type, artifact.mimeType)}

              <ListItemText
                primary={
                  <Typography variant="body2" noWrap>
                    {artifact.name}
                  </Typography>
                }
                secondary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      label={artifact.type}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 20 }}
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
                  </Stack>
                }
              />

              <ListItemSecondaryAction>
                <IconButton
                  size="small"
                  onClick={() => handleDownload(artifact.id)}
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
      >
        <DialogTitle>Export Selected Artifacts</DialogTitle>
        <DialogContent>
          {exportError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {exportError}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary" paragraph>
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
