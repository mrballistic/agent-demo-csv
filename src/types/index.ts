// Core application types

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  artifacts?: AnalysisResult[];
  timestamp: Date;
}

export interface AnalysisResult {
  id: string;
  type: 'profile' | 'trend' | 'top-sku' | 'channel-mix' | 'outlier';
  insight: string;
  chartUrl?: string;
  dataUrl?: string;
  timestamp: Date;
}

export interface FileUploadResult {
  fileId: string;
  filename: string;
  size: number;
  rowCount: number;
  profileHints: {
    columnCount: number;
    hasHeaders: boolean;
    sampleData: string[][];
  };
}

export interface PIIFlags {
  [columnName: string]: {
    isPII: boolean;
    confidence: number;
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
  kind: 'file' | 'image' | 'data';
  size?: number;
  downloadUrl: string;
}
