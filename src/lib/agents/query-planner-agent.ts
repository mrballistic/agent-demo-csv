import { BaseAgent } from './base';
import {
  AgentType,
  QueryIntent,
  ExecutionPlan,
  PlanStep,
  DataProfile,
  FilterCondition,
  TimeRange,
  AgentResult,
  AgentExecutionContext,
} from './types';
import { IntentClassifier } from './utils/intent-classifier';
import { QueryType, IntentClassificationResult } from './utils/query-types';

export interface QueryPlannerInput {
  query: string;
  profile: DataProfile;
}

export interface QueryPlannerResult {
  queryIntent: QueryIntent;
  executionPlan: ExecutionPlan;
}

/**
 * Query Planning Agent
 *
 * Analyzes user queries to generate optimized execution plans for semantic query processing.
 * Uses intent classification to determine if queries can be handled semantically or need LLM fallback.
 */
export class QueryPlannerAgent extends BaseAgent<
  QueryPlannerInput,
  QueryPlannerResult
> {
  readonly type = AgentType.QUERY_PLANNING;
  readonly name = 'QueryPlannerAgent';

  private intentClassifier: IntentClassifier;

  constructor() {
    super();

    this.intentClassifier = new IntentClassifier();
    this.logger.info('QueryPlannerAgent initialized with IntentClassifier');
  }

  /**
   * Internal execution method required by BaseAgent
   */
  protected async executeInternal(
    input: QueryPlannerInput,
    context: AgentExecutionContext
  ): Promise<QueryPlannerResult> {
    this.logger.info(`Planning query: "${input.query}"`);

    // Step 1: Classify the query intent
    const classificationResult = this.intentClassifier.classifyIntent(
      input.query,
      input.profile.schema.columns.map(col => col.name)
    );

    // Extract confidence from the best alternative (first one)
    const confidence = classificationResult.alternatives[0]?.confidence || 0.5;

    this.logger.info(
      `Query classified as: ${classificationResult.intent.type} (confidence: ${confidence})`
    );

    // Step 2: Generate execution plan
    const executionPlan = this.generateExecutionPlan(
      classificationResult,
      input.profile,
      context,
      confidence
    );

    // Step 3: Build QueryIntent
    const queryIntent = this.buildQueryIntent(
      classificationResult,
      executionPlan,
      input.profile,
      confidence
    );

    this.logger.info(`Query planning completed`);

    return {
      queryIntent,
      executionPlan,
    };
  }

  /**
   * Generate optimized execution plan based on query intent
   */
  private generateExecutionPlan(
    classification: IntentClassificationResult,
    profile: DataProfile,
    context: AgentExecutionContext,
    confidence: number
  ): ExecutionPlan {
    const { intent } = classification;
    const planId = `plan-${Date.now()}-${Math.random().toString(36).substring(2)}`;

    // Determine if we should fallback to LLM
    const fallbackToLLM = confidence < 0.7 || intent.type === QueryType.UNKNOWN;

    const steps: PlanStep[] = [];
    let estimatedTime = 0;
    let estimatedCost = 0;
    const optimizations: string[] = [];

    if (!fallbackToLLM) {
      // Generate semantic execution steps
      steps.push(...this.generateSemanticSteps(intent, profile));

      // Estimate performance
      estimatedTime = this.estimateSemanticExecutionTime(steps, profile);
      estimatedCost = this.estimateQueryCost(intent.type, confidence);

      // Identify optimizations
      optimizations.push(...this.identifyOptimizations(intent, profile));
    } else {
      // LLM fallback plan
      steps.push({
        id: 'llm-fallback',
        type: 'transform',
        operation: 'llm_analysis',
        params: {
          query: intent.originalQuery || 'complex query',
          fallbackReason: 'low_confidence',
        },
        estimatedTime: 5000, // 5 seconds for LLM call
        dependsOn: [],
      });

      estimatedTime = 5000;
      estimatedCost = 8; // Higher cost for LLM usage
    }

    const cacheKey = this.generateCacheKey(intent);

    return {
      id: planId,
      steps,
      estimatedTime,
      estimatedCost,
      ...(cacheKey && { cacheKey }),
      fallbackToLLM,
      optimizations,
    };
  }

  /**
   * Generate semantic execution steps for structured queries
   */
  private generateSemanticSteps(intent: any, profile: DataProfile): PlanStep[] {
    const steps: PlanStep[] = [];
    let stepCounter = 1;

    // Always start with data load
    steps.push({
      id: `step-${stepCounter++}`,
      type: 'load',
      operation: 'load_profile_data',
      params: { profileId: profile.id },
      estimatedTime: 50,
      dependsOn: [],
    });

    const lastStepId = () =>
      steps.length > 0 ? steps[steps.length - 1]!.id : '';

    // Add filtering steps
    if (intent.filters && intent.filters.length > 0) {
      for (const filter of intent.filters) {
        steps.push({
          id: `step-${stepCounter++}`,
          type: 'filter',
          operation: 'apply_filter',
          params: filter,
          estimatedTime: 20,
          dependsOn: [lastStepId()],
        });
      }
    }

    // Add aggregation steps
    if (intent.measures && intent.measures.length > 0) {
      steps.push({
        id: `step-${stepCounter++}`,
        type: 'aggregate',
        operation: 'compute_aggregation',
        params: {
          measures: intent.measures,
          dimensions: intent.dimensions || [],
          aggregationType: intent.type,
        },
        estimatedTime: 100,
        dependsOn: [lastStepId()],
      });
    }

    // Add sorting if needed
    if (intent.type === QueryType.RANKING || intent.sorting) {
      steps.push({
        id: `step-${stepCounter++}`,
        type: 'sort',
        operation: 'apply_sort',
        params: {
          columns: intent.measures || intent.dimensions || [],
          direction: intent.type === QueryType.RANKING ? 'desc' : 'asc',
        },
        estimatedTime: 30,
        dependsOn: [lastStepId()],
      });
    }

    // Add limit if specified
    if (intent.limit) {
      steps.push({
        id: `step-${stepCounter++}`,
        type: 'limit',
        operation: 'apply_limit',
        params: { limit: intent.limit },
        estimatedTime: 5,
        dependsOn: [lastStepId()],
      });
    }

    return steps;
  }

  /**
   * Build QueryIntent from classification result and execution plan
   */
  private buildQueryIntent(
    classification: IntentClassificationResult,
    executionPlan: ExecutionPlan,
    profile: DataProfile,
    confidence: number
  ): QueryIntent {
    const { intent } = classification;

    // Map QueryType to QueryIntent type
    const queryIntentType = this.mapQueryTypeToIntentType(intent.type);

    // Build filters - only include valid filters
    const filters: FilterCondition[] =
      intent.filters
        ?.filter(filter => filter.column && filter.operator)
        .map(filter => ({
          column: filter.column!,
          operator: this.mapFilterOperator(filter.operator!),
          value: filter.value || '',
          dataType: this.inferDataType(filter.column!, profile),
        })) || [];

    // Determine visualization type
    const visualization = this.suggestVisualization(
      intent.type,
      intent.measures,
      intent.dimensions
    );

    return {
      type: queryIntentType,
      entities: {
        measures: intent.measures || [],
        dimensions: intent.dimensions || [],
        filters,
        ...(intent.timeColumn && { timeframe: this.createTimeframe() }),
      },
      operation: {
        groupBy: intent.dimensions || [],
        aggregation: this.mapAggregationType(intent.type),
        sort: [], // TODO: Extract sort info from query
        ...(intent.limit && { limit: intent.limit }),
      },
      ...(visualization && { visualization }),
      confidence,
    };
  }

  /**
   * Map QueryType to QueryIntent type field
   */
  private mapQueryTypeToIntentType(queryType: QueryType): QueryIntent['type'] {
    switch (queryType) {
      case QueryType.PROFILE:
        return 'profile';
      case QueryType.TREND:
        return 'trend';
      case QueryType.COMPARISON:
        return 'comparison';
      case QueryType.AGGREGATION:
        return 'aggregation';
      case QueryType.FILTER:
        return 'filter';
      case QueryType.DISTRIBUTION:
      case QueryType.RANKING:
      case QueryType.RELATIONSHIP:
      case QueryType.UNKNOWN:
      default:
        return 'custom';
    }
  }

  /**
   * Map filter operators
   */
  private mapFilterOperator(operator: string): FilterCondition['operator'] {
    const operatorMap: Record<string, FilterCondition['operator']> = {
      '=': 'eq',
      '!=': 'ne',
      '>': 'gt',
      '<': 'lt',
      '>=': 'gte',
      '<=': 'lte',
      in: 'in',
      'not in': 'not_in',
      contains: 'contains',
      'starts with': 'starts_with',
      'ends with': 'ends_with',
    };

    return operatorMap[operator] || 'eq';
  }

  /**
   * Infer data type for a column
   */
  private inferDataType(columnName: string, profile: DataProfile): string {
    const column = profile.schema.columns.find(col => col.name === columnName);
    return column?.type || 'text';
  }

  /**
   * Create default timeframe
   */
  private createTimeframe(): TimeRange {
    const now = new Date();
    const pastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      start: pastMonth,
      end: now,
      granularity: 'day',
    };
  }

  /**
   * Map aggregation type based on query type
   */
  private mapAggregationType(
    queryType: QueryType
  ): QueryIntent['operation']['aggregation'] {
    switch (queryType) {
      case QueryType.AGGREGATION:
        return 'sum';
      case QueryType.TREND:
        return 'avg';
      case QueryType.RANKING:
        return 'sum';
      case QueryType.COMPARISON:
        return 'avg';
      default:
        return 'count';
    }
  }

  /**
   * Suggest appropriate visualization
   */
  private suggestVisualization(
    queryType: QueryType,
    measures?: string[],
    dimensions?: string[]
  ): QueryIntent['visualization'] {
    switch (queryType) {
      case QueryType.TREND:
        return {
          type: 'line',
          ...(dimensions?.[0] && { x_axis: dimensions[0] }),
          ...(measures?.[0] && { y_axis: measures[0] }),
        };
      case QueryType.COMPARISON:
        return {
          type: 'bar',
          ...(dimensions?.[0] && { x_axis: dimensions[0] }),
          ...(measures?.[0] && { y_axis: measures[0] }),
        };
      case QueryType.DISTRIBUTION:
        return {
          type: 'heatmap',
          ...(dimensions?.[0] && { x_axis: dimensions[0] }),
          ...(measures?.[0] && { y_axis: measures[0] }),
        };
      case QueryType.RANKING:
        return {
          type: 'bar',
          ...(dimensions?.[0] && { x_axis: dimensions[0] }),
          ...(measures?.[0] && { y_axis: measures[0] }),
        };
      case QueryType.RELATIONSHIP:
        return {
          type: 'scatter',
          ...(measures?.[0] && { x_axis: measures[0] }),
          ...(measures?.[1] && { y_axis: measures[1] }),
        };
      default:
        return {
          type: 'table',
        };
    }
  }

  /**
   * Estimate execution time for semantic steps
   */
  private estimateSemanticExecutionTime(
    steps: PlanStep[],
    profile: DataProfile
  ): number {
    let totalTime = 0;
    const dataComplexity = Math.log10(profile.metadata.rowCount + 1);

    for (const step of steps) {
      // Base time with complexity multiplier
      totalTime += step.estimatedTime * (1 + dataComplexity * 0.1);
    }

    return Math.round(totalTime);
  }

  /**
   * Estimate query cost
   */
  private estimateQueryCost(queryType: QueryType, confidence: number): number {
    const baseCosts: Record<QueryType, number> = {
      [QueryType.PROFILE]: 1,
      [QueryType.FILTER]: 2,
      [QueryType.AGGREGATION]: 3,
      [QueryType.TREND]: 4,
      [QueryType.COMPARISON]: 5,
      [QueryType.DISTRIBUTION]: 6,
      [QueryType.RANKING]: 4,
      [QueryType.RELATIONSHIP]: 7,
      [QueryType.UNKNOWN]: 10,
    };

    const baseCost = baseCosts[queryType] || 5;
    return Math.round(baseCost * (1 + (1 - confidence) * 0.5));
  }

  /**
   * Generate cache key for query intent
   */
  private generateCacheKey(intent: any): string | undefined {
    if (!this.canCacheQuery(intent.type)) {
      return undefined;
    }

    const keyParts = [
      intent.type,
      JSON.stringify(intent.measures || []),
      JSON.stringify(intent.dimensions || []),
      JSON.stringify(intent.filters || []),
    ];

    return `query_${keyParts.join('_')}`;
  }

  /**
   * Check if query can be cached
   */
  private canCacheQuery(queryType: QueryType): boolean {
    // Profile and aggregation queries are cacheable
    return [
      QueryType.PROFILE,
      QueryType.AGGREGATION,
      QueryType.COMPARISON,
      QueryType.DISTRIBUTION,
    ].includes(queryType);
  }

  /**
   * Identify optimization opportunities
   */
  private identifyOptimizations(intent: any, profile: DataProfile): string[] {
    const optimizations: string[] = [];

    // Cache optimization
    if (this.canCacheQuery(intent.type)) {
      optimizations.push('cacheable');
    }

    // Predicate pushdown for filters
    if (intent.filters && intent.filters.length > 0) {
      optimizations.push('predicate_pushdown');
    }

    // Column pruning
    if (
      intent.measures &&
      intent.measures.length < profile.metadata.columnCount
    ) {
      optimizations.push('column_pruning');
    }

    // Index usage
    if (intent.dimensions && intent.dimensions.length > 0) {
      optimizations.push('index_usage');
    }

    return optimizations;
  }

  /**
   * Validate input parameters
   */
  validateInput(input: QueryPlannerInput): boolean {
    if (!input.query || typeof input.query !== 'string') {
      throw new Error('Query must be a non-empty string');
    }

    if (!input.profile || !input.profile.id) {
      throw new Error('Valid DataProfile is required');
    }

    if (!input.profile.schema || !input.profile.schema.columns) {
      throw new Error('DataProfile must have schema with columns');
    }

    return true;
  }
}
