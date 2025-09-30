/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import FileUploader from '../FileUploader';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create a test theme
const theme = createTheme();

// Wrapper component for tests
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

// Mock file for testing
const createMockFile = (name: string, size: number, type: string) => {
  const file = new File(['test content'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('FileUploader Component', () => {
  const mockOnFileUploaded = vi.fn();
  const mockOnSystemMessage = vi.fn();

  const defaultProps = {
    onFileUploaded: mockOnFileUploaded,
    onSystemMessage: mockOnSystemMessage,
  };

  const mockUploadResponse = {
    fileId: 'test-file-id',
    filename: 'test.csv',
    size: 1024,
    rowCount: 100,
    profileHints: {
      columnCount: 4,
      hasHeaders: true,
      sampleData: [['col1', 'col2', 'col3', 'col4']],
    },
  };

  const mockProfileResponse = {
    success: true,
    data: {
      profile: {
        id: 'profile-123',
        metadata: {
          filename: 'test.csv',
          size: 1024,
          rowCount: 100,
          columnCount: 4,
          processingTime: 5,
        },
        schema: {
          columns: [
            {
              name: 'column1',
              type: 'text',
              unique: false,
              nullable: false,
              qualityFlags: [],
              sampleValues: ['value1', 'value2'],
            },
            {
              name: 'column2',
              type: 'numeric',
              unique: true,
              nullable: false,
              qualityFlags: [],
              sampleValues: ['1', '2'],
              statistics: { min: 1, max: 2, mean: 1.5 },
            },
          ],
        },
        quality: {
          overall: 95,
          dimensions: {
            completeness: 100,
            consistency: 90,
            accuracy: 95,
            uniqueness: 90,
            validity: 95,
          },
          issues: [],
        },
        insights: {
          keyFindings: [
            'Dataset has good quality',
            'No missing values detected',
          ],
          recommendations: ['Consider adding more data validation'],
          suggestedQueries: ['What is the average value?'],
        },
        security: {
          piiColumns: [],
          riskLevel: 'low',
          recommendations: [],
        },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render upload interface by default', () => {
      render(
        <TestWrapper>
          <FileUploader {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByText('Upload Data')).toBeInTheDocument();
      expect(
        screen.getByText('Drag and drop your CSV file here')
      ).toBeInTheDocument();
      expect(screen.getByText('Choose File')).toBeInTheDocument();
    });

    it('should show sample data section when enabled', () => {
      render(
        <TestWrapper>
          <FileUploader {...defaultProps} showSampleData={true} />
        </TestWrapper>
      );

      expect(screen.getByText('Try sample data instantly')).toBeInTheDocument();
      expect(screen.getByText('Comprehensive Sales Data')).toBeInTheDocument();
    });

    it('should hide sample data section when disabled', () => {
      render(
        <TestWrapper>
          <FileUploader {...defaultProps} showSampleData={false} />
        </TestWrapper>
      );

      expect(
        screen.queryByText('Try sample data instantly')
      ).not.toBeInTheDocument();
    });

    it('should be disabled when disabled prop is true', () => {
      render(
        <TestWrapper>
          <FileUploader {...defaultProps} disabled={true} />
        </TestWrapper>
      );

      const chooseFileButton = screen.getByText('Choose File');
      expect(chooseFileButton).toBeDisabled();
    });
  });

  describe('File Upload Process', () => {
    it('should call onFileUploaded callback on successful upload', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUploadResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockProfileResponse),
        });

      render(
        <TestWrapper>
          <FileUploader {...defaultProps} />
        </TestWrapper>
      );

      const fileInput = screen.getByLabelText('Choose CSV file');
      const validFile = createMockFile('test.csv', 1024, 'text/csv');

      await userEvent.upload(fileInput, validFile);

      await waitFor(() => {
        expect(mockOnFileUploaded).toHaveBeenCalledWith(mockUploadResponse);
      });
    });

    it('should display profile data after successful analysis', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUploadResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockProfileResponse),
        });

      render(
        <TestWrapper>
          <FileUploader {...defaultProps} />
        </TestWrapper>
      );

      const fileInput = screen.getByLabelText('Choose CSV file');
      const validFile = createMockFile('test.csv', 1024, 'text/csv');

      await userEvent.upload(fileInput, validFile);

      await waitFor(() => {
        expect(screen.getByText('Data Profile Analysis')).toBeInTheDocument();
      });

      // Check overview data
      expect(screen.getByText('Dataset Overview')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument(); // Row count
      expect(screen.getByText('4')).toBeInTheDocument(); // Column count

      // Check quality score
      expect(screen.getByText('Data Quality Score')).toBeInTheDocument();
      expect(screen.getByText('95')).toBeInTheDocument(); // Overall score

      // Check column analysis
      expect(screen.getByText('Column Analysis')).toBeInTheDocument();
      expect(screen.getByText('column1')).toBeInTheDocument();
      expect(screen.getByText('column2')).toBeInTheDocument();

      // Check insights
      expect(
        screen.getByText('Key Insights & Recommendations')
      ).toBeInTheDocument();
      expect(screen.getByText('Dataset has good quality')).toBeInTheDocument();
    });

    it('should handle upload errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Upload failed'));

      render(
        <TestWrapper>
          <FileUploader {...defaultProps} />
        </TestWrapper>
      );

      const fileInput = screen.getByLabelText('Choose CSV file');
      const validFile = createMockFile('test.csv', 1024, 'text/csv');

      await userEvent.upload(fileInput, validFile);

      await waitFor(() => {
        expect(screen.getByText('Upload failed')).toBeInTheDocument();
      });

      expect(mockOnFileUploaded).not.toHaveBeenCalled();
    });

    it('should display PII warning when sensitive data is detected', async () => {
      const profileWithPII = {
        ...mockProfileResponse,
        data: {
          profile: {
            ...mockProfileResponse.data.profile,
            security: {
              piiColumns: ['email', 'phone'],
              riskLevel: 'medium',
              recommendations: ['Consider data masking'],
            },
          },
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUploadResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(profileWithPII),
        });

      render(
        <TestWrapper>
          <FileUploader {...defaultProps} />
        </TestWrapper>
      );

      const fileInput = screen.getByLabelText('Choose CSV file');
      const validFile = createMockFile('test.csv', 1024, 'text/csv');

      await userEvent.upload(fileInput, validFile);

      await waitFor(() => {
        expect(
          screen.getByText('Privacy and Security Notice')
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText(
          /Detected 2 column\(s\) with potentially sensitive data/
        )
      ).toBeInTheDocument();
      expect(screen.getByText('email, phone')).toBeInTheDocument();
      expect(screen.getByText('medium')).toBeInTheDocument();
    });
  });
});
