/**
 * Core application types for the AI Data Analyst Demo
 * @fileoverview Shared TypeScript interfaces and types used throughout the application
 */

/**
 * Represents a message in the chat conversation
 */
export interface ChatMessage {
  /** Unique identifier for the message */
  id: string;
  /** Role of the message sender */
  role: 'user' | 'assistant' | 'system';
  /** Text content of the message */
  content: string;
  /** Optional analysis results attached to the message */
  artifacts?: AnalysisResult[];
  /** When the message was created */
  timestamp: Date;
}

/**
 * Result from a data analysis operation
 */
export interface AnalysisResult {
  /** Unique identifier for the analysis */
  id: string;
  /** Type of analysis performed */
  type: 'profile' | 'trend' | 'top-sku' | 'channel-mix' | 'outlier';
  /** Human-readable insight from the analysis */
  insight: string;
  /** Optional URL to generated chart */
  chartUrl?: string;
  /** Optional URL to processed data */
  dataUrl?: string;
  /** When the analysis was completed */
  timestamp: Date;
}

/**
 * Result returned after successful file upload
 */
export interface FileUploadResult {
  /** Unique identifier for the uploaded file */
  fileId: string;
  /** Original filename */
  filename: string;
  /** File size in bytes */
  size: number;
  /** Number of data rows detected */
  rowCount: number;
  /** Basic profiling hints from initial analysis */
  profileHints: {
    /** Number of columns detected */
    columnCount: number;
    /** Whether file appears to have headers */
    hasHeaders: boolean;
    /** Sample of first few rows */
    sampleData: string[][];
  };
}

/**
 * PII (Personally Identifiable Information) detection flags
 * Maps column names to their PII detection results
 */
export interface PIIFlags {
  [columnName: string]: {
    /** Whether PII was detected in this column */
    isPII: boolean;
    /** Confidence score (0-1) for PII detection */
    confidence: number;
    /** Type of PII detected */
    type: 'email' | 'phone' | 'name' | 'address' | 'other';
  };
}

export interface FileMetadata {
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

export interface DataProfile {
  rowCount: number;
  columnCount: number;
  columns: ColumnInfo[];
  sampleRows: Record<string, any>[];
  missingData: Record<string, number>;
}

export interface ColumnInfo {
  name: string;
  type: string;
  missingPercent: number;
  isPII?: boolean;
}

export interface ArtifactItem {
  id: string;
  name: string;
  type: 'file' | 'image' | 'data';
  size?: number;
  downloadUrl: string;
  createdAt?: number;
  mimeType?: string;
}
