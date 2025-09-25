'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Stack,
  Alert,
  Link,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  ExpandMore,
  Help,
  DataObject,
  TrendingUp,
  Security,
  Download,
  Upload,
  Analytics,
} from '@mui/icons-material';

interface HelpTextProps {
  section?: 'upload' | 'analysis' | 'export' | 'privacy' | 'all';
  compact?: boolean;
  className?: string;
}

const HelpText: React.FC<HelpTextProps> = ({
  section = 'all',
  compact = false,
  className,
}) => {
  const [expanded, setExpanded] = useState<string | false>(false);

  const handleChange =
    (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
      setExpanded(isExpanded ? panel : false);
    };

  const sections = {
    upload: {
      title: 'File Upload Requirements',
      icon: <Upload />,
      content: (
        <Box>
          <Typography variant="body2" sx={{ mb: 2 }}>
            To get the best results from the AI analyst, your CSV file should
            include:
          </Typography>

          <List dense>
            <ListItem>
              <ListItemIcon>
                <DataObject fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Required columns"
                secondary="order_date, qty, unit_price (or net_revenue)"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <DataObject fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Optional columns"
                secondary="customer_id, channel, region, sku, category, discount"
              />
            </ListItem>
          </List>

          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>File limits:</strong> Maximum 50MB, CSV format only. For
              files over 100k rows, processing may take longer.
            </Typography>
          </Alert>
        </Box>
      ),
    },
    analysis: {
      title: 'Analysis Types',
      icon: <Analytics />,
      content: (
        <Box>
          <Typography variant="body2" sx={{ mb: 2 }}>
            The AI can perform various types of analysis on your data:
          </Typography>

          <Stack spacing={1}>
            <Chip
              icon={<TrendingUp />}
              label="Trend Analysis"
              variant="outlined"
              size="small"
            />
            <Typography variant="caption" color="text.secondary">
              Revenue trends, seasonal patterns, growth analysis
            </Typography>

            <Chip
              icon={<DataObject />}
              label="Product Performance"
              variant="outlined"
              size="small"
            />
            <Typography variant="caption" color="text.secondary">
              Top SKUs, category analysis, product mix
            </Typography>

            <Chip
              icon={<Analytics />}
              label="Customer Insights"
              variant="outlined"
              size="small"
            />
            <Typography variant="caption" color="text.secondary">
              Customer segmentation, behavior patterns, value analysis
            </Typography>
          </Stack>

          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              Start with &quot;Profile&quot; to understand your data structure,
              then use Quick Actions for specific analyses.
            </Typography>
          </Alert>
        </Box>
      ),
    },
    export: {
      title: 'Exporting Results',
      icon: <Download />,
      content: (
        <Box>
          <Typography variant="body2" sx={{ mb: 2 }}>
            All analysis results can be downloaded for further use:
          </Typography>

          <List dense>
            <ListItem>
              <ListItemIcon>
                <Download fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Charts & Visualizations"
                secondary="PNG format with proper alt-text for accessibility"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <Download fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Cleaned Data"
                secondary="CSV files with processed/filtered data"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <Download fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Analysis Reports"
                secondary="Markdown summaries with key insights"
              />
            </ListItem>
          </List>

          <Typography variant="body2" sx={{ mt: 2 }}>
            Use &quot;Export All&quot; to download a ZIP file containing all
            artifacts from your session.
          </Typography>
        </Box>
      ),
    },
    privacy: {
      title: 'Data Privacy & Security',
      icon: <Security />,
      content: (
        <Box>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>PII Detection:</strong> The system automatically detects
              and protects personally identifiable information (emails, phone
              numbers).
            </Typography>
          </Alert>

          <List dense>
            <ListItem>
              <ListItemIcon>
                <Security fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="24-hour retention"
                secondary="All uploaded data is automatically deleted after 24 hours"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <Security fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Manual deletion"
                secondary="Use 'Delete All My Data' to immediately remove all your data"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <Security fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="No raw PII display"
                secondary="Personal information is aggregated or redacted in results"
              />
            </ListItem>
          </List>
        </Box>
      ),
    },
  };

  const sectionsToShow: [string, any][] =
    section === 'all'
      ? Object.entries(sections)
      : [[section, sections[section as keyof typeof sections]]];

  if (compact) {
    return (
      <Alert severity="info" icon={<Help />} {...(className && { className })}>
        <Typography variant="body2">
          Need help? Upload a CSV with sales data (order_date, qty, unit_price)
          to get started.{' '}
          <Link
            href="#"
            onClick={e => {
              e.preventDefault();
              setExpanded('upload');
            }}
          >
            View requirements
          </Link>
        </Typography>
      </Alert>
    );
  }

  return (
    <Box {...(className && { className })}>
      {sectionsToShow.map(([key, sectionData]) => (
        <Accordion
          key={key}
          expanded={expanded === key}
          onChange={handleChange(key)}
          sx={{ mb: 1 }}
        >
          <AccordionSummary
            expandIcon={<ExpandMore />}
            aria-controls={`${key}-content`}
            id={`${key}-header`}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {sectionData.icon}
              <Typography variant="subtitle2">{sectionData.title}</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>{sectionData.content}</AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

export default HelpText;
