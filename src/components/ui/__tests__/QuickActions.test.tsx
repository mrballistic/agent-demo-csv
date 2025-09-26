import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickActions from '../QuickActions';

describe('QuickActions Component', () => {
  const mockOnAction = vi.fn();

  const mockSuggestions = [
    {
      id: 'profile',
      label: 'Profile Data',
      description: 'Analyze data structure and quality',
      requiredColumns: [],
      analysisType: 'profile',
      enabled: true,
    },
    {
      id: 'trends',
      label: 'Revenue Trends',
      description: 'Visualize revenue over time',
      requiredColumns: [],
      analysisType: 'trend',
      enabled: true,
    },
    {
      id: 'top-products',
      label: 'Top Products',
      description: 'Identify best-selling products',
      requiredColumns: [],
      analysisType: 'top-sku',
      enabled: true,
    },
    {
      id: 'channel-mix',
      label: 'Channel Analysis',
      description: 'Breakdown by sales channel',
      requiredColumns: [],
      analysisType: 'channel-mix',
      enabled: true,
    },
    {
      id: 'export',
      label: 'Export Report',
      description: 'Download analysis as CSV',
      requiredColumns: [],
      analysisType: 'outlier',
      enabled: true,
    },
  ];
  const mockMetadata = {
    columnCount: 5,
    availableColumns: ['a', 'b', 'c', 'd', 'e'],
    generatedAt: 'now',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            suggestions: mockSuggestions,
            metadata: mockMetadata,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
  });

  const defaultProps = {
    onAction: mockOnAction,
    disabled: false,
    fileId: 'test-file', // fileId present by default
  };

  it('should render nothing when no fileId is provided', () => {
    const { container } = render(<QuickActions onAction={mockOnAction} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render all quick action buttons when fileId is provided', async () => {
    render(<QuickActions {...defaultProps} />);
    await waitFor(() => {
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
  });

  it('should call onAction when button is clicked', async () => {
    const user = userEvent.setup();
    render(<QuickActions {...defaultProps} />);
    const profileButton = await screen.findByRole('button', {
      name: /profile data/i,
    });
    await user.click(profileButton);
    expect(mockOnAction).toHaveBeenCalledWith('profile', 'profile');
  });

  it('should disable all action buttons when disabled prop is true', async () => {
    render(<QuickActions {...defaultProps} disabled={true} />);
    await waitFor(() => {
      const actionButtons = screen
        .getAllByRole('button')
        .filter(
          btn =>
            btn.textContent &&
            btn.textContent.match(
              /profile data|revenue trends|top products|channel analysis|export report/i
            )
        );
      actionButtons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });
  });

  // All a11y and interaction tests now reflect the current implementation and UI. No further a11y tests to update.
});
