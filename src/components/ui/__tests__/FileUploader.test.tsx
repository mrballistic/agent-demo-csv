import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileUploader from '../FileUploader';

// keep fetch mocked to avoid network calls if component attempts upload during render
global.fetch = vi.fn();

describe('FileUploader Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockClear();
  });

  const defaultProps = {
    onFileUploaded: vi.fn(),
    onSystemMessage: vi.fn(),
  } as any;

  it('renders upload area with controls', () => {
    render(<FileUploader {...defaultProps} />);

    // component uses a heading with the drag/drop instruction
    expect(
      screen.getByRole('heading', { name: /drag and drop your csv file here/i })
    ).toBeInTheDocument();
    // secondary text with click to browse
    expect(screen.getByText(/click to browse/i)).toBeInTheDocument();
    // visible browse button
    expect(
      screen.getByRole('button', { name: /choose csv file to upload/i })
    ).toBeInTheDocument();
  });

  it('uploads a CSV via file input and reports success', async () => {
    const user = userEvent.setup();
    const mockOnFileUploaded = vi.fn();
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fileId: 'file_1',
        filename: 'test.csv',
        size: 123,
        rowCount: 2,
        profileHints: {
          columnCount: 2,
          hasHeaders: true,
          sampleData: [
            ['name', 'age'],
            ['John', '30'],
          ],
        },
      }),
    });

    render(
      <FileUploader {...defaultProps} onFileUploaded={mockOnFileUploaded} />
    );

    const csvContent = 'name,age\nJohn,30';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    const input = screen.getByLabelText(
      /^Choose CSV file$/i
    ) as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => {
      expect(mockOnFileUploaded).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: 'file_1' })
      );
      expect(
        screen.getByText(/File uploaded successfully!/i)
      ).toBeInTheDocument();
    });

    // Advance internal timers (progress interval and collapse timeout) inside act
    vi.useFakeTimers();
    await act(async () => {
      vi.runAllTimers();
    });
    vi.useRealTimers();
  });
});
