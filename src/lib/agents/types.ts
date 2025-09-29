// Shared type definitions for the semantic layer agent system

export enum AgentType {
  PROFILING = 'profiling',
  QUERY_PLANNING = 'query-planning',
  SECURITY = 'security',
  CHART = 'chart',
  CONVERSATION = 'conversation',
}

export enum MessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  ERROR = 'error',
  NOTIFICATION = 'notification',
  HEARTBEAT = 'heartbeat',
}

export interface AgentMessage {
  id: string;
  from: AgentType;
  to: AgentType | 'orchestrator';
  type: MessageType;
  payload: any;
  timestamp: Date;
  correlationId: string;
}

export interface AgentExecutionContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
  startTime: Date;
  timeout: number;
}

export interface AgentResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  metrics: {
    executionTime: number;
    memoryUsed: number;
    cacheHit: boolean;
  };
  warnings?: string[];
}

// Data structures from design document

export interface DataProfile {
  id: string;
  version: number;
  createdAt: Date;
  expiresAt: Date;

  metadata: FileMetadata;
  schema: SchemaProfile;
  quality: QualityMetrics;
  security: SecurityProfile;
  insights: DataInsights;

  // Performance optimizations
  sampleData: any[];
  aggregations: PrecomputedAggregations;
  indexes: DataIndexes;
}

export interface FileMetadata {
  filename: string;
  size: number;
  encoding: string;
  delimiter: string;
  rowCount: number;
  columnCount: number;
  processingTime: number;
  checksum: string;
}

export interface SchemaProfile {
  columns: ColumnProfile[];
  primaryKey?: string;
  foreignKeys: string[];
  relationships: DataRelationship[];
}

export interface ColumnProfile {
  name: string;
  type: 'numeric' | 'categorical' | 'datetime' | 'text' | 'boolean';
  nullable: boolean;
  unique: boolean;

  // Statistics based on type
  statistics: NumericStats | CategoricalStats | DateTimeStats | TextStats;

  // Quality metrics
  nullCount: number;
  nullPercentage: number;
  uniqueCount: number;
  duplicateCount: number;

  // Sample data (anonymized)
  sampleValues: any[];

  // Data quality flags
  qualityFlags: QualityFlag[];
}

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  mode: number[];
  stddev: number;
  variance: number;
  percentiles: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
  histogram: HistogramBin[];
  outliers: number[];
}

export interface CategoricalStats {
  uniqueCount: number;
  topValues: Array<{ value: string; count: number; percentage: number }>;
  entropy: number;
  mode: string[];
  distribution: Record<string, number>;
}

export interface DateTimeStats {
  min: Date;
  max: Date;
  range: { start: Date; end: Date };
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'irregular';
  trend: 'increasing' | 'decreasing' | 'stable' | 'seasonal';
  seasonality?: SeasonalityPattern;
  gaps: DateGap[];
}

export interface TextStats {
  avgLength: number;
  minLength: number;
  maxLength: number;
  commonWords: Array<{ word: string; count: number }>;
  encoding: string;
  languages: string[];
  patterns: RegexPattern[];
}

export interface QualityFlag {
  type:
    | 'missing_values'
    | 'duplicates'
    | 'outliers'
    | 'inconsistent_format'
    | 'encoding_issues';
  severity: 'low' | 'medium' | 'high' | 'critical';
  count: number;
  percentage: number;
  description: string;
  suggestion: string;
}

export interface QualityMetrics {
  overall: number; // 0-100 score
  dimensions: {
    completeness: number; // % non-null values
    consistency: number; // Data format consistency
    accuracy: number; // Estimated accuracy score
    uniqueness: number; // Duplicate detection
    validity: number; // Constraint compliance
  };
  issues: QualityIssue[];
}

export interface QualityIssue {
  column: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  count: number;
  description: string;
  examples: string[];
}

