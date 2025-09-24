'use client';

import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Brightness4,
  Brightness7,
  SettingsBrightness,
  MoreVert,
} from '@mui/icons-material';
import { useState } from 'react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle() {
  const { mode, setMode, effectiveDark } = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleModeSelect = (selectedMode: 'light' | 'dark' | 'system') => {
    setMode(selectedMode);
    handleClose();
  };

  const getIcon = () => {
    switch (mode) {
      case 'light':
        return <Brightness7 />;
      case 'dark':
        return <Brightness4 />;
      case 'system':
        return <SettingsBrightness />;
      default:
        return <SettingsBrightness />;
    }
  };

  return (
    <>
      <IconButton
        onClick={handleClick}
        color="inherit"
        aria-label="theme toggle"
        aria-controls={open ? 'theme-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
      >
        {getIcon()}
      </IconButton>
      <Menu
        id="theme-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          'aria-labelledby': 'theme-button',
        }}
      >
        <MenuItem
          onClick={() => handleModeSelect('light')}
          selected={mode === 'light'}
        >
          <ListItemIcon>
            <Brightness7 fontSize="small" />
          </ListItemIcon>
          <ListItemText>Light</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => handleModeSelect('dark')}
          selected={mode === 'dark'}
        >
          <ListItemIcon>
            <Brightness4 fontSize="small" />
          </ListItemIcon>
          <ListItemText>Dark</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => handleModeSelect('system')}
          selected={mode === 'system'}
        >
          <ListItemIcon>
            <SettingsBrightness fontSize="small" />
          </ListItemIcon>
          <ListItemText>System</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
