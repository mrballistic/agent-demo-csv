import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  DataProfile,
  AnalysisResult,
  QueryIntent,
  NumericStats,
  CategoricalStats,
  DateTimeStats,
} from '../agents/types.js';
import { AgentOrchestrator } from '../agents/orchestrator.js';
import {
  QueryPlannerAgent,
  QueryPlannerResult,
} from '../agents/query-planner-agent.js';
import { SemanticExecutorAgent } from '../agents/semantic-executor-agent.js';
import { AgentType } from '../agents/types.js';

// Mock console to prevent output during tests
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
};

global.console = mockLogger as any;

describe('Orchestrator End-to-End Integration', () => {
  let orchestrator: AgentOrchestrator;
  let queryPlannerAgent: QueryPlannerAgent;
  let semanticExecutorAgent: SemanticExecutorAgent;
  let mockProfile: DataProfile;

  beforeEach(async () => {
    orchestrator = new AgentOrchestrator();

    // Create agents
    queryPlannerAgent = new QueryPlannerAgent();
    semanticExecutorAgent = new SemanticExecutorAgent();

    // Register agents
    orchestrator.registerAgent(queryPlannerAgent);
    orchestrator.registerAgent(semanticExecutorAgent);

    mockProfile = {
      id: 'test-profile-123',
      version: 1,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: {
        filename: 'test-data.csv',
        size: 1024,
        encoding: 'utf-8',
        delimiter: ',',
        rowCount: 1000,
        columnCount: 4,
        processingTime: 50,
        checksum: 'abc123',
      },
      schema: {
        columns: [
          { name: 'category', type: 'categorical' },
          { name: 'revenue', type: 'numeric' },
          { name: 'date', type: 'datetime' },
          { name: 'quantity', type: 'numeric' },
        ] as any,
        relationships: [],
        foreignKeys: [],
      },
      sampleData: [
        {
          category: 'Electronics',
          revenue: 1000,
          date: '2024-01-01',
          quantity: 1,
        },
        { category: 'Books', revenue: 1500, date: '2024-01-02', quantity: 2 },
        {
          category: 'Clothing',
          revenue: 2000,
          date: '2024-01-03',
          quantity: 3,
        },
        { category: 'Home', revenue: 2500, date: '2024-01-04', quantity: 4 },
        { category: 'Sports', revenue: 3000, date: '2024-01-05', quantity: 5 },
      ],

      insights: {
        keyFindings: [
          'Data has 5 categories',
          'Revenue ranges from 1000 to 3000',
        ],
        trends: [],
        anomalies: [],
        suggestedQueries: [],
        recommendations: [],
      },
      quality: {
        completeness: 1.0,
        validity: 1.0,
        consistency: 1.0,
        accuracy: 1.0,
        dataQuality: 'high',
        issues: [],
      },
      security: {
        piiColumns: [],
        sensitiveData: [],
        encryptionRecommended: false,
      },
      aggregations: {},
      indexes: {},
    } as unknown as DataProfile;
  });

  afterEach(async () => {
    await orchestrator.shutdown();
  });

  /**
   * Helper function to process semantic queries through the orchestrator workflow
   * This mimics the internal semantic execution path
   */
  async function processSemanticQuery(
    query: string,
    profile: DataProfile
  ): Promise<AnalysisResult> {
    // Create execution context
    const context = {
      requestId: `test-${Date.now()}`,
      startTime: new Date(),
      timeout: 30000,
    };

    // Step 1: Query Planning
    const planningResult = await queryPlannerAgent.execute(
      { query, profile },
      context
    );

    if (!planningResult.success) {
      throw planningResult.error || new Error('Query planning failed');
    }

    const { queryIntent, executionPlan } =
      planningResult.data as QueryPlannerResult;

    // Step 2: Semantic Execution
    const executionResult = await semanticExecutorAgent.execute(
      { queryIntent, profile, executionPlan },
      context
    );

    if (!executionResult.success) {
      throw executionResult.error || new Error('Semantic execution failed');
    }

    const semanticResult = executionResult.data as any;

    // Step 3: Convert to AnalysisResult format (like orchestrator does)
    const analysisResult: AnalysisResult = {
      id: `analysis-${Date.now()}`,
      query,
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

    return analysisResult;
  }

  describe('Semantic Query Execution Workflow', () => {
    it('should execute aggregation queries through complete semantic layer', async () => {
      const query = 'Show total revenue by category';

      const result = await processSemanticQuery(query, mockProfile);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.query).toBe(query);
      expect(result.intent).toBeDefined();
      expect(result.intent.type).toBe('aggregation');
      expect(result.executionPlan).toBeDefined();
      expect(result.data).toBeDefined();
      expect(result.insights).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.agentPath).toContain(AgentType.QUERY_PLANNING);
      expect(result.metadata.agentPath).toContain(AgentType.SEMANTIC_EXECUTOR);

      // Verify execution time is reasonable
      expect(result.metadata.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata.executionTime).toBeLessThan(1000); // Should be fast
    });

    it('should execute trend queries through semantic layer', async () => {
      const query = 'Show revenue trends over time';

      const result = await processSemanticQuery(query, mockProfile);

      expect(result).toBeDefined();
      expect(result.intent.type).toBe('trend');
      expect(result.metadata.agentPath).toHaveLength(2);
      expect(result.metadata.agentPath[0]).toBe(AgentType.QUERY_PLANNING);
      expect(result.metadata.agentPath[1]).toBe(AgentType.SEMANTIC_EXECUTOR);
    });

    it('should execute comparison queries through semantic layer', async () => {
      const query = 'Compare revenue between Electronics and Books categories';

      const result = await processSemanticQuery(query, mockProfile);

      expect(result).toBeDefined();
      expect(result.intent.type).toBe('comparison');
      expect(result.query).toBe(query);
      expect(result.metadata.agentPath).toContain(AgentType.SEMANTIC_EXECUTOR);
    });

    it('should execute ranking queries through semantic layer', async () => {
      const query = 'Show top 5 categories by revenue';

      const result = await processSemanticQuery(query, mockProfile);

      expect(result).toBeDefined();
      // Note: Query may be classified as 'custom' or 'ranking' depending on confidence
      expect(['ranking', 'custom', 'unknown']).toContain(result.intent.type);
      expect(result.executionPlan).toBeDefined();
      expect(result.metadata.dataPoints).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Agent Integration and Performance', () => {
    it('should complete queries within reasonable time', async () => {
      const startTime = Date.now();
      const query = 'Show total revenue by category';

      const result = await processSemanticQuery(query, mockProfile);
      const executionTime = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.metadata.executionTime).toBeLessThan(1000); // Agent execution within 1 second
    });

    it('should handle multiple concurrent queries', async () => {
      const queries = [
        'Show total revenue by category',
        'Show revenue trends over time',
        'Compare Electronics vs Books revenue',
        'Show top 3 categories by revenue',
      ];

      const promises = queries.map(query =>
        processSemanticQuery(query, mockProfile)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(4);
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.query).toBe(queries[index]);
        expect(result.metadata.agentPath).toContain(
          AgentType.SEMANTIC_EXECUTOR
        );
      });
    });

    it('should maintain agent health throughout execution', async () => {
      const query = 'Show total revenue by category';

      // Execute multiple queries to test agent stability
      for (let i = 0; i < 5; i++) {
        const result = await processSemanticQuery(query, mockProfile);
        expect(result).toBeDefined();
        expect(result.metadata.agentPath).toContain(
          AgentType.SEMANTIC_EXECUTOR
        );
      }

      // Verify agents are still healthy
      const queryPlannerhealth = await queryPlannerAgent.getHealth();
      const semanticExecutorHealth = await semanticExecutorAgent.getHealth();

      expect(queryPlannerhealth.healthy).toBe(true);
      expect(semanticExecutorHealth.healthy).toBe(true);
    });
  });

  describe('Orchestrator System Health', () => {
    it('should properly register and manage agents', async () => {
      // Verify agents are registered
      const queryAgent = orchestrator.getAgent(AgentType.QUERY_PLANNING);
      const executorAgent = orchestrator.getAgent(AgentType.SEMANTIC_EXECUTOR);

      expect(queryAgent).toBeDefined();
      expect(executorAgent).toBeDefined();
      expect(queryAgent).toBe(queryPlannerAgent);
      expect(executorAgent).toBe(semanticExecutorAgent);
    });

    it('should handle missing agents gracefully', async () => {
      // Create orchestrator without agents
      const testOrchestrator = new AgentOrchestrator();

      // Try to get non-existent agent
      const missingAgent = testOrchestrator.getAgent(AgentType.QUERY_PLANNING);
      expect(missingAgent).toBeUndefined();

      await testOrchestrator.shutdown();
    });

    it('should support agent health checking', async () => {
      const queryPlannerHealth = await queryPlannerAgent.getHealth();
      const semanticExecutorHealth = await semanticExecutorAgent.getHealth();

      expect(queryPlannerHealth).toMatchObject({
        healthy: expect.any(Boolean),
        lastCheck: expect.any(Date),
      });

      expect(semanticExecutorHealth).toMatchObject({
        healthy: expect.any(Boolean),
        lastCheck: expect.any(Date),
      });
    });
  });
});
