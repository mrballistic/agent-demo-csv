/**
 * Agent orchestration system for the AI Data Analyst
 * @fileoverview Central coordinator for managing agent interactions, execution pipelines, and semantic query processing
 */

import {
  Agent,
  BaseAgent,
  AgentHealthStatus,
  createExecutionContext,
  retryExecution,
} from './base';
import {
  AgentType,
  AgentMessage,
  MessageType,
  AgentResult,
  AgentExecutionContext,
  ResourceStatus,
  DataProfile,
  AnalysisResult,
  QueryIntent,
  AgentError,
} from './types';
import {
  SemanticExecutorAgent,
  SemanticExecutorInput,
} from './semantic-executor-agent';
import { QueryPlannerResult } from './query-planner-agent';
import { ConversationOutput } from './conversation-agent';

/**
 * Represents an uploaded file with its metadata
 */
export interface UploadedFile {
  /** File content as Buffer */
  buffer: Buffer;
  /** Original filename */
  name: string;
  /** MIME type of the file */
  mimeType: string;
  /** File size in bytes */
  size: number;
}

/**
 * Central orchestrator for coordinating agent interactions and managing analysis pipelines
 *
 * The AgentOrchestrator serves as the primary coordination layer for all agent-based operations
 * in the AI Data Analyst system. It manages agent registration, message routing, execution
 * contexts, and provides high-level APIs for data processing workflows.
 *
 * Key responsibilities:
 * - Agent lifecycle management (register/unregister)
 * - Message queue processing and routing
 * - Execution context management with timeout handling
 * - Data profiling pipeline coordination
 * - Semantic query processing with fallback to LLM
 * - Health monitoring and error handling
 *
 * @example
 * ```typescript
 * const orchestrator = new AgentOrchestrator();
 * orchestrator.registerAgent(new ProfilingAgent());
 * orchestrator.registerAgent(new QueryPlannerAgent());
 *
 * // Process uploaded file
 * const profile = await orchestrator.processDataUpload({
 *   buffer: csvBuffer,
 *   name: 'data.csv',
 *   mimeType: 'text/csv',
 *   size: csvBuffer.length
 * });
 *
 * // Execute semantic query
 * const result = await orchestrator.executeSemanticQuery(
 *   'Show me total sales by month',
 *   profile
 * );
 * ```
 */
export class AgentOrchestrator {
  private agents = new Map<AgentType, Agent>();
  private messageQueue: AgentMessage[] = [];
  private activeExecutions = new Map<string, Promise<any>>();
  private logger = console;

  constructor() {
    this.logger.info('AgentOrchestrator initialized');
  }

