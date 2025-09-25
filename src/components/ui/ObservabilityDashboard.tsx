/**
 * Observability Dashboard Component
 * Displays system metrics including latency, error rates, and queue depth
 * Implements requirement 8.2 for simple dashboard showing latency and error rate
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  LinearProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Divider,
} from '@mui/material';
import {
  TrendingUp,
  Error,
  Timer,
  Queue,
  Memory,
  CheckCircle,
  Warning,
  Cancel,
} from '@mui/icons-material';
import type { DashboardMetrics } from '@/app/api/observability/dashboard/route';

interface ObservabilityDashboardProps {
  className?: string;
}

export function ObservabilityDashboard({
  className,
}: ObservabilityDashboardProps) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('24h');

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/observability/dashboard?timeRange=${timeRange}`
      );

      if (!response.ok) {
        throw new globalThis.Error('Failed to fetch metrics');
      }

      const data = await response.json();
      setMetrics(data);
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof globalThis.Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchMetrics();

    // Refresh metrics every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'success';
      case 'degraded':
        return 'warning';
      case 'unhealthy':
        return 'error';
      default:
        return 'default';
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle />;
      case 'degraded':
        return <Warning />;
      case 'unhealthy':
        return <Cancel />;
      default:
        return <CheckCircle />;
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  if (loading && !metrics) {
    return (
      <Box className={className} p={3}>
        <Typography variant="h5" gutterBottom>
          Observability Dashboard
        </Typography>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box className={className} p={3}>
        <Alert severity="error">
          Failed to load dashboard metrics: {error}
        </Alert>
      </Box>
    );
  }

  if (!metrics) {
    return null;
  }

  return (
    <Box className={className} p={3}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Typography variant="h5">Observability Dashboard</Typography>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Time Range</InputLabel>
          <Select
            value={timeRange}
            label="Time Range"
            onChange={e => setTimeRange(e.target.value)}
          >
            <MenuItem value="1h">Last Hour</MenuItem>
            <MenuItem value="6h">Last 6 Hours</MenuItem>
            <MenuItem value="24h">Last 24 Hours</MenuItem>
            <MenuItem value="7d">Last 7 Days</MenuItem>
            <MenuItem value="30d">Last 30 Days</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Grid container spacing={3}>
        {/* System Health */}
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                {getHealthIcon(metrics.systemHealth.status)}
                <Typography variant="h6" ml={1}>
                  System Health
                </Typography>
              </Box>
              <Chip
                label={metrics.systemHealth.status.toUpperCase()}
                color={getHealthColor(metrics.systemHealth.status) as any}
                variant="filled"
              />
              <Typography variant="body2" color="text.secondary" mt={1}>
                Uptime: {formatDuration(metrics.systemHealth.uptime)}
              </Typography>
              {metrics.systemHealth.memoryUsage && (
                <Typography variant="body2" color="text.secondary">
                  Memory: {metrics.systemHealth.memoryUsage}MB
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Run Latency */}
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Timer />
                <Typography variant="h6" ml={1}>
                  Run Latency
                </Typography>
              </Box>
              <Typography variant="h4" color="primary">
                {formatDuration(metrics.runLatency.p50)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                P50 (median)
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2">
                P95: {formatDuration(metrics.runLatency.p95)}
              </Typography>
              <Typography variant="body2">
                Avg: {formatDuration(metrics.runLatency.avg)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {metrics.runLatency.count} runs
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Error Rate */}
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Error />
                <Typography variant="h6" ml={1}>
                  Error Rate
                </Typography>
              </Box>
              <Typography
                variant="h4"
                color={metrics.errorMetrics.errorRate > 5 ? 'error' : 'primary'}
              >
                {metrics.errorMetrics.errorRate.toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {metrics.errorMetrics.totalErrors} total errors
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2">
                Retryable: {metrics.errorMetrics.retryableErrors}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Queue Depth */}
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Queue />
                <Typography variant="h6" ml={1}>
                  Queue Status
                </Typography>
              </Box>
              <Typography variant="h4" color="primary">
                {metrics.queueMetrics.currentDepth}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Current depth
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2">
                Max: {metrics.queueMetrics.maxDepth}
              </Typography>
              <Typography variant="body2">
                Avg wait: {formatDuration(metrics.queueMetrics.avgWaitTime)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Run Statistics */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <TrendingUp />
                <Typography variant="h6" ml={1}>
                  Run Statistics
                </Typography>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Started
                  </Typography>
                  <Typography variant="h5">
                    {metrics.runStats.started}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Success Rate
                  </Typography>
                  <Typography
                    variant="h5"
                    color={
                      metrics.runStats.successRate > 90
                        ? 'success.main'
                        : 'warning.main'
                    }
                  >
                    {metrics.runStats.successRate}%
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="body2" color="success.main">
                    Completed: {metrics.runStats.completed}
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="body2" color="error.main">
                    Failed: {metrics.runStats.failed}
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="body2" color="text.secondary">
                    Cancelled: {metrics.runStats.cancelled}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Token Usage & Cost */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Memory />
                <Typography variant="h6" ml={1}>
                  Token Usage & Cost
                </Typography>
              </Box>
              <Typography variant="h4" color="primary">
                {formatCurrency(metrics.tokenUsage.costEstimate)}
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Estimated cost
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Input Tokens
                  </Typography>
                  <Typography variant="body1">
                    {metrics.tokenUsage.totalInput.toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Avg: {metrics.tokenUsage.avgInputPerRun}/run
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Output Tokens
                  </Typography>
                  <Typography variant="body1">
                    {metrics.tokenUsage.totalOutput.toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Avg: {metrics.tokenUsage.avgOutputPerRun}/run
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Typography
        variant="caption"
        color="text.secondary"
        mt={2}
        display="block"
      >
        Last updated: {new Date().toLocaleTimeString()} | Data from{' '}
        {new Date(metrics.timeRange.start).toLocaleString()} to{' '}
        {new Date(metrics.timeRange.end).toLocaleString()}
      </Typography>
    </Box>
  );
}

export default ObservabilityDashboard;
