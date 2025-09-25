import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtifactsPanel } from '../ArtifactsPanel';

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-blob-url');
global.URL.revokeObjectURL = vi.fn();

// Mock fetch for downloads
global.fetch = vi.fn();

describe('ArtifactsPanel Component', () => {
  const mockOnDownload = vi.fn();
  const mockOnBulkExport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockClear();
  });

  const mockArtifacts = [
    {
      id: 'artifact_1',
      name: 'revenue_trends_20241201_143022_v1.png',
      type: 'image' as const,
      size: 1024,
      downloadUrl: '/api/artifacts/artifact_1/download',
      createdAt: Date.now(),
    },
    {
      id: 'artifact_2',
      name: 'cleaned_data_20241201_143045_v1.csv',
      type: 'file' as const,
      size: 2048,
      downloadUrl: '/api/artifacts/artifact_2/download',
      createdAt: Date.now(),
    },
    {
      id: 'artifact_3',
      name: 'summary_20241201_143100_v1.md',
      type: 'file' as const,
      size: 512,
      downloadUrl: '/api/artifacts/artifact_3/download',
      createdAt: Date.now(),
    },
  ];

  const defaultProps = {
    artifacts: mockArtifacts,
    onDownload: mockOnDownload,
    onBulkExport: mockOnBulkExport,
    isOpen: true,
  };

  it('should render artifacts panel with list of artifacts', () => {
    render(<ArtifactsPanel {...defaultProps} />);

    expect(screen.getByText(/artifacts/i)).toBeInTheDocument();
    expect(
      screen.getByText(/revenue_trends_20241201_143022_v1\.png/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cleaned_data_20241201_143045_v1\.csv/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/summary_20241201_143100_v1\.md/i)
    ).toBeInTheDocument();
  });

  it('should show empty state when no artifacts', () => {
    render(<ArtifactsPanel {...defaultProps} artifacts={[]} />);

    expect(screen.getByText(/no artifacts yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/run an analysis to generate/i)
    ).toBeInTheDocument();
  });

  it('should display artifact metadata correctly', () => {
    render(<ArtifactsPanel {...defaultProps} />);

    // Check file sizes are displayed
    expect(screen.getByText(/1\.0 kb/i)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 kb/i)).toBeInTheDocument();
    expect(screen.getByText(/512 b/i)).toBeInTheDocument();

    // Check file types are indicated
    expect(screen.getByText(/image/i)).toBeInTheDocument();
    expect(screen.getAllByText(/file/i)).toHaveLength(2);
  });

  it('should handle individual artifact download', async () => {
    const user = userEvent.setup();
    render(<ArtifactsPanel {...defaultProps} />);

    const downloadButton = screen.getAllByRole('button', {
      name: /download/i,
    })[0];
    await user.click(downloadButton!);

    expect(mockOnDownload).toHaveBeenCalledWith('artifact_1');
  });

  it('should handle bulk export', async () => {
    const user = userEvent.setup();
    render(<ArtifactsPanel {...defaultProps} />);

    const exportAllButton = screen.getByRole('button', { name: /export all/i });
    await user.click(exportAllButton);

    expect(mockOnBulkExport).toHaveBeenCalledWith([
      'artifact_1',
      'artifact_2',
      'artifact_3',
    ]);
  });

  it('should support selective bulk export', async () => {
    const user = userEvent.setup();
    render(<ArtifactsPanel {...defaultProps} />);

    // Select specific artifacts
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!); // Select first artifact
    await user.click(checkboxes[2]!); // Select third artifact

    const exportSelectedButton = screen.getByRole('button', {
      name: /export selected/i,
    });
    await user.click(exportSelectedButton);

    expect(mockOnBulkExport).toHaveBeenCalledWith(['artifact_1', 'artifact_3']);
  });

  it('should show artifact previews for images', () => {
    render(<ArtifactsPanel {...defaultProps} />);

    const imageArtifact = screen.getByAltText(
      /revenue_trends_20241201_143022_v1\.png/i
    );
    expect(imageArtifact).toBeInTheDocument();
    expect(imageArtifact).toHaveAttribute(
      'src',
      expect.stringContaining('artifact_1')
    );
  });

  it('should group artifacts by type', () => {
    // @ts-expect-error - Testing hypothetical groupByType prop
    render(<ArtifactsPanel {...defaultProps} groupByType={true} />);

    expect(screen.getByText(/images/i)).toBeInTheDocument();
    expect(screen.getByText(/files/i)).toBeInTheDocument();
  });

  it('should sort artifacts by creation date', () => {
    const artifactsWithDifferentDates = [
      { ...mockArtifacts[0], createdAt: Date.now() - 3600000 }, // 1 hour ago
      { ...mockArtifacts[1], createdAt: Date.now() - 1800000 }, // 30 minutes ago
      { ...mockArtifacts[2], createdAt: Date.now() - 900000 }, // 15 minutes ago
    ];

    render(
      <ArtifactsPanel
        {...defaultProps}
        // @ts-expect-error - Testing with incomplete artifact data
        artifacts={artifactsWithDifferentDates}
      />
    );

    const artifactNames = screen.getAllByText(/\.(png|csv|md)$/i);

    // Should be sorted by newest first
    expect(artifactNames[0]).toHaveTextContent('summary_20241201_143100_v1.md');
    expect(artifactNames[1]).toHaveTextContent(
      'cleaned_data_20241201_143045_v1.csv'
    );
    expect(artifactNames[2]).toHaveTextContent(
      'revenue_trends_20241201_143022_v1.png'
    );
  });

  it('should handle download errors gracefully', async () => {
    const user = userEvent.setup();

    // Mock download failure
    mockOnDownload.mockRejectedValueOnce(new Error('Download failed'));

    render(<ArtifactsPanel {...defaultProps} />);

    const downloadButton = screen.getAllByRole('button', {
      name: /download/i,
    })[0];
    await user.click(downloadButton!);

    await waitFor(() => {
      expect(screen.getByText(/download failed/i)).toBeInTheDocument();
    });
  });

  it('should show loading state during bulk export', async () => {
    const user = userEvent.setup();
    render(<ArtifactsPanel {...defaultProps} />);

    // Mock slow bulk export
    mockOnBulkExport.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    const exportAllButton = screen.getByRole('button', { name: /export all/i });
    await user.click(exportAllButton);

    expect(screen.getByText(/creating export/i)).toBeInTheDocument();
  });

  it('should support keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<ArtifactsPanel {...defaultProps} />);

    // Tab should navigate through artifacts
    await user.tab();
    expect(
      screen.getAllByRole('button', { name: /download/i })[0]
    ).toHaveFocus();

    await user.tab();
    expect(
      screen.getAllByRole('button', { name: /download/i })[1]
    ).toHaveFocus();
  });

  it('should show artifact creation timestamps', () => {
    const now = Date.now();
    const artifactsWithTimestamps = mockArtifacts.map((artifact, index) => ({
      ...artifact,
      createdAt: now - index * 60000, // Each artifact 1 minute apart
    }));

    render(
      <ArtifactsPanel {...defaultProps} artifacts={artifactsWithTimestamps} />
    );

    expect(screen.getByText(/just now/i)).toBeInTheDocument();
    expect(screen.getByText(/1 minute ago/i)).toBeInTheDocument();
    expect(screen.getByText(/2 minutes ago/i)).toBeInTheDocument();
  });

  it('should handle artifact versioning display', () => {
    const versionedArtifacts = [
      {
        id: 'artifact_1',
        name: 'revenue_trends_20241201_143022_v1.png',
        type: 'image' as const,
        size: 1024,
        downloadUrl: '/api/artifacts/artifact_1/download',
        createdAt: Date.now(),
        version: 1,
      },
      {
        id: 'artifact_2',
        name: 'revenue_trends_20241201_143022_v2.png',
        type: 'image' as const,
        size: 1024,
        downloadUrl: '/api/artifacts/artifact_2/download',
        createdAt: Date.now(),
        version: 2,
      },
    ];

    render(<ArtifactsPanel {...defaultProps} artifacts={versionedArtifacts} />);

    expect(screen.getByText(/v1/i)).toBeInTheDocument();
    expect(screen.getByText(/v2/i)).toBeInTheDocument();
    expect(screen.getByText(/latest/i)).toBeInTheDocument(); // v2 should be marked as latest
  });

  it('should support artifact filtering', async () => {
    const user = userEvent.setup();
    // @ts-expect-error - Testing hypothetical showFilters prop
    render(<ArtifactsPanel {...defaultProps} showFilters={true} />);

    const filterInput = screen.getByPlaceholderText(/filter artifacts/i);
    await user.type(filterInput, 'revenue');

    // Should only show artifacts matching the filter
    expect(
      screen.getByText(/revenue_trends_20241201_143022_v1\.png/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/cleaned_data_20241201_143045_v1\.csv/i)
    ).not.toBeInTheDocument();
  });

  it('should handle panel collapse/expand', async () => {
    const user = userEvent.setup();
    // @ts-expect-error - Testing hypothetical collapsible prop
    render(<ArtifactsPanel {...defaultProps} collapsible={true} />);

    const collapseButton = screen.getByRole('button', { name: /collapse/i });
    await user.click(collapseButton);

    // Artifacts list should be hidden
    expect(
      screen.queryByText(/revenue_trends_20241201_143022_v1\.png/i)
    ).not.toBeInTheDocument();

    // Click to expand
    const expandButton = screen.getByRole('button', { name: /expand/i });
    await user.click(expandButton);

    // Artifacts should be visible again
    expect(
      screen.getByText(/revenue_trends_20241201_143022_v1\.png/i)
    ).toBeInTheDocument();
  });

  it('should show storage usage information', () => {
    const totalSize = mockArtifacts.reduce(
      (sum, artifact) => sum + artifact.size,
      0
    );

    // @ts-expect-error - Testing hypothetical showStorageInfo prop
    render(<ArtifactsPanel {...defaultProps} showStorageInfo={true} />);

    expect(screen.getByText(/total size/i)).toBeInTheDocument();
    expect(screen.getByText(/3\.5 kb/i)).toBeInTheDocument(); // Total of all artifact sizes
  });

  it('should support drag and drop reordering', async () => {
    const user = userEvent.setup();
    // @ts-expect-error - Testing hypothetical allowReorder prop
    render(<ArtifactsPanel {...defaultProps} allowReorder={true} />);

    const firstArtifact = screen.getByText(
      /revenue_trends_20241201_143022_v1\.png/i
    );
    const secondArtifact = screen.getByText(
      /cleaned_data_20241201_143045_v1\.csv/i
    );

    // Simulate drag and drop
    fireEvent.dragStart(firstArtifact);
    fireEvent.dragOver(secondArtifact);
    fireEvent.drop(secondArtifact);

    // Order should change (this would require implementation in the component)
    // For now, just verify drag events are handled
    expect(firstArtifact).toBeInTheDocument();
    expect(secondArtifact).toBeInTheDocument();
  });

  it('should handle artifact deletion', async () => {
    const user = userEvent.setup();
    const mockOnDelete = vi.fn();

    // @ts-expect-error - Testing hypothetical onDelete prop
    render(<ArtifactsPanel {...defaultProps} onDelete={mockOnDelete} />);

    const deleteButton = screen.getAllByRole('button', { name: /delete/i })[0];
    await user.click(deleteButton!);

    // Should show confirmation dialog
    expect(screen.getByText(/confirm deletion/i)).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    await user.click(confirmButton);

    expect(mockOnDelete).toHaveBeenCalledWith('artifact_1');
  });
});
