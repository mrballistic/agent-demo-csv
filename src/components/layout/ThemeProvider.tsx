'use client';

import {
  createTheme,
  ThemeProvider as MuiThemeProvider,
} from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ReactNode, useEffect, useState } from 'react';

interface ThemeProviderProps {
  children: ReactNode;
}

export default function ThemeProvider({ children }: ThemeProviderProps) {
  // Use a more reliable detection method
  const [effectiveDark, setEffectiveDark] = useState<boolean>(() => {
    // Only run on client-side
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false; // Default to light on server
  });
  const [mounted, setMounted] = useState(false);

  // Always use system theme preference
  useEffect(() => {
    setMounted(true);

    const updateEffectiveDark = () => {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      console.log('System theme detected:', isDark ? 'dark' : 'light'); // Debug log
      setEffectiveDark(isDark);
    };

    // Ensure we have the correct initial value
    updateEffectiveDark();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', updateEffectiveDark);
    return () => mediaQuery.removeEventListener('change', updateEffectiveDark);
  }, []);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <MuiThemeProvider theme={createTheme({ palette: { mode: 'light' } })}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    );
  }

  const theme = createTheme({
    palette: {
      mode: effectiveDark ? 'dark' : 'light',
      primary: {
        main: '#1976d2',
      },
      secondary: {
        main: '#dc004e',
      },
      background: {
        default: effectiveDark ? '#121212' : '#fafafa',
        paper: effectiveDark ? '#1e1e1e' : '#ffffff',
      },
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    },
    components: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: effectiveDark ? '#1e1e1e' : '#ffffff',
            color: effectiveDark ? '#ffffff' : '#000000',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: effectiveDark ? '#1e1e1e' : '#ffffff',
          },
        },
      },
    },
  });

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}
