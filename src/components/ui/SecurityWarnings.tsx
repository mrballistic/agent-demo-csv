'use client';

import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Alert,
  Chip,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
} from '@mui/material';
import {
  Shield,
  Report,
  Security,
  Policy,
  Warning,
  ExpandMore,
  DataObject,
  CheckCircle,
  TrendingUp,
  InfoOutlined,
} from '@mui/icons-material';

interface PIIColumn {
  name: string;
  type:
    | 'email'
    | 'phone'
    | 'name'
    | 'address'
    | 'ssn'
    | 'credit_card'
    | 'ip_address'
    | 'other';
  confidence: number;
  detectionMethod: 'pattern' | 'column_name' | 'ml_classifier' | 'manual';
  sampleMatches: string[];
  recommendations: string[];
  isRedacted: boolean;
}

interface SecurityRecommendation {
  type: 'redaction' | 'encryption' | 'access_control' | 'audit_logging';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  implementation: string;
}

interface ComplianceFlag {
  regulation: 'GDPR' | 'CCPA' | 'HIPAA' | 'SOX' | 'PCI_DSS';
  requirement: string;
  status: 'compliant' | 'non_compliant' | 'unknown';
  action_required: string;
}

interface SecurityData {
  piiColumns: PIIColumn[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: SecurityRecommendation[];
  complianceFlags: ComplianceFlag[];
  hasRedaction: boolean;
  // Additional data from profiling API
  metadata?: {
    filename: string;
    size: number;
    rowCount: number;
    columnCount: number;
    processingTime: number;
  };
  quality?: {
    overall: number;
    dimensions: {
      completeness: number;
      consistency: number;
      accuracy: number;
      uniqueness: number;
      validity: number;
    };
  };
  insights?: {
    keyFindings: string[];
    recommendations: string[];
  };
}

interface SecurityWarningsProps {
  securityData?: SecurityData | null;
  className?: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

const SecurityWarnings: React.FC<SecurityWarningsProps> = ({
  securityData,
  className,
  expanded: externalExpanded,
  onExpandedChange,
}) => {
  const [internalExpanded, setInternalExpanded] = React.useState<
    string | false
  >(securityData && securityData.piiColumns.length > 0 ? 'security' : false);

  // Use external expanded state if provided, otherwise use internal state
  const expanded =
    externalExpanded !== undefined
      ? externalExpanded
        ? 'security'
        : false
      : internalExpanded;

  const handleAccordionChange = React.useCallback(
    (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
      const newExpanded = isExpanded ? panel : false;
      if (onExpandedChange) {
        onExpandedChange(isExpanded);
      } else {
        setInternalExpanded(newExpanded);
      }
    },
    [onExpandedChange]
  );

  // Auto-expand if high risk
  React.useEffect(() => {
    if (
      securityData &&
      (securityData.riskLevel === 'high' ||
        securityData.riskLevel === 'critical') &&
      expanded === false
    ) {
      if (onExpandedChange) {
        onExpandedChange(true);
      } else {
        setInternalExpanded('security');
      }
    }
  }, [securityData, expanded, onExpandedChange]);

  // Show accordion but collapsed if no security data
  if (!securityData) {
    return (
      <Accordion
        expanded={expanded === 'security'}
        onChange={handleAccordionChange('security')}
        sx={{ mb: 1 }}
      >
        <AccordionSummary
          expandIcon={<ExpandMore />}
          aria-controls="security-content"
          id="security-header"
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Shield color="disabled" />
            <Typography variant="subtitle2" color="text.disabled">
              Security Analysis
              <Chip
                label="No data"
                size="small"
                variant="outlined"
                sx={{ ml: 1 }}
              />
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" color="text.secondary">
            Upload data to see security analysis and PII detection results.
          </Typography>
        </AccordionDetails>
      </Accordion>
    );
  }

  return (
    <Accordion
      expanded={expanded === 'security'}
      onChange={handleAccordionChange('security')}
      sx={{ mb: 1 }}
      {...(className && { className })}
    >
      <AccordionSummary
        expandIcon={<ExpandMore />}
        aria-controls="security-content"
        id="security-header"
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Shield
            color={
              securityData.riskLevel === 'critical'
                ? 'error'
                : securityData.riskLevel === 'high'
                  ? 'warning'
                  : 'info'
            }
          />
          <Typography variant="subtitle2">
            Security Analysis
            {securityData.piiColumns.length > 0 && (
              <Chip
                label={`${securityData.piiColumns.length} PII column${securityData.piiColumns.length > 1 ? 's' : ''}`}
                size="small"
                color={
                  securityData.riskLevel === 'critical'
                    ? 'error'
                    : securityData.riskLevel === 'high'
                      ? 'warning'
                      : 'info'
                }
                variant="outlined"
                sx={{ ml: 1 }}
              />
            )}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          {/* Dataset Overview & Data Quality Score - Side by Side */}
          {(securityData.metadata || securityData.quality) && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                gap: 2,
              }}
            >
              {/* Dataset Overview */}
              {securityData.metadata && (
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="body2"
                    fontWeight="medium"
                    color="text.secondary"
                    gutterBottom
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <DataObject fontSize="small" />
                    Dataset Overview
                  </Typography>
                  <Card
                    variant="outlined"
                    sx={{ bgcolor: 'background.default', height: '100%' }}
                  >
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Grid container spacing={1}>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            Rows:
                          </Typography>
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            sx={{ display: 'block' }}
                          >
                            {securityData.metadata.rowCount.toLocaleString()}
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            Columns:
                          </Typography>
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            sx={{ display: 'block' }}
                          >
                            {securityData.metadata.columnCount}
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            File Size:
                          </Typography>
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            sx={{ display: 'block' }}
                          >
                            {Math.round(securityData.metadata.size / 1024)} KB
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            Processing:
                          </Typography>
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            sx={{ display: 'block' }}
                          >
                            {securityData.metadata.processingTime}ms
                          </Typography>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Box>
              )}{' '}
              {/* Data Quality Score */}
              {securityData.quality && (
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="body2"
                    fontWeight="medium"
                    color="text.secondary"
                    gutterBottom
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <CheckCircle fontSize="small" />
                    Data Quality Score
                  </Typography>
                  <Card
                    variant="outlined"
                    sx={{ bgcolor: 'background.default', height: '100%' }}
                  >
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          mb: 1,
                        }}
                      >
                        <Typography
                          variant="h5"
                          color={
                            securityData.quality.overall >= 80
                              ? 'success.main'
                              : securityData.quality.overall >= 60
                                ? 'warning.main'
                                : 'error.main'
                          }
                          fontWeight="bold"
                        >
                          {securityData.quality.overall}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          / 100
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={securityData.quality.overall}
                        color={
                          securityData.quality.overall >= 80
                            ? 'success'
                            : securityData.quality.overall >= 60
                              ? 'warning'
                              : 'error'
                        }
                        sx={{ mb: 1 }}
                      />
                      <Stack spacing={0.5}>
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Completeness:
                          </Typography>
                          <Typography variant="caption" fontWeight="medium">
                            {securityData.quality.dimensions.completeness}%
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Consistency:
                          </Typography>
                          <Typography variant="caption" fontWeight="medium">
                            {securityData.quality.dimensions.consistency}%
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Accuracy:
                          </Typography>
                          <Typography variant="caption" fontWeight="medium">
                            {securityData.quality.dimensions.accuracy}%
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Box>
              )}
            </Box>
          )}{' '}
          {/* Key Insights */}
          {securityData.insights &&
            securityData.insights.keyFindings.length > 0 && (
              <Box sx={{ pt: 3 }}>
                <Typography
                  variant="body2"
                  fontWeight="medium"
                  color="text.secondary"
                  gutterBottom
                  sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <TrendingUp fontSize="small" />
                  Key Insights
                </Typography>
                <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack spacing={1}>
                      {securityData.insights.keyFindings.map(
                        (finding, index) => (
                          <Box
                            key={index}
                            sx={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 1,
                            }}
                          >
                            <InfoOutlined
                              sx={{
                                fontSize: 16,
                                color: 'info.main',
                                mt: 0.125,
                                flexShrink: 0,
                              }}
                            />
                            <Typography
                              variant="body2"
                              sx={{ flex: 1, fontSize: '0.875rem' }}
                            >
                              {finding}
                            </Typography>
                          </Box>
                        )
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            )}
          {/* Risk Level Alert */}
          <Alert
            severity={
              securityData.riskLevel === 'critical'
                ? 'error'
                : securityData.riskLevel === 'high'
                  ? 'warning'
                  : securityData.riskLevel === 'medium'
                    ? 'info'
                    : 'success'
            }
            variant="outlined"
          >
            <Typography variant="body2" fontWeight="medium">
              Risk Level: {securityData.riskLevel.toUpperCase()}
            </Typography>
            {securityData.piiColumns.length > 0 && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                Detected {securityData.piiColumns.length} column(s) with PII
              </Typography>
            )}
          </Alert>
          {/* PII Columns Details */}
          {securityData.piiColumns.length > 0 && (
            <Box>
              <Typography
                variant="body2"
                fontWeight="medium"
                color="text.secondary"
                gutterBottom
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <Report fontSize="small" />
                PII Columns:
              </Typography>
              <Grid container spacing={1}>
                {securityData.piiColumns.map((piiCol, index) => (
                  <Grid item xs={12} sm={6} key={index}>
                    <Card
                      variant="outlined"
                      sx={{ bgcolor: 'background.default', height: '100%' }}
                    >
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Box sx={{ mb: 1 }}>
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            noWrap
                          >
                            {piiCol.name}
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
                              label={piiCol.type
                                .replace('_', ' ')
                                .toUpperCase()}
                              size="small"
                              color={
                                piiCol.type === 'ssn' ||
                                piiCol.type === 'credit_card'
                                  ? 'error'
                                  : piiCol.type === 'email' ||
                                      piiCol.type === 'phone'
                                    ? 'warning'
                                    : 'info'
                              }
                              variant="filled"
                            />
                            <Chip
                              label={`${Math.round(piiCol.confidence * 100)}%`}
                              size="small"
                              variant="outlined"
                            />
                          </Box>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          Detection: {piiCol.detectionMethod.replace('_', ' ')}
                        </Typography>
                        {piiCol.sampleMatches.length > 0 && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', mt: 0.5 }}
                          >
                            Sample: {piiCol.sampleMatches[0]}...
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
          {/* Top Security Recommendations (show max 3) */}
          {securityData.recommendations.length > 0 && (
            <Box>
              <Typography
                variant="body2"
                fontWeight="medium"
                color="text.secondary"
                gutterBottom
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <Security fontSize="small" />
                Top Recommendations:
              </Typography>
              <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack spacing={1.5}>
                    {securityData.recommendations
                      .slice(0, 7)
                      .map((rec, index) => (
                        <Box
                          key={index}
                          sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 1,
                          }}
                        >
                          <Chip
                            label={rec.priority.toUpperCase()}
                            size="small"
                            color={
                              rec.priority === 'critical'
                                ? 'error'
                                : rec.priority === 'high'
                                  ? 'warning'
                                  : rec.priority === 'medium'
                                    ? 'info'
                                    : 'default'
                            }
                            variant="outlined"
                          />
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" fontWeight="medium">
                              {rec.description}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    {securityData.recommendations.length > 7 && (
                      <Typography variant="caption" color="text.disabled">
                        ... and {securityData.recommendations.length - 7} more
                        recommendations
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Box>
          )}
          {/* Compliance Assessment */}
          {securityData.complianceFlags.length > 0 && (
            <Box>
              <Typography
                variant="body2"
                fontWeight="medium"
                color="text.secondary"
                gutterBottom
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <Policy fontSize="small" />
                Compliance Assessment
              </Typography>
              <Stack spacing={1}>
                {securityData.complianceFlags.map((flag, index) => (
                  <Card
                    key={index}
                    variant="outlined"
                    sx={{
                      bgcolor: 'background.default',
                      borderColor:
                        flag.status === 'non_compliant'
                          ? 'warning.main'
                          : 'success.main',
                    }}
                  >
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          mb: 0.5,
                        }}
                      >
                        <Chip
                          label={flag.regulation}
                          size="small"
                          color={
                            flag.status === 'non_compliant'
                              ? 'warning'
                              : 'success'
                          }
                          variant="filled"
                        />
                        <Chip
                          label={
                            flag.status === 'non_compliant'
                              ? 'ACTION REQUIRED'
                              : 'COMPLIANT'
                          }
                          size="small"
                          color={
                            flag.status === 'non_compliant'
                              ? 'warning'
                              : 'success'
                          }
                          variant="outlined"
                        />
                      </Box>
                      <Typography
                        variant="body2"
                        color="text.primary"
                        sx={{ mb: 0.5 }}
                      >
                        {flag.requirement}
                      </Typography>
                      {flag.status === 'non_compliant' && (
                        <Typography
                          variant="caption"
                          color="warning.main"
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                          }}
                        >
                          <Warning sx={{ fontSize: 14 }} />
                          {flag.action_required}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};

export default SecurityWarnings;
