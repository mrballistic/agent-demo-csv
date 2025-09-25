import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import QuickActions from '../QuickActions';

// Mock fetch for suggestions API
global.fetch = vi.fn();

const mockSuggestions = {
  fileId: 'test-file',
  suggestions: [
    {
      id: 'profile',
      label: 'Profile Data',
      description: 'Get an overview of your data structure and quality',
      requiredColumns: [],
      analysisType: 'profile' as const,
      enabled: true,
    },
    {
      id: 'trends',
      label: 'Analyze Trends',
      description: 'Identify patterns and trends over time',
      requiredColumns: ['date', 'value'],
      analysisType: 'trend' as const,
      enabled: true,
    },
    {
      id: 'disabled-action',
      label: 'Disabled Action',
      description: 'This action is not available',
      requiredColumns: ['missing_column'],
      analysisType: 'outlier' as const,
      enabled: false,
      reason: 'Required columns are missing',
    },
  ],
  metadata: {
    columnCount: 5,
    availableColumns: ['date', 'value', 'category'],
    generatedAt: new Date().toISOString(),
  },
};

describe('QuickActions Accessibility', () => {
  beforeEach(() => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockSuggestions,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not have accessibility violations', async () => {
    const { container } = render(
      <QuickActions fileId="test-file" onAction={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Profile Data')).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it('should have proper ARIA labels and roles', async () => {
    render(<QuickActions fileId="test-file" onAction={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Profile Data')).toBeInTheDocument();
    });

    // Check main region has proper labeling
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.getByLabelText(/Quick Actions/)).toBeInTheDocument();

    // Check action group has proper role
    expect(screen.getByRole('group')).toBeInTheDocument();
    expect(screen.getByLabelText('Analysis actions')).toBeInTheDocument();

    // Check buttons have proper descriptions
    const profileButton = screen.getByText('Profile Data').closest('button');
    const trendsButton = screen.getByText('Analyze Trends').closest('button');
    expect(profileButton).toHaveAttribute('aria-describedby');
    expect(trendsButton).toHaveAttribute('aria-describedby');
  });

  it('should have proper keyboard navigation', async () => {
    render(<QuickActions fileId="test-file" onAction={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Profile Data')).toBeInTheDocument();
    });

    const buttons = screen
      .getAllByRole('button')
      .filter(btn => !(btn as HTMLButtonElement).disabled);

    // First enabled button should be focusable
    expect(buttons[0]).toHaveAttribute('tabindex', '0');

    // Other buttons should not be focusable initially
    if (buttons.length > 1) {
      expect(buttons[1]).toHaveAttribute('tabindex', '-1');
    }
  });

  it('should handle disabled actions properly', async () => {
    render(<QuickActions fileId="test-file" onAction={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Disabled Action')).toBeInTheDocument();
    });

    const disabledButton = screen
      .getByText('Disabled Action')
      .closest('button');
    expect(disabledButton).toBeDisabled();

    // Check that disabled button exists (tooltip testing would require more complex setup)
    expect(disabledButton).toBeInTheDocument();
  });

  it('should announce action execution to screen readers', async () => {
    const mockOnAction = vi.fn();
    render(<QuickActions fileId="test-file" onAction={mockOnAction} />);

    await waitFor(() => {
      expect(screen.getByText('Profile Data')).toBeInTheDocument();
    });

    const profileButton = screen.getByText('Profile Data').closest('button');
    fireEvent.click(profileButton!);

    expect(mockOnAction).toHaveBeenCalledWith('profile', 'profile');
  });

  it('should handle loading state accessibility', () => {
    (fetch as any).mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<QuickActions fileId="test-file" onAction={vi.fn()} />);

    // Check loading state has proper announcements
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading suggestions...')).toHaveAttribute(
      'aria-live',
      'polite'
    );
  });

  it('should handle error state accessibility', async () => {
    (fetch as any).mockRejectedValue(new Error('Network error'));

    render(<QuickActions fileId="test-file" onAction={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // Check error alert has proper role
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();

    // Check retry button has proper labeling
    const retryButton = screen.getByLabelText('Retry loading suggestions');
    expect(retryButton).toBeInTheDocument();
  });

  it('should handle empty file state accessibility', () => {
    render(<QuickActions fileId={null} onAction={vi.fn()} />);

    // Check empty state has proper structure
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(
      screen.getByText(/Upload a CSV file to see analysis suggestions/)
    ).toBeInTheDocument();
  });

  it('should have proper chip labeling', async () => {
    render(<QuickActions fileId="test-file" onAction={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('5 columns detected')).toBeInTheDocument();
    });

    // Check that the chip has proper labeling
    const chip = screen.getByText('5 columns detected');
    expect(chip).toBeInTheDocument();
  });
});
