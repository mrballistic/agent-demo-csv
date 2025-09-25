import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ArtifactsPanel, ArtifactItem } from '../ArtifactsPanel';

const mockArtifacts: ArtifactItem[] = [
  {
    id: '1',
    name: 'revenue_trends.png',
    type: 'image',
    size: 1024,
    downloadUrl: '/download/1',
    createdAt: Date.now(),
    mimeType: 'image/png',
    manifest: {
      insight: 'Revenue shows upward trend over the last quarter',
      metadata: {
        analysis_type: 'trend',
        columns_used: ['date', 'revenue'],
      },
    },
  },
  {
    id: '2',
    name: 'cleaned_data.csv',
    type: 'data',
    size: 2048,
    downloadUrl: '/download/2',
    createdAt: Date.now(),
    mimeType: 'text/csv',
  },
];

describe('ArtifactsPanel Accessibility', () => {
  it('should not have accessibility violations', async () => {
    const { container } = render(
      <ArtifactsPanel
        artifacts={mockArtifacts}
        sessionId="test-session"
        threadId="test-thread"
        onDownload={vi.fn()}
        onBulkExport={vi.fn()}
      />
    );

    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it('should have proper ARIA labels and roles', () => {
    render(
      <ArtifactsPanel
        artifacts={mockArtifacts}
        sessionId="test-session"
        threadId="test-thread"
        onDownload={vi.fn()}
        onBulkExport={vi.fn()}
      />
    );

    // Check main region has proper labeling
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.getByLabelText(/Generated Files/)).toBeInTheDocument();

    // Check toolbar has proper role
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(screen.getByLabelText('Artifact actions')).toBeInTheDocument();

    // Check list has proper role
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByLabelText('Generated artifacts')).toBeInTheDocument();

    // Check list items have proper roles
    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(2);
  });

  it('should have proper keyboard navigation', () => {
    render(
      <ArtifactsPanel
        artifacts={mockArtifacts}
        sessionId="test-session"
        threadId="test-thread"
        onDownload={vi.fn()}
        onBulkExport={vi.fn()}
      />
    );

    const listItems = screen.getAllByRole('listitem');

    // First item should be focusable
    expect(listItems[0]).toHaveAttribute('tabindex', '0');

    // Other items should not be focusable initially
    expect(listItems[1]).toHaveAttribute('tabindex', '-1');
  });

  it('should have proper alt text for chart images', () => {
    render(
      <ArtifactsPanel
        artifacts={mockArtifacts}
        sessionId="test-session"
        threadId="test-thread"
        onDownload={vi.fn()}
        onBulkExport={vi.fn()}
      />
    );

    // Check that chart artifact has descriptive text for screen readers
    const chartDescription = screen.getByText(/Chart showing trend/);
    expect(chartDescription).toBeInTheDocument();
  });

  it('should announce download actions to screen readers', async () => {
    const mockDownload = vi.fn();
    render(
      <ArtifactsPanel
        artifacts={mockArtifacts}
        sessionId="test-session"
        threadId="test-thread"
        onDownload={mockDownload}
        onBulkExport={vi.fn()}
      />
    );

    const downloadButtons = screen.getAllByLabelText(/Download/);

    // Click download button
    fireEvent.click(downloadButtons[0]);

    expect(mockDownload).toHaveBeenCalledWith('1');
  });

  it('should have proper checkbox labeling', () => {
    render(
      <ArtifactsPanel
        artifacts={mockArtifacts}
        sessionId="test-session"
        threadId="test-thread"
        onDownload={vi.fn()}
        onBulkExport={vi.fn()}
      />
    );

    // Check that checkboxes have proper labels
    expect(
      screen.getByLabelText('Select revenue_trends.png')
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Select cleaned_data.csv')
    ).toBeInTheDocument();
  });

  it('should handle empty state accessibility', () => {
    render(
      <ArtifactsPanel
        artifacts={[]}
        sessionId="test-session"
        threadId="test-thread"
        onDownload={vi.fn()}
        onBulkExport={vi.fn()}
      />
    );

    // Check empty state has proper structure
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.getByText(/No artifacts generated yet/)).toBeInTheDocument();
  });
});
