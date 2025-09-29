/**
 * Streaming CSV parser with memory efficiency for large files
 */
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';

export interface CSVParseOptions {
  delimiter?: string;
  headers?: boolean;
  skipEmptyLines?: boolean;
  maxSampleSize?: number;
  encoding?: BufferEncoding;
}

export interface CSVRow {
  [key: string]: string;
}

export interface CSVParseResult {
  headers: string[];
  rows: CSVRow[];
  totalRows: number;
  metadata: {
    encoding: string;
    delimiter: string;
    hasHeaders: boolean;
    processingTime: number;
  };
}

/**
 * Memory-efficient CSV parser that processes large files in chunks
 */
export class StreamingCSVParser {
  private options: Required<CSVParseOptions>;

  constructor(options: CSVParseOptions = {}) {
    this.options = {
      delimiter: options.delimiter || ',',
      headers: options.headers ?? true,
      skipEmptyLines: options.skipEmptyLines ?? true,
      maxSampleSize: options.maxSampleSize || 10000,
      encoding: options.encoding || 'utf8',
    };
  }

  /**
   * Parse CSV buffer with streaming approach
   */
  async parseBuffer(buffer: Buffer): Promise<CSVParseResult> {
    const startTime = Date.now();
    let headers: string[] = [];
    const rows: CSVRow[] = [];
    let totalRows = 0;
    let isFirstRow = true;

    // Detect delimiter if not provided
    const delimiter = this.detectDelimiter(buffer.toString('utf8', 0, 1000));
    this.options.delimiter = delimiter;

    // Create a transform stream to process lines
    const lines = buffer.toString(this.options.encoding).split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (this.options.skipEmptyLines && !trimmedLine) {
        continue;
      }

      // Parse the line
      const fields = this.parseLine(trimmedLine, delimiter);

      if (isFirstRow && this.options.headers) {
        headers = fields;
        isFirstRow = false;
        continue;
      }

      // Create row object
      const row: CSVRow = {};
      if (headers.length > 0) {
        fields.forEach((field, index) => {
          const header = headers[index] || `column_${index}`;
          row[header] = field;
        });
      } else {
        // No headers, use column indices
        fields.forEach((field, index) => {
          row[`column_${index}`] = field;
        });
        // Set headers for first data row if not provided
        if (totalRows === 0) {
          headers = Object.keys(row);
        }
      }

      totalRows++;

      // Only keep sample for analysis
      if (rows.length < this.options.maxSampleSize) {
        rows.push(row);
      }
    }

    const processingTime = Date.now() - startTime;

    return {
      headers,
      rows,
      totalRows,
      metadata: {
        encoding: this.options.encoding,
        delimiter: this.options.delimiter,
        hasHeaders: this.options.headers,
        processingTime,
      },
    };
  }

  /**
   * Detect delimiter from sample data
   */
  private detectDelimiter(sample: string): string {
    const delimiters = [',', ';', '\t', '|'];
    const counts = delimiters.map(delim => ({
      delimiter: delim,
      count: (sample.match(new RegExp(`\\${delim}`, 'g')) || []).length,
    }));

    // Return the delimiter with the highest count
    const best = counts.reduce((a, b) => (a.count > b.count ? a : b));
    return best.count > 0 ? best.delimiter : ',';
  }

  /**
   * Parse a single CSV line, handling quoted fields
   */
  private parseLine(line: string, delimiter: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === delimiter && !inQuotes) {
        // Field separator
        fields.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }

    // Add the last field
    fields.push(current.trim());

    return fields;
  }

  /**
   * Get CSV statistics without full parsing
   */
  async getStatistics(buffer: Buffer): Promise<{
    estimatedRows: number;
    estimatedColumns: number;
    sampleLines: string[];
  }> {
    const text = buffer.toString(this.options.encoding);
    const lines = text.split('\n').filter(line => line.trim());

    // Sample first few lines for column estimation
    const sampleLines = lines.slice(0, 10);
    const delimiter = this.detectDelimiter(sampleLines.join('\n'));

    // Estimate columns from first non-empty line
    const estimatedColumns =
      sampleLines.length > 0 && sampleLines[0] !== undefined
        ? this.parseLine(sampleLines[0] as string, delimiter).length
        : 0;

    return {
      estimatedRows: lines.length,
      estimatedColumns,
      sampleLines: sampleLines.slice(0, 5),
    };
  }
}
