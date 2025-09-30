/**
 * @fileoverview File Upload API - Secure CSV file upload with PII detection
 *
 * Handles CSV file uploads with comprehensive validation, PII detection,
 * and metadata extraction. Provides secure file storage and profiling hints.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { fileStore } from '@/lib/file-store';
import {
  AppError,
  ErrorFactory,
  ErrorType,
  classifyError,
  createErrorTelemetry,
} from '@/lib/error-handler';
import { telemetryService, Telemetry } from '@/lib/telemetry';

// Set runtime to nodejs for file handling
export const runtime = 'nodejs';

// File validation schema
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * PII flags for columns with detected personally identifiable information
 */
interface PIIFlags {
  [columnName: string]: {
    isPII: boolean;
    confidence: number;
    type: 'email' | 'phone' | 'name' | 'address' | 'other';
  };
}

/**
 * Metadata extracted from uploaded CSV files
 */
interface FileMetadata {
  /** Unique identifier for the uploaded file */
  fileId: string;
  /** Original filename */
  filename: string;
  /** File size in bytes */
  size: number;
  /** SHA-256 checksum for integrity validation */
  checksum: string;
  /** Detected character encoding */
  encoding: string;
  /** CSV delimiter character */
  delimiter: string;
  /** Total number of data rows */
  rowCount: number;
  /** Number of rows used for sniffing/sampling */
  sniffRows: number;
  /** PII detection results per column */
  piiFlags: PIIFlags;
  /** Hints for data profiling */
  profileHints: {
    /** Number of columns detected */
    columnCount: number;
    /** Whether the file has header row */
    hasHeaders: boolean;
    /** Sample data for preview */
    sampleData: string[][];
  };
}

// PII detection patterns
const PII_PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^[\+]?[1-9][\d]{0,15}$|^[\(\)\d\s\-\+]{7,}$/,
  name: /^[a-zA-Z\s\-'\.]{2,50}$/,
  address: /\d+\s+[a-zA-Z\s,\-\.#]+/,
};

const PII_COLUMN_NAMES = {
  email: ['email', 'e-mail', 'mail', 'email_address', 'user_email'],
  phone: ['phone', 'telephone', 'mobile', 'cell', 'phone_number', 'tel'],
  name: [
    'name',
    'first_name',
    'last_name',
    'full_name',
    'customer_name',
    'user_name',
  ],
  address: [
    'address',
    'street',
    'location',
    'addr',
    'home_address',
    'billing_address',
  ],
};

function detectEncoding(buffer: Buffer): BufferEncoding {
  // Simple encoding detection - check for BOM and common patterns
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return 'utf-8';
  }

  // Check for common non-ASCII characters to detect encoding
  const text = buffer.toString('utf-8');
  const hasValidUTF8 = !text.includes('\uFFFD'); // No replacement characters

  return hasValidUTF8 ? 'utf-8' : 'latin1';
}

