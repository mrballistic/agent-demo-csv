import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileUploader from '../FileUploader';

// Mock fetch for file upload
global.fetch = vi.fn();

describe('FileUploader Component', () => {
  const mockOnUploadSuccess = vi.fn();
  const mockOnUploadError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockClear();
  });

  const defaultProps = {
    onUploadSuccess: mockOnUploadSuccess,
    onUploadError: mockOnUploadError,
    onFileUploaded: vi.fn(),
    onSystemMessage: vi.fn(),
    disabled: false,
  };

  it('should render upload area with drag and drop zone', () => {
    render(<FileUploader {...defaultProps} />);

    expect(
      screen.getByText(/drag & drop your csv file here/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/or click to browse/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /browse files/i })
    ).toBeInTheDocument();
  });

  it('should accept CSV files through file input', async () => {
    const user = userEvent.setup();
    render(<FileUploader {...defaultProps} />);

    const csvContent = 'name,age\nJohn,30\nJane,25';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fileId: 'file_123',
        filename: 'test.csv',
        size: csvContent.length,
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

    const fileInput = screen.getByLabelText(/upload csv file/i);
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(mockOnUploadSuccess).toHaveBeenCalledWith({
        fileId: 'file_123',
        filename: 'test.csv',
        size: csvContent.length,
        rowCount: 2,
        profileHints: {
          columnCount: 2,
          hasHeaders: true,
          sampleData: [
            ['name', 'age'],
            ['John', '30'],
          ],
        },
      });
    });
  });

  it('should handle drag and drop file upload', async () => {
    render(<FileUploader {...defaultProps} />);

    const csvContent = 'order_id,total\n1,100\n2,200';
    const file = new File([csvContent], 'orders.csv', { type: 'text/csv' });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fileId: 'file_456',
        filename: 'orders.csv',
        size: csvContent.length,
        rowCount: 2,
      }),
    });

    const dropZone = screen
      .getByText(/drag & drop your csv file here/i)
      .closest('div');

    // Simulate drag and drop
    fireEvent.dragEnter(dropZone!, {
      dataTransfer: {
        files: [file],
        types: ['Files'],
      },
    });

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(mockOnUploadSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'file_456',
          filename: 'orders.csv',
        })
      );
    });
  });

  it('should show visual feedback during drag over', () => {
    render(<FileUploader {...defaultProps} />);

    const dropZone = screen
      .getByText(/drag & drop your csv file here/i)
      .closest('div');

    fireEvent.dragEnter(dropZone!);
    expect(dropZone).toHaveClass('drag-over'); // Assuming this class is added

    fireEvent.dragLeave(dropZone!);
    expect(dropZone).not.toHaveClass('drag-over');
  });

  it('should reject non-CSV files', async () => {
    const user = userEvent.setup();
    render(<FileUploader {...defaultProps} />);

    const textFile = new File(['some text'], 'test.txt', {
      type: 'text/plain',
    });

    const fileInput = screen.getByLabelText(/upload csv file/i);
    await user.upload(fileInput, textFile);

    await waitFor(() => {
      expect(mockOnUploadError).toHaveBeenCalledWith(
        expect.stringContaining('CSV')
      );
    });
  });

  it('should reject files over 50MB', async () => {
    const user = userEvent.setup();
    render(<FileUploader {...defaultProps} />);

    // Create a large file (over 50MB)
    const largeContent = 'a'.repeat(51 * 1024 * 1024); // 51MB
    const largeFile = new File([largeContent], 'large.csv', {
      type: 'text/csv',
    });

    const fileInput = screen.getByLabelText(/upload csv file/i);
    await user.upload(fileInput, largeFile);

    await waitFor(() => {
      expect(mockOnUploadError).toHaveBeenCalledWith(
        expect.stringContaining('50MB')
      );
    });
  });

  it('should show upload progress', async () => {
    const user = userEvent.setup();
    render(<FileUploader {...defaultProps} />);

    const csvContent = 'name,age\nJohn,30';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    // Mock a delayed response to show progress
    (global.fetch as any).mockImplementationOnce(
      () =>
        new Promise(resolve =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  fileId: 'file_123',
                  filename: 'test.csv',
                  size: csvContent.length,
                  rowCount: 1,
                }),
              }),
            100
          )
        )
    );

    const fileInput = screen.getByLabelText(/upload csv file/i);
    await user.upload(fileInput, file);

    // Should show uploading state
    expect(screen.getByText(/uploading/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(mockOnUploadSuccess).toHaveBeenCalled();
    });
  });

  it('should handle upload errors gracefully', async () => {
    const user = userEvent.setup();
    render(<FileUploader {...defaultProps} />);

    const csvContent = 'name,age\nJohn,30';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        type: 'validation_error',
        message: 'Invalid CSV format',
      }),
    });

    const fileInput = screen.getByLabelText(/upload csv file/i);
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(mockOnUploadError).toHaveBeenCalledWith('Invalid CSV format');
    });
  });

  it('should be disabled when prop is set', () => {
    render(<FileUploader {...defaultProps} disabled={true} />);

    const fileInput = screen.getByLabelText(/upload csv file/i);
    const browseButton = screen.getByRole('button', { name: /browse files/i });

    expect(fileInput).toBeDisabled();
    expect(browseButton).toBeDisabled();
    expect(screen.getByText(/upload disabled/i)).toBeInTheDocument();
  });

  it('should show file validation hints', () => {
    render(<FileUploader {...defaultProps} />);

    expect(screen.getByText(/csv files only/i)).toBeInTheDocument();
    expect(screen.getByText(/max 50mb/i)).toBeInTheDocument();
  });

  it('should handle multiple file selection by using only the first', async () => {
    const user = userEvent.setup();
    render(<FileUploader {...defaultProps} />);

    const file1 = new File(['data1'], 'file1.csv', { type: 'text/csv' });
    const file2 = new File(['data2'], 'file2.csv', { type: 'text/csv' });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fileId: 'file_123',
        filename: 'file1.csv',
        size: 5,
        rowCount: 0,
      }),
    });

    const fileInput = screen.getByLabelText(/upload csv file/i);
    await user.upload(fileInput, [file1, file2]);

    await waitFor(() => {
      expect(mockOnUploadSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'file1.csv',
        })
      );
    });
  });

  it('should clear previous upload state on new upload', async () => {
    const user = userEvent.setup();
    render(<FileUploader {...defaultProps} />);

    const file1 = new File(['data1'], 'file1.csv', { type: 'text/csv' });
    const file2 = new File(['data2'], 'file2.csv', { type: 'text/csv' });

    // First upload
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fileId: 'file_123',
        filename: 'file1.csv',
        size: 5,
        rowCount: 0,
      }),
    });

    const fileInput = screen.getByLabelText(/upload csv file/i);
    await user.upload(fileInput, file1);

    await waitFor(() => {
      expect(mockOnUploadSuccess).toHaveBeenCalledTimes(1);
    });

    // Second upload should clear previous state
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fileId: 'file_456',
        filename: 'file2.csv',
        size: 5,
        rowCount: 0,
      }),
    });

    await user.upload(fileInput, file2);

    await waitFor(() => {
      expect(mockOnUploadSuccess).toHaveBeenCalledTimes(2);
    });
  });

  it('should show success state after upload', async () => {
    const user = userEvent.setup();
    render(<FileUploader {...defaultProps} />);

    const csvContent = 'name,age\nJohn,30';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fileId: 'file_123',
        filename: 'test.csv',
        size: csvContent.length,
        rowCount: 1,
      }),
    });

    const fileInput = screen.getByLabelText(/upload csv file/i);
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText(/upload successful/i)).toBeInTheDocument();
      expect(screen.getByText(/test\.csv/i)).toBeInTheDocument();
    });
  });

  it('should handle network errors', async () => {
    const user = userEvent.setup();
    render(<FileUploader {...defaultProps} />);

    const csvContent = 'name,age\nJohn,30';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    const fileInput = screen.getByLabelText(/upload csv file/i);
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(mockOnUploadError).toHaveBeenCalledWith(
        expect.stringContaining('network')
      );
    });
  });

  it('should support keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<FileUploader {...defaultProps} />);

    const browseButton = screen.getByRole('button', { name: /browse files/i });

    // Tab should focus the browse button
    await user.tab();
    expect(browseButton).toHaveFocus();

    // Enter should trigger file selection
    await user.keyboard('{enter}');
    // File input should be triggered (hard to test directly)
  });

  it('should prevent default drag behaviors', () => {
    render(<FileUploader {...defaultProps} />);

    const dropZone = screen
      .getByText(/drag & drop your csv file here/i)
      .closest('div');

    const dragOverEvent = new Event('dragover', { bubbles: true });
    const preventDefaultSpy = vi.spyOn(dragOverEvent, 'preventDefault');

    fireEvent(dropZone!, dragOverEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});
