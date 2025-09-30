// Public API exports for the agent system

export type { Agent, AgentHealthStatus } from './base';

export { BaseAgent, createExecutionContext, retryExecution } from './base';

export {
  AgentOrchestrator,
  globalOrchestrator,
  getOrchestrator,
} from './orchestrator';

export type { UploadedFile } from './orchestrator';

export type {
  // Core types
  AgentMessage,
  AgentExecutionContext,
  AgentResult,
  ResourceStatus,

  // Data types
  DataProfile,
  FileMetadata,
  SchemaProfile,
  ColumnProfile,
  QualityMetrics,
  SecurityProfile,
  PIIColumn,
  DataInsights,

  // Query types
  QueryIntent,
  FilterCondition,
  TimeRange,
  ExecutionPlan,

  // Chart types
  ChartConfig,
  ChartOutput,

  // Analysis types
  AnalysisResult,
  GeneratedInsight,
} from './types';

export {
  AgentType,
  MessageType,
  AgentError,
  AgentTimeoutError,
  AgentValidationError,
} from './types';

export { DataProfilingAgent } from './profiling-agent';
export { QueryPlannerAgent } from './query-planner-agent';
export { SemanticExecutorAgent } from './semantic-executor-agent';
export { SecurityAgent } from './security-agent';
export { ChartAgent } from './chart-agent';

export type {
  QueryPlannerInput,
  QueryPlannerResult,
} from './query-planner-agent';
export type {
  SemanticExecutorInput,
  SemanticExecutorResult,
} from './semantic-executor-agent';
export type {
  SecurityAgentInput,
  SecurityAnalysisResult,
} from './security-agent';
export type { ChartAgentInput, ChartAgentResult } from './chart-agent';

// Chart utility exports
export type {
  ChartType,
  ChartRecommendation,
  DataCharacteristics,
  ChartContext,
} from './utils/chart-recommendation';
export type {
  ChartData,
  ChartDimensions,
  ChartStyling,
  AccessibilityFeatures,
} from './utils/svg-generator';
