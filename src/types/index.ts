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
  profile: DataProfile;
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
