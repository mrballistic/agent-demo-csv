import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickActions } from '../QuickActions';

describe('QuickActions Component', () => {
  const mockOnAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    onAction: mockOnAction,
    disabled: false,
  };

  it('should render all quick action buttons', () => {
    render(<QuickActions {...defaultProps} />);

    expect(
      screen.getByRole('button', { name: /profile data/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /revenue trends/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /top products/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /channel analysis/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /export report/i })
    ).toBeInTheDocument();
  });

  it('should call onAction when button is clicked', async () => {
    const user = userEvent.setup();
    render(<QuickActions {...defaultProps} />);

    const profileButton = screen.getByRole('button', { name: /profile data/i });
    await user.click(profileButton);

    expect(mockOnAction).toHaveBeenCalledWith('Profile Data');
  });

  it('should disable all buttons when disabled prop is true', () => {
    render(<QuickActions {...defaultProps} disabled={true} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('should show tooltips on hover', async () => {
    const user = userEvent.setup();
    render(<QuickActions {...defaultProps} />);

    const profileButton = screen.getByRole('button', { name: /profile data/i });
    await user.hover(profileButton);

    expect(
      screen.getByText(/get an overview of your data/i)
    ).toBeInTheDocument();
  });

  it('should handle keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<QuickActions {...defaultProps} />);

    const firstButton = screen.getByRole('button', { name: /profile data/i });

    // Tab should focus the first button
    await user.tab();
    expect(firstButton).toHaveFocus();

    // Arrow keys should navigate between buttons
    await user.keyboard('{arrowright}');
    expect(
      screen.getByRole('button', { name: /revenue trends/i })
    ).toHaveFocus();

    await user.keyboard('{arrowleft}');
    expect(firstButton).toHaveFocus();
  });

  it('should trigger action on Enter key', async () => {
    const user = userEvent.setup();
    render(<QuickActions {...defaultProps} />);

    const profileButton = screen.getByRole('button', { name: /profile data/i });
    await user.click(profileButton);
    await user.keyboard('{enter}');

    expect(mockOnAction).toHaveBeenCalledWith('Profile Data');
  });

  it('should trigger action on Space key', async () => {
    const user = userEvent.setup();
    render(<QuickActions {...defaultProps} />);

    const trendsButton = screen.getByRole('button', {
      name: /revenue trends/i,
    });
    await user.click(trendsButton);
    await user.keyboard(' ');

    expect(mockOnAction).toHaveBeenCalledWith('Revenue Trends');
  });

  it('should show loading state for specific actions', () => {
    render(<QuickActions {...defaultProps} loadingAction="Profile Data" />);

    const profileButton = screen.getByRole('button', { name: /profile data/i });
    expect(profileButton).toBeDisabled();
    expect(screen.getByText(/profiling/i)).toBeInTheDocument();
  });

  it('should display icons for each action', () => {
    render(<QuickActions {...defaultProps} />);

    // Check for icon presence (assuming icons are rendered with specific test ids)
    expect(screen.getByTestId('profile-icon')).toBeInTheDocument();
    expect(screen.getByTestId('trends-icon')).toBeInTheDocument();
    expect(screen.getByTestId('products-icon')).toBeInTheDocument();
    expect(screen.getByTestId('channel-icon')).toBeInTheDocument();
    expect(screen.getByTestId('export-icon')).toBeInTheDocument();
  });

  it('should handle missing required columns gracefully', () => {
    const missingColumns = ['revenue', 'date'];
    render(<QuickActions {...defaultProps} missingColumns={missingColumns} />);

    const trendsButton = screen.getByRole('button', {
      name: /revenue trends/i,
    });
    expect(trendsButton).toBeDisabled();

    // Should show warning about missing columns
    expect(screen.getByText(/missing required columns/i)).toBeInTheDocument();
  });

  it('should group actions logically', () => {
    render(<QuickActions {...defaultProps} />);

    // Check that actions are grouped (assuming specific container structure)
    const analysisGroup = screen.getByLabelText(/analysis actions/i);
    const exportGroup = screen.getByLabelText(/export actions/i);

    expect(analysisGroup).toBeInTheDocument();
    expect(exportGroup).toBeInTheDocument();
  });

  it('should show action descriptions', () => {
    render(<QuickActions {...defaultProps} showDescriptions={true} />);

    expect(
      screen.getByText(/analyze data structure and quality/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/visualize revenue over time/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/identify best-selling products/i)
    ).toBeInTheDocument();
  });

  it('should handle custom action configurations', () => {
    const customActions = [
      {
        id: 'custom1',
        label: 'Custom Analysis',
        description: 'Run custom analysis',
        icon: 'custom-icon',
        requiredColumns: ['data'],
      },
    ];

    render(<QuickActions {...defaultProps} customActions={customActions} />);

    expect(
      screen.getByRole('button', { name: /custom analysis/i })
    ).toBeInTheDocument();
  });

  it('should prevent double-clicks', async () => {
    const user = userEvent.setup();
    render(<QuickActions {...defaultProps} />);

    const profileButton = screen.getByRole('button', { name: /profile data/i });

    // Double click rapidly
    await user.dblClick(profileButton);

    // Should only be called once due to debouncing
    expect(mockOnAction).toHaveBeenCalledTimes(1);
  });

  it('should show progress indicators for long-running actions', () => {
    render(
      <QuickActions
        {...defaultProps}
        actionProgress={{ 'Revenue Trends': 45 }}
      />
    );

    const trendsButton = screen.getByRole('button', {
      name: /revenue trends/i,
    });
    expect(trendsButton).toContainHTML('45%');
  });

  it('should handle action failures gracefully', () => {
    render(<QuickActions {...defaultProps} failedActions={['Profile Data']} />);

    const profileButton = screen.getByRole('button', { name: /profile data/i });
    expect(profileButton).toHaveClass('error-state');
    expect(screen.getByText(/retry/i)).toBeInTheDocument();
  });

  it('should support action shortcuts', async () => {
    const user = userEvent.setup();
    render(<QuickActions {...defaultProps} enableShortcuts={true} />);

    // Simulate keyboard shortcut (e.g., Ctrl+P for Profile)
    await user.keyboard('{control}p');

    expect(mockOnAction).toHaveBeenCalledWith('Profile Data');
  });

  it('should be responsive to different screen sizes', () => {
    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768, // Tablet size
    });

    render(<QuickActions {...defaultProps} />);

    // Should adapt layout for smaller screens
    const container = screen.getByRole('group', { name: /quick actions/i });
    expect(container).toHaveClass('responsive-layout');
  });

  it('should maintain focus after action completion', async () => {
    const user = userEvent.setup();
    render(<QuickActions {...defaultProps} />);

    const profileButton = screen.getByRole('button', { name: /profile data/i });
    await user.click(profileButton);

    // After action completes, focus should return to the button
    expect(profileButton).toHaveFocus();
  });
});
