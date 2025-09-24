'use client';

import {
  createTheme,
  ThemeProvider as MuiThemeProvider,
} from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  effectiveDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export default function ThemeProvider({ children }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [effectiveDark, setEffectiveDark] = useState(false);

  // Initialize theme from localStorage and system preference
  useEffect(() => {
    const savedMode = localStorage.getItem('theme-mode') as ThemeMode;
    if (savedMode && ['light', 'dark', 'system'].includes(savedMode)) {
      setModeState(savedMode);
    }
  }, []);

  // Update effective dark mode based on current mode and system preference
  useEffect(() => {
    const updateEffectiveDark = () => {
      if (mode === 'system') {
        setEffectiveDark(
          window.matchMedia('(prefers-color-scheme: dark)').matches
        );
      } else {
        setEffectiveDark(mode === 'dark');
      }
    };

    updateEffectiveDark();

    if (mode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', updateEffectiveDark);
      return () =>
        mediaQuery.removeEventListener('change', updateEffectiveDark);
    }

    return undefined;
  }, [mode]);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem('theme-mode', newMode);
  };

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

  const contextValue: ThemeContextType = {
    mode,
    setMode,
    effectiveDark,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}
