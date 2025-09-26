'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Box,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { Close, Download } from '@mui/icons-material';

interface ImageLightboxProps {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  title?: string;
  downloadUrl?: string;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({
  open,
  onClose,
  src,
  alt,
  title,
  downloadUrl,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="lg"
      fullWidth
      sx={{
        '& .MuiDialog-paper': {
          bgcolor: 'background.paper',
          backgroundImage: 'none',
        },
      }}
      aria-labelledby="lightbox-title"
    >
      <DialogTitle
        id="lightbox-title"
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          py: 1,
        }}
      >
        <Typography variant="h6" component="h2">
          {title || alt}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {downloadUrl && (
            <IconButton
              component="a"
              href={downloadUrl}
              download
              color="primary"
              aria-label="Download image"
              title="Download image"
            >
              <Download />
            </IconButton>
          )}
          <IconButton
            onClick={onClose}
            color="inherit"
            aria-label="Close lightbox"
            title="Close (Escape)"
          >
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 2,
          bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
        }}
      >
        <Box
          component="img"
          src={src}
          alt={alt}
          sx={{
            maxWidth: '100%',
            maxHeight: '70vh',
            width: 'auto',
            height: 'auto',
            borderRadius: 1,
            boxShadow: 3,
            objectFit: 'contain',
          }}
          loading="lazy"
        />
      </DialogContent>
    </Dialog>
  );
};

export default ImageLightbox;
