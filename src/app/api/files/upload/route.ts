import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';

// Set runtime to nodejs for file handling
export const runtime = 'nodejs';

// File validation schema
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

interface PIIFlags {
  [columnName: string]: {
    isPII: boolean;
    confidence: number;
    type: 'email' | 'phone' | 'name' | 'address' | 'other';
  };
}

interface FileMetadata {
  fileId: string;
  filename: string;
  size: number;
  checksum: string;
  encoding: string;
  delimiter: string;
  rowCount: number;
  sniffRows: number;
  piiFlags: PIIFlags;
  profileHints: {
    columnCount: number;
    hasHeaders: boolean;
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

function detectEncoding(buffer: Buffer): string {
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
    throw new Error(
      `File size exceeds 50MB limit. Current size: ${Math.round(buffer.length / 1024 / 1024)}MB`
    );
  }

  // Check file extension
  if (!filename.toLowerCase().endsWith('.csv')) {
    throw new Error('File must have .csv extension. Please upload a CSV file.');
  }

  // Basic content validation
  const encoding = detectEncoding(buffer);
  const text = buffer.toString(encoding);

  if (text.length === 0) {
    throw new Error(
      'File appears to be empty. Please upload a valid CSV file.'
    );
  }

  // Check if it looks like CSV content
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error(
      'File must contain at least a header row and one data row.'
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided. Please select a CSV file to upload.' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate file
    validateCSVFile(buffer, file.name);

    // Generate file metadata
    const fileId = crypto.randomUUID();
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
    const piiFlags = detectPII(columns, sampleData);

    const metadata: FileMetadata = {
      fileId,
      filename: file.name,
      size: buffer.length,
      checksum,
      encoding,
      delimiter,
      rowCount,
      sniffRows,
      piiFlags,
      profileHints: {
        columnCount: columns.length,
        hasHeaders: columns.length > 0,
        sampleData: sampleData.slice(0, Math.min(3, sampleData.length)), // First 3 rows including header
      },
    };

    // TODO: Store file and metadata (will be implemented in storage tasks)
    // For now, we'll just return the metadata

    return NextResponse.json({
      fileId: metadata.fileId,
      filename: metadata.filename,
      size: metadata.size,
      rowCount: metadata.rowCount,
      profileHints: metadata.profileHints,
    });
  } catch (error) {
    console.error('File upload error:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred while processing the file.' },
      { status: 500 }
    );
  }
}
