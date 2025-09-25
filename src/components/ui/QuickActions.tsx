'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Button,
  Stack,
  Typography,
  Tooltip,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import {
  Assessment,
  TrendingUp,
  Inventory,
  Analytics,
  People,
  Refresh,
} from '@mui/icons-material';
import {
  KeyboardNavigation,
  announceToScreenReader,
  srOnlyStyles,
} from '@/lib/accessibility';

interface SuggestionItem {
  id: string;
  label: string;
  description: string;
  requiredColumns: string[];
  analysisType: 'profile' | 'trend' | 'top-sku' | 'channel-mix' | 'outlier';
  enabled: boolean;
  reason?: string;
}

interface SuggestionsResponse {
  fileId: string;
  suggestions: SuggestionItem[];
  metadata: {
    columnCount: number;
    availableColumns: string[];
    generatedAt: string;
  };
}

interface QuickActionsProps {
  fileId?: string | null;
  onAction: (actionId: string, analysisType: string) => void;
  disabled?: boolean;
  className?: string;
}

const ACTION_ICONS = {
  profile: Assessment,
  trends: TrendingUp,
  'top-products': Inventory,
  'channel-mix': Analytics,
  'customer-analysis': People,
};

const QuickActions: React.FC<QuickActionsProps> = ({
  fileId,
  onAction,
  disabled = false,
  className,
}) => {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<
    SuggestionsResponse['metadata'] | null
  >(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const stackRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!fileId) {
      setSuggestions([]);
      setMetadata(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/analysis/suggestions?fileId=${fileId}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: SuggestionsResponse = await response.json();
      setSuggestions(data.suggestions);
      setMetadata(data.metadata);
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load suggestions'
      );
      setSuggestions([]);
      setMetadata(null);
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    fetchSuggestions();
  }, [fileId, fetchSuggestions]);

  // Set up keyboard navigation for action buttons
  useEffect(() => {
    if (suggestions.length === 0 || !stackRef.current) return;

    const buttons = Array.from(
      stackRef.current.querySelectorAll('button:not([disabled])')
    ) as HTMLElement[];

    if (buttons.length > 0) {
      cleanupRef.current = KeyboardNavigation.setupRovingTabIndex(
        buttons,
        focusedIndex
      );
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [suggestions, focusedIndex, disabled]);

  const handleActionClick = (suggestion: SuggestionItem) => {
    if (!suggestion.enabled || disabled) return;

    // Announce action to screen readers
    announceToScreenReader(`Starting ${suggestion.label} analysis`, 'polite');

    onAction(suggestion.id, suggestion.analysisType);
  };

  const getActionIcon = (actionId: string) => {
    const IconComponent =
      ACTION_ICONS[actionId as keyof typeof ACTION_ICONS] || Assessment;
    return <IconComponent />;
  };

  if (!fileId) {
    return (
      <Box
        className={className}
        role="region"
        aria-labelledby="quick-actions-heading"
      >
        <Typography variant="h6" gutterBottom id="quick-actions-heading">
          Quick Actions
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Upload a CSV file to see analysis suggestions
        </Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box
        className={className}
        role="region"
        aria-labelledby="quick-actions-heading"
      >
        <Typography variant="h6" gutterBottom id="quick-actions-heading">
          Quick Actions
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
          <CircularProgress size={20} aria-hidden="true" />
          <Typography
            variant="body2"
            color="text.secondary"
            role="status"
            aria-live="polite"
          >
            Loading suggestions...
          </Typography>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        className={className}
        role="region"
        aria-labelledby="quick-actions-heading"
      >
        <Typography variant="h6" gutterBottom id="quick-actions-heading">
          Quick Actions
        </Typography>
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          role="alert"
          action={
            <Button
              size="small"
              onClick={fetchSuggestions}
              startIcon={<Refresh />}
              aria-label="Retry loading suggestions"
            >
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      className={className}
      role="region"
      aria-labelledby="quick-actions-heading"
    >
      <Typography variant="h6" gutterBottom id="quick-actions-heading">
        Quick Actions
      </Typography>

      {metadata && (
        <Box sx={{ mb: 2 }}>
          <Chip
            label={`${metadata.columnCount} columns detected`}
            size="small"
            variant="outlined"
            color="info"
            aria-label={`Data contains ${metadata.columnCount} columns`}
          />
        </Box>
      )}

      <Stack
        spacing={1}
        ref={stackRef}
        role="group"
        aria-label="Analysis actions"
      >
        {suggestions.map((suggestion, index) => {
          const isDisabled = !suggestion.enabled || disabled;

          const button = (
            <Button
              key={suggestion.id}
              variant="outlined"
              startIcon={getActionIcon(suggestion.id)}
              onClick={() => handleActionClick(suggestion)}
              disabled={isDisabled}
              fullWidth
              sx={{
                justifyContent: 'flex-start',
                textAlign: 'left',
                opacity: isDisabled ? 0.5 : 1,
                '&.Mui-disabled': {
                  borderColor: 'action.disabled',
                  color: 'text.disabled',
                },
              }}
              aria-describedby={`action-${suggestion.id}-description`}
              tabIndex={index === focusedIndex && !isDisabled ? 0 : -1}
            >
              <Box sx={{ flex: 1 }}>
                <Typography variant="button" display="block">
                  {suggestion.label}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ textTransform: 'none', lineHeight: 1.2 }}
                  id={`action-${suggestion.id}-description`}
                >
                  {suggestion.description}
                </Typography>
              </Box>
            </Button>
          );

          // Wrap disabled buttons with tooltip explaining why they're disabled
          if (isDisabled && suggestion.reason) {
            return (
              <Tooltip
                key={suggestion.id}
                title={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      Cannot run this analysis
                    </Typography>
                    <Typography variant="body2">{suggestion.reason}</Typography>
                    {suggestion.requiredColumns.length > 0 && (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        Required: {suggestion.requiredColumns.join(', ')}
                      </Typography>
                    )}
                  </Box>
                }
                placement="right"
                arrow
              >
                <span>{button}</span>
              </Tooltip>
            );
          }

          return button;
        })}
      </Stack>

      {suggestions.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          No analysis suggestions available for this file.
        </Typography>
      )}
    </Box>
  );
};

export default QuickActions;