function detectDelimiter(text: string): string {
  const lines = text.split('\n').slice(0, 5); // Check first 5 lines
  const delimiters = [',', ';', '\t', '|'];

  let bestDelimiter = ',';
  let maxConsistency = 0;

  for (const delimiter of delimiters) {
    const counts = lines.map(
      line => (line.match(new RegExp(delimiter, 'g')) || []).length
    );
    const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
    const consistency = counts.filter(
      count => Math.abs(count - avgCount) <= 1
    ).length;

    if (consistency > maxConsistency && avgCount > 0) {
      maxConsistency = consistency;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

function parseCSVSample(
  text: string,
  delimiter: string,
  maxRows: number = 10
): string[][] {
  const lines = text.split('\n').slice(0, maxRows);
  return lines
    .map(line => {
      // Simple CSV parsing - doesn't handle quoted fields with delimiters
      return line
        .split(delimiter)
        .map(field => field.trim().replace(/^"|"$/g, ''));
    })
    .filter(row => row.length > 1 && row.some(cell => cell.length > 0));
}

function estimateRowCount(text: string): number {
  const lines = text.split('\n');
  const nonEmptyLines = lines.filter(line => line.trim().length > 0);
  return Math.max(0, nonEmptyLines.length - 1); // Subtract 1 for header
}

function detectPII(columns: string[], sampleData: string[][]): PIIFlags {
  const piiFlags: PIIFlags = {};

  columns.forEach((columnName, index) => {
    const lowerColumnName = columnName.toLowerCase();
    let piiType: keyof typeof PII_PATTERNS | null = null;
    let confidence = 0;

    // Check column name patterns
    for (const [type, names] of Object.entries(PII_COLUMN_NAMES)) {
      if (names.some(name => lowerColumnName.includes(name))) {
        piiType = type as keyof typeof PII_PATTERNS;
        confidence = 0.8;
        break;
      }
    }

    // Check sample data patterns
    if (sampleData.length > 1) {
      const columnValues = sampleData
        .slice(1)
        .map(row => row[index] || '')
        .filter(val => val.length > 0);

      if (columnValues.length > 0) {
        for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
          const matches = columnValues.filter(value =>
            pattern.test(value.trim())
          ).length;
          const matchRatio = matches / columnValues.length;

          if (matchRatio > 0.3) {
            // 30% threshold
            if (!piiType || matchRatio > confidence) {
              piiType = type as keyof typeof PII_PATTERNS;
              confidence = Math.max(confidence, matchRatio);
            }
          }
        }
      }
    }

    piiFlags[columnName] = {
      isPII: confidence > 0.3,
      confidence,
      type: piiType || 'other',
    };
  });

  return piiFlags;
}

function validateCSVFile(buffer: Buffer, filename: string): void {
  // Check file size
  if (buffer.length > MAX_FILE_SIZE) {
    throw ErrorFactory.fileTooLarge(buffer.length);
  }

  // Check file extension
  if (!filename.toLowerCase().endsWith('.csv')) {
    throw ErrorFactory.invalidFileFormat(filename);
  }

  // Basic content validation
  const encoding = detectEncoding(buffer);
  const text = buffer.toString(encoding);

  if (text.length === 0) {
    throw ErrorFactory.emptyFile();
  }

  // Check if it looks like CSV content
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new AppError(
      ErrorType.VALIDATION_ERROR,
      'File must contain at least a header row and one data row',
      {
        errorClass: 'insufficient_data_rows',
        suggestedAction: 'Please upload a CSV file with header and data rows',
        details: { lineCount: lines.length },
      }
    );
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let sessionId: string | undefined;
  let errorClass: string | undefined;

  try {
    // Extract request context for telemetry
    const userAgent = request.headers.get('user-agent') || undefined;
    const requestId =
      request.headers.get('x-request-id') || `req_${Date.now()}`;

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      const error = new AppError(
        ErrorType.VALIDATION_ERROR,
        'No file provided. Please select a CSV file to upload.',
        {
          errorClass: 'no_file_provided',
          suggestedAction: 'Select a CSV file and try again',
        }
      );

      telemetryService.logError(createErrorTelemetry(error, 'file_upload'), {
        userAgent,
        requestId,
        endpoint: '/api/files/upload',
      });

      return NextResponse.json(error.toErrorResponse(), { status: 400 });
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate file
    validateCSVFile(buffer, file.name);

    // Generate file metadata first to use consistent IDs
    const sessionId = crypto.randomUUID();
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const encoding = detectEncoding(buffer);
    const text = buffer.toString(encoding);
    const delimiter = detectDelimiter(text);
    const rowCount = estimateRowCount(text);
    const sniffRows = 5;

    // Parse sample data
    const sampleData = parseCSVSample(text, delimiter, sniffRows + 1); // +1 for header
    const columns = sampleData.length > 0 ? sampleData[0] : [];

    // Detect PII
    const piiFlags = detectPII(columns || [], sampleData);

    // Store file first to get the actual fileId
    const storedFile = await fileStore.storeFile(
      sessionId,
      file.name,
      buffer,
      file.type || 'text/csv'
    );

    const metadata: FileMetadata = {
      fileId: storedFile.id,
      filename: file.name,
      size: buffer.length,
      checksum,
      encoding,
      delimiter,
      rowCount,
      sniffRows,
      piiFlags,
      profileHints: {
        columnCount: columns?.length || 0,
        hasHeaders: (columns?.length || 0) > 0,
        sampleData: sampleData.slice(0, Math.min(3, sampleData.length)), // First 3 rows including header
      },
    };

    // Track successful file upload
    Telemetry.trackFileUpload(buffer.length, file.name, storedFile.id, true);

    // Store file and metadata (will be implemented in storage tasks)
    // TODO: Store file and metadata in file store for data profiling

    return NextResponse.json({
      fileId: storedFile.id,
      filename: metadata.filename,
      size: metadata.size,
      rowCount: metadata.rowCount,
      profileHints: metadata.profileHints,
    });
  } catch (error) {
    console.error('File upload error:', error);

    // Classify and handle the error
    const appError = error instanceof AppError ? error : classifyError(error);
    errorClass = appError.errorClass;

    // Log error telemetry
    telemetryService.logError(createErrorTelemetry(appError, 'file_upload'), {
      sessionId,
      userAgent: request.headers.get('user-agent') || undefined,
      requestId: request.headers.get('x-request-id') || `req_${Date.now()}`,
      endpoint: '/api/files/upload',
      stackTrace: error instanceof Error ? error.stack : undefined,
    });

    // Track failed file upload
    const filename = 'unknown';
    try {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      if (file) {
        Telemetry.trackFileUpload(
          file.size,
          file.name,
          'failed',
          false,
          errorClass
        );
      }
    } catch {
      // Ignore errors when trying to extract file info for telemetry
    }

    const statusCode = appError.type === ErrorType.VALIDATION_ERROR ? 400 : 500;
    return NextResponse.json(appError.toErrorResponse(), {
      status: statusCode,
    });
  }
}
