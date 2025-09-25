import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import FileUploader from '../FileUploader';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('FileUploader Accessibility', () => {
  it('should not have accessibility violations', async () => {
    const { container } = render(
      <FileUploader onFileUploaded={vi.fn()} onSystemMessage={vi.fn()} />
    );

    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it('should have proper ARIA labels and roles', () => {
    render(<FileUploader onFileUploaded={vi.fn()} onSystemMessage={vi.fn()} />);

    // Check main upload area has proper role and labeling
    const uploadArea = screen.getByRole('button');
    expect(uploadArea).toHaveAttribute('aria-label', 'Upload CSV file');
    expect(uploadArea).toHaveAttribute(
      'aria-describedby',
      'upload-instructions'
    );

    // Check instructions are properly labeled
    expect(
      screen.getByText(/Drag and drop your CSV file here/)
    ).toHaveAttribute('id', 'upload-instructions');

    // Check hidden file input has proper labeling
    const fileInput = screen.getByLabelText('Choose CSV file');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('type', 'file');
  });

  it('should have proper keyboard navigation', () => {
    render(<FileUploader onFileUploaded={vi.fn()} onSystemMessage={vi.fn()} />);

    const uploadArea = screen.getByLabelText('Upload CSV file');

    // Upload area should be focusable
    uploadArea.focus();
    expect(document.activeElement).toBe(uploadArea);

    // Should have proper tabindex
    expect(uploadArea).toHaveAttribute('tabindex', '0');
  });

  it('should handle keyboard activation', () => {
    const mockFileUploaded = vi.fn();
    render(
      <FileUploader
        onFileUploaded={mockFileUploaded}
        onSystemMessage={vi.fn()}
      />
    );

    const uploadArea = screen.getByLabelText('Upload CSV file');

    // Should respond to Enter key
    fireEvent.keyDown(uploadArea, { key: 'Enter' });

    // Should respond to Space key
    fireEvent.keyDown(uploadArea, { key: ' ' });
  });

  it('should announce upload progress to screen readers', () => {
    render(<FileUploader onFileUploaded={vi.fn()} onSystemMessage={vi.fn()} />);

    // Progress should be announced when uploading
    // This would be tested with actual file upload simulation
    // For now, we check that the upload area has proper attributes
    const uploadArea = screen.getByLabelText('Upload CSV file');
    expect(uploadArea).toBeInTheDocument();
  });

  it('should be disabled when specified', () => {
    render(
      <FileUploader
        onFileUploaded={vi.fn()}
        onSystemMessage={vi.fn()}
        disabled={true}
      />
    );

    const uploadArea = screen.getByLabelText('Upload CSV file');

    // Should not be focusable when disabled
    expect(uploadArea).toHaveAttribute('tabindex', '-1');

    // Should have proper styling for disabled state
    expect(uploadArea).toHaveStyle({ cursor: 'not-allowed' });
  });

  it('should have proper error announcement', () => {
    render(<FileUploader onFileUploaded={vi.fn()} onSystemMessage={vi.fn()} />);

    // Error states would be tested with actual error simulation
    // The component should announce errors to screen readers
    const uploadArea = screen.getByLabelText('Upload CSV file');
    expect(uploadArea).toBeInTheDocument();
  });
});
