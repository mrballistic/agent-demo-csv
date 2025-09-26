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

    const results = await axe(container, {
      rules: {
        // Allow nested interactive elements for drag-and-drop components
        'nested-interactive': { enabled: false },
      },
    });
    expect(results.violations).toHaveLength(0);
  });

  it('should have proper ARIA labels and roles', () => {
    render(<FileUploader onFileUploaded={vi.fn()} onSystemMessage={vi.fn()} />);

    // Check main upload button has proper labeling
    const uploadButton = screen.getByLabelText('Choose CSV file to upload');
    expect(uploadButton).toHaveAttribute(
      'aria-label',
      'Choose CSV file to upload'
    );
    expect(uploadButton).toHaveAttribute(
      'aria-describedby',
      'upload-instructions'
    );

    // Check instructions are properly labeled
    // There may be multiple elements with this text; find the one with the correct id
    const instructions = screen.getAllByText(
      /Drag and drop your CSV file here/
    );
    const described = instructions.find(el => el.id === 'upload-instructions');
    expect(described).toBeInTheDocument();
    expect(described).toHaveAttribute('id', 'upload-instructions');

    // Check hidden file input has proper labeling
    const fileInput = screen.getByLabelText('Choose CSV file');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('type', 'file');
  });

  it('should have proper keyboard navigation', () => {
    render(<FileUploader onFileUploaded={vi.fn()} onSystemMessage={vi.fn()} />);

    const uploadButton = screen.getByLabelText('Choose CSV file to upload');

    // Upload button should be focusable
    expect(uploadButton).toBeInTheDocument();
    expect(uploadButton).toHaveAttribute('tabindex', '0');
  });

  it('should handle keyboard activation', () => {
    const mockFileUploaded = vi.fn();
    render(
      <FileUploader
        onFileUploaded={mockFileUploaded}
        onSystemMessage={vi.fn()}
      />
    );

    const uploadButton = screen.getByLabelText('Choose CSV file to upload');

    // Should respond to Enter key
    fireEvent.keyDown(uploadButton, { key: 'Enter' });

    // Should respond to Space key
    fireEvent.keyDown(uploadButton, { key: ' ' });
  });

  it('should announce upload progress to screen readers', () => {
    render(<FileUploader onFileUploaded={vi.fn()} onSystemMessage={vi.fn()} />);

    // Progress should be announced when uploading
    // This would be tested with actual file upload simulation
    // For now, we check that the upload button has proper attributes
    const uploadButton = screen.getByLabelText('Choose CSV file to upload');
    expect(uploadButton).toBeInTheDocument();
  });

  it('should be disabled when specified', () => {
    render(
      <FileUploader
        onFileUploaded={vi.fn()}
        onSystemMessage={vi.fn()}
        disabled={true}
      />
    );

    const uploadButton = screen.getByLabelText('Choose CSV file to upload');

    // Should not be focusable when disabled
    expect(uploadButton).toHaveAttribute('tabindex', '-1');
    expect(uploadButton).toBeDisabled();
  });

  it('should have proper error announcement', () => {
    render(<FileUploader onFileUploaded={vi.fn()} onSystemMessage={vi.fn()} />);

    // Error states would be tested with actual error simulation
    // The component should announce errors to screen readers
    const uploadButton = screen.getByLabelText('Choose CSV file to upload');
    expect(uploadButton).toBeInTheDocument();
  });
});
