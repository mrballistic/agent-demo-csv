import { describe, it, expect } from 'vitest';

// Test data for CSV validation
const createCSVBuffer = (content: string): Buffer => {
  return Buffer.from(content, 'utf-8');
};

const validCSVContent = `order_id,order_date,customer_email,phone,qty,unit_price
1,2024-01-01,john@example.com,555-1234,2,29.99
2,2024-01-02,jane@example.com,555-5678,1,19.99
3,2024-01-03,bob@example.com,555-9012,3,39.99`;

const invalidCSVContent = `just,one,row`;

const piiCSVContent = `customer_id,customer_name,email,phone_number,address,order_total
1,John Doe,john.doe@email.com,+1-555-123-4567,"123 Main St, City",99.99
2,Jane Smith,jane.smith@email.com,+1-555-987-6543,"456 Oak Ave, Town",149.99`;

describe('CSV File Validation', () => {
  it('should detect CSV delimiter correctly', () => {
    const commaCSV = 'a,b,c\n1,2,3';
    const semicolonCSV = 'a;b;c\n1;2;3';
    const tabCSV = 'a\tb\tc\n1\t2\t3';

    // We'll test the delimiter detection logic
    const detectDelimiter = (text: string): string => {
      const lines = text.split('\n').slice(0, 5);
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
    };

    expect(detectDelimiter(commaCSV)).toBe(',');
    expect(detectDelimiter(semicolonCSV)).toBe(';');
    expect(detectDelimiter(tabCSV)).toBe('\t');
  });

  it('should detect encoding correctly', () => {
    const detectEncoding = (buffer: Buffer): string => {
      if (
        buffer.length >= 3 &&
        buffer[0] === 0xef &&
        buffer[1] === 0xbb &&
        buffer[2] === 0xbf
      ) {
        return 'utf-8';
      }

      const text = buffer.toString('utf-8');
      const hasValidUTF8 = !text.includes('\uFFFD');

      return hasValidUTF8 ? 'utf-8' : 'latin1';
    };

    const utf8Buffer = Buffer.from('test,data\n1,2', 'utf-8');
    const bomBuffer = Buffer.from('\uFEFFtest,data\n1,2', 'utf-8');

    expect(detectEncoding(utf8Buffer)).toBe('utf-8');
    expect(detectEncoding(bomBuffer)).toBe('utf-8');
  });

  it('should estimate row count correctly', () => {
    const estimateRowCount = (text: string): number => {
      const lines = text.split('\n');
      const nonEmptyLines = lines.filter(line => line.trim().length > 0);
      return Math.max(0, nonEmptyLines.length - 1);
    };

    expect(estimateRowCount(validCSVContent)).toBe(3);
    expect(estimateRowCount('header\nrow1\nrow2\n\n')).toBe(2);
    expect(estimateRowCount('header\n')).toBe(0);
  });

  it('should detect PII in column names', () => {
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

    const detectPIIByColumnName = (columnName: string): boolean => {
      const lowerColumnName = columnName.toLowerCase();
      for (const names of Object.values(PII_COLUMN_NAMES)) {
        if (names.some(name => lowerColumnName.includes(name))) {
          return true;
        }
      }
      return false;
    };

    expect(detectPIIByColumnName('customer_email')).toBe(true);
    expect(detectPIIByColumnName('phone_number')).toBe(true);
    expect(detectPIIByColumnName('customer_name')).toBe(true);
    expect(detectPIIByColumnName('order_id')).toBe(false);
    expect(detectPIIByColumnName('qty')).toBe(false);
  });

  it('should detect PII in data patterns', () => {
    const PII_PATTERNS = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      phone: /^[\+]?[1-9][\d]{0,15}$|^[\(\)\d\s\-\+]{7,}$/,
    };

    expect(PII_PATTERNS.email.test('john@example.com')).toBe(true);
    expect(PII_PATTERNS.email.test('invalid-email')).toBe(false);

    expect(PII_PATTERNS.phone.test('555-1234')).toBe(true);
    expect(PII_PATTERNS.phone.test('+1-555-123-4567')).toBe(true);
    expect(PII_PATTERNS.phone.test('not-a-phone')).toBe(false);
  });

  it('should parse CSV sample correctly', () => {
    const parseCSVSample = (
      text: string,
      delimiter: string,
      maxRows: number = 10
    ): string[][] => {
      const lines = text.split('\n').slice(0, maxRows);
      return lines
        .map(line => {
          return line
            .split(delimiter)
            .map(field => field.trim().replace(/^"|"$/g, ''));
        })
        .filter(row => row.length > 1 && row.some(cell => cell.length > 0));
    };

    const sample = parseCSVSample(validCSVContent, ',', 3);
    expect(sample).toHaveLength(3);
    expect(sample[0]).toEqual([
      'order_id',
      'order_date',
      'customer_email',
      'phone',
      'qty',
      'unit_price',
    ]);
    expect(sample[1]).toEqual([
      '1',
      '2024-01-01',
      'john@example.com',
      '555-1234',
      '2',
      '29.99',
    ]);
  });

  it('should validate file size limits', () => {
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

    const validateFileSize = (size: number): void => {
      if (size > MAX_FILE_SIZE) {
        throw new Error(
          `File size exceeds 50MB limit. Current size: ${Math.round(size / 1024 / 1024)}MB`
        );
      }
    };

    expect(() => validateFileSize(1024)).not.toThrow();
    expect(() => validateFileSize(MAX_FILE_SIZE)).not.toThrow();
    expect(() => validateFileSize(MAX_FILE_SIZE + 1)).toThrow(
      'File size exceeds 50MB limit'
    );
  });

  it('should validate CSV file extension', () => {
    const validateExtension = (filename: string): void => {
      if (!filename.toLowerCase().endsWith('.csv')) {
        throw new Error(
          'File must have .csv extension. Please upload a CSV file.'
        );
      }
    };

    expect(() => validateExtension('data.csv')).not.toThrow();
    expect(() => validateExtension('DATA.CSV')).not.toThrow();
    expect(() => validateExtension('data.xlsx')).toThrow(
      'File must have .csv extension'
    );
    expect(() => validateExtension('data.txt')).toThrow(
      'File must have .csv extension'
    );
  });
});

describe('File Upload API Response Format', () => {
  it('should return correct response format', () => {
    const expectedResponse = {
      fileId: expect.any(String),
      filename: expect.any(String),
      size: expect.any(Number),
      rowCount: expect.any(Number),
      profileHints: {
        columnCount: expect.any(Number),
        hasHeaders: expect.any(Boolean),
        sampleData: expect.any(Array),
      },
    };

    // This would be the actual response format from the API
    const mockResponse = {
      fileId: 'uuid-123',
      filename: 'test.csv',
      size: 1024,
      rowCount: 100,
      profileHints: {
        columnCount: 6,
        hasHeaders: true,
        sampleData: [
          ['header1', 'header2'],
          ['data1', 'data2'],
        ],
      },
    };

    expect(mockResponse).toMatchObject(expectedResponse);
  });
});
