/**
 * Query Intent Types and Interfaces
 *
 * Defines the structure for query intent recognition and classification
 */

// Query types that can be handled by the semantic layer
export enum QueryType {
  PROFILE = 'profile', // "What's in this data?" - dataset overview
  TREND = 'trend', // "Show trends over time" - time series analysis
  COMPARISON = 'comparison', // "Compare X vs Y" - comparative analysis
  AGGREGATION = 'aggregation', // "Sum/average/count of X" - statistical operations
  FILTER = 'filter', // "Show only X where Y" - data filtering
  RELATIONSHIP = 'relationship', // "Correlation between X and Y" - relationships
  DISTRIBUTION = 'distribution', // "Distribution of X" - data distribution
  RANKING = 'ranking', // "Top/bottom N" - ranking queries
  UNKNOWN = 'unknown', // Complex queries requiring LLM
}

// Entities extracted from user queries
export interface QueryEntity {
  type: 'measure' | 'dimension' | 'filter' | 'time' | 'limit';
  value: string;
  column?: string | undefined;
  operator?:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'in'
    | undefined;
  confidence: number; // 0-1 confidence score
}

// Parsed query intent
export interface QueryIntent {
  type: QueryType;
  confidence: number;
  entities: QueryEntity[];
  originalQuery: string;

  // Semantic interpretation
  measures: string[]; // Numeric columns to analyze
  dimensions: string[]; // Categorical columns to group by
  filters: QueryEntity[]; // Filter conditions
  timeColumn?: string | undefined; // Time-based column for trends
  limit?: number | undefined; // Result limit for rankings

  // Execution hints
  requiresLLM: boolean; // Whether this needs LLM processing
  canUseCache: boolean; // Whether results can be cached
  estimatedCost: number; // Relative execution cost (1-10)
}

// Query patterns for intent matching
export interface QueryPattern {
  pattern: RegExp;
  type: QueryType;
  confidence: number;
  entityExtractors: {
    measures?: RegExp[];
    dimensions?: RegExp[];
    filters?: RegExp[];
    timeColumns?: RegExp[];
    limits?: RegExp[];
  };
  examples: string[];
}

// Intent classification result
export interface IntentClassificationResult {
  intent: QueryIntent;
  alternatives: Array<{
    type: QueryType;
    confidence: number;
    reason: string;
  }>;
  processingTime: number;
}
