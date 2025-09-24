import { AnalystMuiScaffold } from '@/components/layout';
import { Typography, Box, Paper, Button, Stack } from '@mui/material';
import { CloudUpload, TrendingUp, Assessment } from '@mui/icons-material';

export default function Home() {
  return (
    <AnalystMuiScaffold>
      <Box sx={{ maxWidth: 800, mx: 'auto', mt: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Welcome to AI Data Analyst
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          align="center"
          paragraph
        >
          Upload your CSV data and get instant insights with AI-powered
          analysis.
        </Typography>

        <Paper sx={{ p: 4, mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Get Started
          </Typography>
          <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }}>
            <Button
              variant="contained"
              startIcon={<CloudUpload />}
              size="large"
              fullWidth
            >
              Upload CSV File
            </Button>
            <Button
              variant="outlined"
              startIcon={<TrendingUp />}
              size="large"
              fullWidth
            >
              View Sample Analysis
            </Button>
            <Button
              variant="outlined"
              startIcon={<Assessment />}
              size="large"
              fullWidth
            >
              Quick Actions
            </Button>
          </Stack>
        </Paper>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Chat Interface
          </Typography>
          <Paper sx={{ p: 3, minHeight: 300, bgcolor: 'background.paper' }}>
            <Typography variant="body2" color="text.secondary">
              Chat messages will appear here. Upload a file to start analyzing
              your data.
            </Typography>
          </Paper>
        </Box>
      </Box>
    </AnalystMuiScaffold>
  );
}
