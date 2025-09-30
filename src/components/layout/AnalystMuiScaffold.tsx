'use client';

/**
 * @fileoverview Analyst MUI Scaffold - Main application layout with sidebar and navigation
 *
 * Provides the core Material-UI layout structure with responsive design,
 * including app bar, collapsible sidebar, and main content area.
 */

import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme as useMuiTheme,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import { ReactNode, useState } from 'react';
import { KeyboardNavigation } from '@/lib/accessibility';

/**
 * Props for the AnalystMuiScaffold component
 */
interface AnalystMuiScaffoldProps {
  /** Child components to render in the main content area */
  children: ReactNode;
}

const DRAWER_WIDTH = 320;
const APP_BAR_HEIGHT = 64;

/**
 * Main application layout scaffold with Material-UI components
 *
 * Features:
 * - Responsive design with mobile-first approach
 * - Collapsible artifacts sidebar
 * - Fixed app bar with navigation
 * - Accessibility support with ARIA labels
 * - Keyboard navigation integration
 *
 * @param props - Component props
 * @param props.children - Main content to render
 * @returns Complete application layout
 *
 * @example
 * ```tsx
 * <AnalystMuiScaffold>
 *   <MainContent />
 * </AnalystMuiScaffold>
 * ```
 */
export default function AnalystMuiScaffold({
  children,
}: AnalystMuiScaffoldProps) {
  const muiTheme = useMuiTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const [artifactsOpen, setArtifactsOpen] = useState(!isMobile);

  const handleDrawerToggle = () => {
    setArtifactsOpen(!artifactsOpen);
  };

  const artifactsDrawer = (
    <Box
      sx={{ width: DRAWER_WIDTH, p: 2 }}
      role="complementary"
      aria-label="Artifacts sidebar"
    >
      <Typography variant="h6" gutterBottom id="artifacts-drawer-heading">
        Artifacts
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Generated charts, data, and reports will appear here.
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: muiTheme.zIndex.drawer + 1,
          height: APP_BAR_HEIGHT,
        }}
        elevation={1}
        role="banner"
      >
        <Toolbar sx={{ height: APP_BAR_HEIGHT }}>
          <AssessmentIcon sx={{ mr: 2 }} aria-hidden="true" />
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            AI Data Analyst
          </Typography>
          <IconButton
            color="inherit"
            aria-label={`${artifactsOpen ? 'Close' : 'Open'} artifacts drawer`}
            aria-expanded={artifactsOpen}
            aria-controls="artifacts-drawer"
            edge="end"
            onClick={handleDrawerToggle}
          >
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          transition: muiTheme.transitions.create(['margin'], {
            easing: muiTheme.transitions.easing.sharp,
            duration: muiTheme.transitions.duration.leavingScreen,
          }),
          marginRight: artifactsOpen && !isMobile ? `${DRAWER_WIDTH}px` : 0,
        }}
      >
        {/* Spacer for fixed AppBar */}
        <Toolbar sx={{ height: APP_BAR_HEIGHT }} />

        {/* Chat Pane */}
        <Box
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            p: 2,
            bgcolor: 'background.default',
          }}
        >
          {children}
        </Box>
      </Box>

      {/* Artifacts Drawer */}
      <Drawer
        variant={isMobile ? 'temporary' : 'persistent'}
        anchor="right"
        open={artifactsOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile
        }}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            top: APP_BAR_HEIGHT,
            height: `calc(100vh - ${APP_BAR_HEIGHT}px)`,
          },
        }}
        id="artifacts-drawer"
        aria-labelledby="artifacts-drawer-heading"
      >
        {artifactsDrawer}
      </Drawer>
    </Box>
  );
}