export interface SecurityProfile {
  piiColumns: PIIColumn[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: SecurityRecommendation[];
  complianceFlags: ComplianceFlag[];
  hasRedaction: boolean;
}

export interface PIIColumn {
  name: string;
  type:
    | 'email'
    | 'phone'
    | 'name'
    | 'address'
    | 'ssn'
    | 'credit_card'
    | 'ip_address'
    | 'other';
  confidence: number;
  detectionMethod: 'pattern' | 'column_name' | 'ml_classifier' | 'manual';
  sampleMatches: string[];
  recommendations: string[];
  isRedacted: boolean;
}

export interface SecurityRecommendation {
  type: 'redaction' | 'encryption' | 'access_control' | 'audit_logging';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  implementation: string;
}

export interface ComplianceFlag {
  regulation: 'GDPR' | 'CCPA' | 'HIPAA' | 'SOX' | 'PCI_DSS';
  requirement: string;
  status: 'compliant' | 'non_compliant' | 'unknown';
  action_required: string;
}

export interface DataInsights {
  keyFindings: string[];
  trends: TrendInsight[];
  anomalies: AnomalyInsight[];
  recommendations: AnalysisRecommendation[];
  suggestedQueries: string[];
}

export interface TrendInsight {
  column: string;
  direction: 'increasing' | 'decreasing' | 'stable';
  confidence: number;
  description: string;
  timeframe?: string;
}

export interface AnomalyInsight {
  column: string;
  type: 'outlier' | 'missing_pattern' | 'unusual_distribution';
  count: number;
  description: string;
  examples: any[];
}

export interface AnalysisRecommendation {
  type: 'visualization' | 'analysis' | 'data_cleaning' | 'exploration';
  title: string;
  description: string;
  priority: number;
  estimatedValue: 'high' | 'medium' | 'low';
}

export interface PrecomputedAggregations {
  numeric: Record<string, NumericAggregation>;
  categorical: Record<string, CategoricalAggregation>;
  temporal: Record<string, TemporalAggregation>;
}

export interface NumericAggregation {
  sum: number;
  avg: number;
  min: number;
  max: number;
  stddev: number;
  percentiles: number[];
  histogram: HistogramBin[];
}

export interface CategoricalAggregation {
  valueeCounts: Record<string, number>;
  topValues: Array<{ value: string; count: number }>;
  uniqueCount: number;
  entropy: number;
}

export interface TemporalAggregation {
  range: { start: Date; end: Date };
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  trend: 'increasing' | 'decreasing' | 'stable' | 'seasonal';
  seasonality?: SeasonalityPattern;
}

export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface SeasonalityPattern {
  type: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  strength: number;
  peaks: number[];
  description: string;
}

export interface DateGap {
  start: Date;
  end: Date;
  duration: number;
  reason?: string;
}

export interface RegexPattern {
  pattern: string;
  matches: number;
  confidence: number;
  description: string;
}

export interface DataRelationship {
  type: 'foreign_key' | 'correlation' | 'dependency';
  columns: string[];
  strength: number;
  description: string;
}

export interface DataIndexes {
  primaryIndex?: string;
  secondaryIndexes: string[];
  compositeIndexes: string[][];
  fullText: string[];
}

// Query Planning Types

export interface QueryIntent {
  type:
    | 'profile'
    | 'trend'
    | 'comparison'
    | 'aggregation'
    | 'filter'
    | 'custom';
  entities: {
    measures: string[]; // Revenue, quantity, etc.
    dimensions: string[]; // Time, category, region, etc.
    filters: FilterCondition[];
    timeframe?: TimeRange;
  };
  operation: {
    groupBy: string[];
    aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median' | 'mode';
    sort: { column: string; direction: 'asc' | 'desc' }[];
    limit?: number;
  };
  visualization?: {
    type: 'bar' | 'line' | 'pie' | 'scatter' | 'table' | 'heatmap';
    x_axis?: string;
    y_axis?: string;
    color?: string;
  };
  confidence: number;
}

export interface FilterCondition {
  column: string;
  operator:
    | 'eq'
    | 'ne'
    | 'gt'
    | 'lt'
    | 'gte'
    | 'lte'
    | 'in'
    | 'not_in'
    | 'contains'
    | 'starts_with'
    | 'ends_with';
  value: any;
  dataType: string;
}

export interface TimeRange {
  start: Date;
  end: Date;
  granularity: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
}

export interface ExecutionPlan {
  id: string;
  steps: PlanStep[];
  estimatedTime: number;
  estimatedCost: number;
  cacheKey?: string;
  fallbackToLLM: boolean;
  optimizations: string[];
}

export interface PlanStep {
  id: string;
  type:
    | 'load'
    | 'filter'
    | 'aggregate'
    | 'sort'
    | 'limit'
    | 'transform'
    | 'cache';
  operation: string;
  params: Record<string, any>;
  estimatedTime: number;
  dependsOn: string[];
}

// Chart Generation Types

export interface ChartConfig {
  type: ChartType;
  title: string;
  xAxis: AxisConfig;
  yAxis: AxisConfig;
  data: DataPoint[];
  styling: ChartStyling;
  accessibility: AccessibilityConfig;
}

export type ChartType =
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'scatter'
  | 'bubble'
  | 'heatmap'
  | 'table';

export interface AxisConfig {
  label: string;
  type: 'numeric' | 'categorical' | 'datetime';
  scale: 'linear' | 'log' | 'ordinal' | 'time';
  format?: string;
  range?: [number, number];
}

export interface DataPoint {
  x: any;
  y: any;
  label?: string;
  color?: string;
  size?: number;
  metadata?: Record<string, any>;
}

export interface ChartStyling {
  theme: 'light' | 'dark' | 'auto';
  colors: string[];
  fonts: FontConfig;
  dimensions: { width: number; height: number };
  margins: { top: number; right: number; bottom: number; left: number };
}

export interface FontConfig {
  title: { family: string; size: number; weight: number };
  labels: { family: string; size: number; weight: number };
  legend: { family: string; size: number; weight: number };
}

export interface AccessibilityConfig {
  altText: string;
  ariaLabel: string;
  colorBlindSafe: boolean;
  highContrast: boolean;
  keyboardNavigable: boolean;
}

// Analysis Result Types

export interface AnalysisResult {
  id: string;
  query: string;
  intent: QueryIntent;
  executionPlan: ExecutionPlan;
  data: any[];
  insights: GeneratedInsight[];
  chart?: ChartOutput;
  metadata: {
    executionTime: number;
    dataPoints: number;
    cacheHit: boolean;
    agentPath: AgentType[];
  };
  suggestions: string[];
}

export interface GeneratedInsight {
  type: 'summary' | 'trend' | 'comparison' | 'anomaly' | 'recommendation';
  title: string;
  description: string;
  confidence: number;
  data: any;
}

export interface ChartOutput {
  svg: string;
  config: ChartConfig;
  accessibility: {
    altText: string;
    description: string;
    dataTable: string;
  };
}

// Error Types

export class AgentError extends Error {
  constructor(
    message: string,
    public agentType: AgentType,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class AgentTimeoutError extends AgentError {
  constructor(agentType: AgentType, timeout: number) {
    super(
      `Agent ${agentType} timed out after ${timeout}ms`,
      agentType,
      'TIMEOUT'
    );
  }
}

export class AgentValidationError extends AgentError {
  constructor(agentType: AgentType, message: string, details?: any) {
    super(message, agentType, 'VALIDATION', details);
  }
}

// Resource Management Types

export interface ResourceStatus {
  memory: {
    used: number;
    available: number;
    percentage: number;
  };
  cpu: {
    usage: number;
    cores: number;
  };
  agents: {
    active: number;
    queued: number;
    failed: number;
  };
}

export interface AgentMetrics {
  executionTime: number[];
  throughput: number;
  errorRate: number;
  cacheHitRate: number;
  memoryUsage: number;
  cpuUsage: number;
  queueDepth: number;
}