  /**
   * Register an agent with the orchestrator
   */
  registerAgent<TInput, TOutput>(agent: Agent<TInput, TOutput>): void {
    if (this.agents.has(agent.type)) {
      throw new Error(`Agent of type ${agent.type} is already registered`);
    }

    this.agents.set(agent.type, agent);
    this.logger.info(
      `Registered agent: ${agent.type} (${agent.name} v${agent.version})`
    );
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(type: AgentType): Promise<void> {
    const agent = this.agents.get(type);
    if (agent) {
      await agent.dispose();
      this.agents.delete(type);
      this.logger.info(`Unregistered agent: ${type}`);
    }
  }

  /**
   * Get registered agent by type
   */
  getAgent<TInput, TOutput>(
    type: AgentType
  ): Agent<TInput, TOutput> | undefined {
    return this.agents.get(type) as Agent<TInput, TOutput> | undefined;
  }

  /**
   * Process uploaded file through the data profiling pipeline
   */
  async processDataUpload(file: UploadedFile): Promise<DataProfile> {
    const context = createExecutionContext(`upload-${Date.now()}`, {
      timeout: 60000, // 60 second timeout for file processing
    });

    // Validate file
    this.validateFile(file);

    // Get profiling agent
    const profilingAgent = this.getAgent(AgentType.PROFILING);
    if (!profilingAgent) {
      throw new AgentError(
        'Data profiling agent not available',
        AgentType.PROFILING,
        'AGENT_NOT_FOUND'
      );
    }

    this.logger.info(
      `Processing file upload: ${file.name} (${file.size} bytes)`
    );

    // Execute profiling with retry logic
    const result = await retryExecution(profilingAgent, file, context, 2, 1000);

    if (!result.success) {
      throw result.error || new Error('Profiling failed');
    }

    const profile = result.data as DataProfile;

    // Run security analysis in parallel (if available)
    const securityAgent = this.getAgent(AgentType.SECURITY);
    if (securityAgent) {
      try {
        const securityResult = await securityAgent.execute(profile, context);
        if (securityResult.success) {
          // Merge security analysis into profile
          profile.security =
            securityResult.data as import('./types').SecurityProfile;
        }
      } catch (error) {
        this.logger.warn('Security analysis failed, continuing without it', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info(`File processing complete: ${profile.id}`, {
      processingTime: result.metrics.executionTime,
      rowCount: profile.metadata.rowCount,
      columnCount: profile.metadata.columnCount,
    });

    return profile;
  }

  /**
   * Execute query against a data profile
   */
  async executeQuery(
    query: string,
    profileId: string
  ): Promise<AnalysisResult> {
    const context = createExecutionContext(`query-${Date.now()}`, {
      timeout: 30000, // 30 second timeout for queries
    });

    this.logger.info(`Executing query: "${query}" on profile ${profileId}`);

    // Load profile from cache (for now, assume it's passed in)
    // In a real implementation, this would load from cache/storage
    const profile = await this.loadProfile(profileId);

    // Get query planning agent
    const queryAgent = this.getAgent(AgentType.QUERY_PLANNING);
    if (!queryAgent) {
      // Fallback to conversation agent if query planning not available
      return this.executeWithConversationAgent(query, profile, context);
    }

    // Parse query intent and generate execution plan
    const planningResult = await queryAgent.execute(
      { query, profile },
      context
    );
    if (!planningResult.success) {
      // Fallback to conversation agent
      return this.executeWithConversationAgent(query, profile, context);
    }

    const { queryIntent, executionPlan } =
      planningResult.data as QueryPlannerResult;

    // Check if we can handle this semantically or need LLM
    if (queryIntent.confidence < 0.7) {
      this.logger.info('Low confidence in query parsing, falling back to LLM');
      return this.executeWithConversationAgent(query, profile, context);
    }

    // Execute semantic query with the planning results
    const analysisResult = await this.executeSemanticQuery(
      query,
      queryIntent,
      executionPlan,
      profile,
      context
    );

    // Generate chart if visualization is requested
    if (queryIntent.visualization) {
      const chartAgent = this.getAgent(AgentType.CHART);
      if (chartAgent) {
        try {
          const chartResult = await chartAgent.execute(
            { data: analysisResult.data, config: queryIntent.visualization },
            context
          );
          if (chartResult.success) {
            analysisResult.chart =
              chartResult.data as import('./types').ChartOutput;
          }
        } catch (error) {
          this.logger.warn('Chart generation failed', { error });
        }
      }
    }

    return analysisResult;
  }

  /**
   * Execute query using semantic layer (without LLM)
   */
  private async executeSemanticQuery(
    originalQuery: string,
    queryIntent: QueryIntent,
    executionPlan: any, // ExecutionPlan type
    profile: DataProfile,
    context: AgentExecutionContext
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

    this.logger.info(
      `Executing semantic query: "${originalQuery}" (type: ${queryIntent.type}, confidence: ${queryIntent.confidence})`
    );

    // Get semantic executor agent
    const semanticExecutorAgent = this.getAgent(AgentType.SEMANTIC_EXECUTOR);
    if (!semanticExecutorAgent) {
      throw new AgentError(
        'Semantic executor agent not available',
        AgentType.SEMANTIC_EXECUTOR,
        'AGENT_NOT_FOUND'
      );
    }

    // Execute semantic query with the already generated plan
    const executorInput: SemanticExecutorInput = {
      queryIntent,
      profile,
      executionPlan,
    };

    const executionResult = await semanticExecutorAgent.execute(
      executorInput,
      context
    );

    if (!executionResult.success) {
      throw executionResult.error || new Error('Semantic execution failed');
    }

    const semanticResult = executionResult.data as any; // SemanticExecutorResult

    // Convert to AnalysisResult format
    const analysisResult: AnalysisResult = {
      id: `analysis-${Date.now()}`,
      query: originalQuery,
      intent: queryIntent,
      executionPlan,
      data: semanticResult.data || [],
      insights: [
        ...(semanticResult.insights.keyFindings || []).map(
          (finding: string) => ({
            type: 'insight' as const,
            content: finding,
            confidence: 0.9,
          })
        ),
        ...(semanticResult.insights.trends || []).map((trend: any) => ({
          type: 'trend' as const,
          content: `${trend.metric} is ${trend.direction} with ${trend.changePercent}% change`,
          confidence: 0.8,
        })),
      ],
      metadata: {
        executionTime: semanticResult.metadata.executionTime,
        dataPoints:
          semanticResult.data?.length || profile.sampleData?.length || 0,
        cacheHit: false,
        agentPath: [AgentType.QUERY_PLANNING, AgentType.SEMANTIC_EXECUTOR],
      },
      suggestions: semanticResult.suggestions || [],
    };

    this.logger.info(
      `Semantic query execution completed in ${Date.now() - startTime}ms`,
      {
        queryType: queryIntent.type,
        dataPoints: analysisResult.metadata.dataPoints,
        insights: analysisResult.insights.length,
        fallbackToLLM: executionPlan.fallbackToLLM,
      }
    );

    return analysisResult;
  }

  /**
   * Fallback to conversation agent for complex queries
   */
  private async executeWithConversationAgent(
    query: string,
    profile: DataProfile,
    context: AgentExecutionContext
  ): Promise<AnalysisResult> {
    const conversationAgent = this.getAgent(AgentType.CONVERSATION);
    if (!conversationAgent) {
      throw new AgentError(
        'No conversation agent available for complex query processing',
        AgentType.CONVERSATION,
        'AGENT_NOT_FOUND'
      );
    }

    this.logger.info('Executing query with conversation agent (LLM fallback)');

    // Create a session ID for this query
    const sessionId = `orchestrator-${Date.now()}`;

    const result = await conversationAgent.execute(
      {
        sessionId,
        query,
        context: {
          previousAnalyses: [],
          currentDataProfile: profile,
          conversationHistory: [],
          userPreferences: {
            preferredChartTypes: ['bar', 'line', 'pie'],
            detailLevel: 'detailed',
            includeInsights: true,
            includeVisualization: true,
          },
        },
      },
      context
    );

    if (!result.success) {
      throw result.error || new Error('Conversation agent failed');
    }

    const conversationOutput = result.data as ConversationOutput;

    // Convert ConversationOutput to AnalysisResult format
    const analysisResult: AnalysisResult = {
      id: `analysis-${Date.now()}`,
      query,
      intent: {
        type: 'custom',
        confidence: conversationOutput.confidence,
        entities: {
          measures: [],
          dimensions: [],
          filters: [],
        },
        operation: {
          groupBy: [],
          aggregation: 'count',
          sort: [],
        },
      },
      executionPlan: {
        id: `plan-${Date.now()}`,
        steps: [],
        estimatedCost: 1,
        estimatedTime: 100,
        optimizations: [],
        cacheKey: 'orchestrator-fallback',
        fallbackToLLM: true,
      },
      data: [],
      insights: (conversationOutput.insights || []).map(insight => ({
        ...insight,
        data: insight.data || {},
      })),

      metadata: {
        executionTime: Date.now() - context.startTime.getTime(),
        dataPoints: 0,
        cacheHit: false,
        agentPath: conversationOutput.agentPath,
      },
      suggestions: conversationOutput.followUpSuggestions,
    };

    return analysisResult;
  }

  /**
   * Route message between agents
   */
  async routeMessage(message: AgentMessage): Promise<void> {
    const targetAgent = this.agents.get(message.to as AgentType);
    if (!targetAgent) {
      this.logger.error(`Target agent not found: ${message.to}`);
      return;
    }

    // Add message to queue for processing
    this.messageQueue.push(message);
    this.logger.debug(
      `Message queued: ${message.type} from ${message.from} to ${message.to}`
    );
  }

  /**
   * Handle agent failure and recovery
   */
  async handleAgentFailure(agentType: AgentType, error: Error): Promise<void> {
    this.logger.error(`Agent failure detected: ${agentType}`, {
      error: error.message,
      stack: error.stack,
    });

    // Get the failed agent
    const agent = this.agents.get(agentType);
    if (!agent) {
      return;
    }

    // Check agent health
    const health = await agent.getHealth();
    if (!health.healthy) {
      this.logger.warn(`Agent ${agentType} is unhealthy, considering restart`);
      // In a production system, this might trigger agent restart/replacement
    }

    // For now, just log the failure
    // In a real system, this would implement circuit breaker pattern,
    // agent replacement, or other recovery strategies
  }

  /**
   * Check system resource limits
   */
  checkResourceLimits(): ResourceStatus {
    const memUsage = process.memoryUsage?.() || { heapUsed: 0, heapTotal: 0 };
    const memoryPercentage =
      memUsage.heapTotal > 0
        ? (memUsage.heapUsed / memUsage.heapTotal) * 100
        : 0;

    return {
      memory: {
        used: memUsage.heapUsed,
        available: memUsage.heapTotal - memUsage.heapUsed,
        percentage: memoryPercentage,
      },
      cpu: {
        usage: 0, // Would require additional monitoring
        cores: 1,
      },
      agents: {
        active: this.activeExecutions.size,
        queued: this.messageQueue.length,
        failed: 0, // Would track failed executions
      },
    };
  }

  /**
   * Balance load across agents (placeholder)
   */
  async balanceLoad(): Promise<void> {
    // Placeholder for load balancing logic
    const resources = this.checkResourceLimits();
    if (resources.memory.percentage > 80) {
      this.logger.warn('High memory usage detected', resources);
    }
  }

  /**
   * Get health status of all agents
   */
  async getSystemHealth(): Promise<Map<AgentType, AgentHealthStatus>> {
    const healthMap = new Map<AgentType, AgentHealthStatus>();

    for (const [type, agent] of this.agents) {
      try {
        const health = await agent.getHealth();
        healthMap.set(type, health);
      } catch (error) {
        this.logger.error(`Failed to get health for agent ${type}`, { error });
        healthMap.set(type, {
          healthy: false,
          lastCheck: new Date(),
          metrics: {
            uptime: 0,
            totalExecutions: 0,
            successRate: 0,
            avgExecutionTime: 0,
            errorCount: 1,
          },
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
    }

    return healthMap;
  }

  /**
   * Gracefully shutdown all agents
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down agent orchestrator');

    // Wait for active executions to complete (with timeout)
    const activePromises = Array.from(this.activeExecutions.values());
    if (activePromises.length > 0) {
      this.logger.info(
        `Waiting for ${activePromises.length} active executions to complete`
      );
      await Promise.allSettled(activePromises);
    }

    // Dispose all agents
    for (const [type, agent] of this.agents) {
      try {
        await agent.dispose();
        this.logger.info(`Disposed agent: ${type}`);
      } catch (error) {
        this.logger.error(`Error disposing agent ${type}`, { error });
      }
    }

    this.agents.clear();
    this.messageQueue.length = 0;
    this.activeExecutions.clear();
  }

  /**
   * Validate uploaded file
   */
  private validateFile(file: UploadedFile): void {
    if (!file.buffer || file.buffer.length === 0) {
      throw new Error('File buffer is empty');
    }

    if (file.size > 500 * 1024 * 1024) {
      // 500MB limit
      throw new Error('File size exceeds maximum limit of 500MB');
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      throw new Error('Only CSV files are supported');
    }
  }

  /**
   * Load profile from storage (placeholder)
   */
  private async loadProfile(profileId: string): Promise<DataProfile> {
    // Placeholder - in real implementation, this would load from cache/database
    throw new Error(`Profile loading not implemented: ${profileId}`);
  }
}

/**
 * Global orchestrator instance (singleton pattern)
 */
export const globalOrchestrator = new AgentOrchestrator();

/**
 * Convenience function to get the global orchestrator
 */
export function getOrchestrator(): AgentOrchestrator {
  return globalOrchestrator;
}
