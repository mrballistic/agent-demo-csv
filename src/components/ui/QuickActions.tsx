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
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Assessment,
  TrendingUp,
  Inventory,
  Analytics,
  People,
  Refresh,
  ExpandMore,
  FlashOn,
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
  const [expanded, setExpanded] = useState<string | false>(
    fileId ? 'quick-actions' : false
  );
  const stackRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!fileId) {
      setSuggestions([]);
      setMetadata(null);
      setExpanded(false);
      return;
    }

    setLoading(true);
    setError(null);
    setExpanded('quick-actions'); // Auto-expand when file is uploaded

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

  const handleAccordionChange = useCallback(
    (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
      setExpanded(isExpanded ? panel : false);
    },
    []
  );

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

  // Default actions for when no file is uploaded
  const defaultActions: SuggestionItem[] = [
    {
      id: 'profile',
      label: 'Profile Data',
      description: 'Analyze data structure and quality',
      requiredColumns: [],
      analysisType: 'profile',
      enabled: true,
    },
    {
      id: 'trends',
      label: 'Revenue Trends',
      description: 'Visualize revenue over time',
      requiredColumns: [],
      analysisType: 'trend',
      enabled: true,
    },
    {
      id: 'top-products',
      label: 'Top Products',
      description: 'Identify best-selling products',
      requiredColumns: [],
      analysisType: 'top-sku',
      enabled: true,
    },
    {
      id: 'channel-mix',
      label: 'Channel Analysis',
      description: 'Breakdown by sales channel',
      requiredColumns: [],
      analysisType: 'channel-mix',
      enabled: true,
    },
    {
      id: 'export',
      label: 'Export Report',
      description: 'Download analysis as CSV',
      requiredColumns: [],
      analysisType: 'outlier',
      enabled: true,
    },
  ];

  const actionsToRender = fileId ? suggestions : defaultActions;

  // Hide QuickActions until a file is uploaded
  if (!fileId) return null;

  return (
    <Accordion
      expanded={expanded === 'quick-actions'}
      onChange={handleAccordionChange('quick-actions')}
      sx={{ mb: 1 }}
      data-testid="quick-actions-accordion"
    >
      <AccordionSummary
        expandIcon={<ExpandMore />}
        aria-controls="quick-actions-content"
        id="quick-actions-header"
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FlashOn color="primary" />
          <Typography variant="subtitle2">
            Quick Actions
            {!loading && suggestions.length > 0 && (
              <Chip
                label={`${suggestions.filter(s => s.enabled).length} available`}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ ml: 1 }}
              />
            )}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {loading ? (
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
        ) : error ? (
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
        ) : (
          <>
            {metadata ? (
              <Box sx={{ mb: 2 }}>
                <Chip
                  label={`${metadata?.columnCount ?? 0} columns detected`}
                  size="small"
                  variant="outlined"
                  color="info"
                  aria-label={`Data contains ${metadata?.columnCount ?? 0} columns`}
                />
              </Box>
            ) : null}

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
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 'bold' }}
                          >
                            Cannot run this analysis
                          </Typography>
                          <Typography variant="body2">
                            {suggestion.reason}
                          </Typography>
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
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
};

export default QuickActions;
