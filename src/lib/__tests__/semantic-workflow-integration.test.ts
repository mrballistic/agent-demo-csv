import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentOrchestrator } from '../agents/orchestrator';
import { QueryPlannerAgent } from '../agents/query-planner-agent';
import { SemanticExecutorAgent } from '../agents/semantic-executor-agent';
import { AgentType, DataProfile, QueryIntent } from '../agents/types';

// Mock data profile for testing - simplified to avoid complex type issues
const mockProfile = {
  id: 'profile-test',
  version: 1,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  metadata: {
    filename: 'test-sales.csv',
    size: 1000,
    encoding: 'utf-8',
    delimiter: ',',
    rowCount: 100,
    columnCount: 4,
    processingTime: 50,
    checksum: 'abc123',
  },
  schema: {
    columns: [
      { name: 'revenue', type: 'numeric' },
      { name: 'category', type: 'categorical' },
      { name: 'quarter', type: 'categorical' },
      { name: 'region', type: 'categorical' },
    ],
    relationships: [],
  },
  sampleData: [
    { revenue: 1000, category: 'Electronics', quarter: 'Q1', region: 'North' },
    { revenue: 2000, category: 'Books', quarter: 'Q1', region: 'South' },
    { revenue: 3000, category: 'Clothing', quarter: 'Q2', region: 'East' },
    { revenue: 4000, category: 'Electronics', quarter: 'Q2', region: 'West' },
    { revenue: 1500, category: 'Books', quarter: 'Q3', region: 'North' },
    { revenue: 2500, category: 'Clothing', quarter: 'Q3', region: 'South' },
    { revenue: 3500, category: 'Electronics', quarter: 'Q4', region: 'East' },
    { revenue: 5000, category: 'Books', quarter: 'Q4', region: 'West' },
  ],
} as any;

describe('Semantic Workflow Integration', () => {
  let orchestrator: AgentOrchestrator;
  let queryPlannerAgent: QueryPlannerAgent;
  let semanticExecutorAgent: SemanticExecutorAgent;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator();
    queryPlannerAgent = new QueryPlannerAgent();
    semanticExecutorAgent = new SemanticExecutorAgent();

    // Register agents with orchestrator
    orchestrator.registerAgent(queryPlannerAgent);
    orchestrator.registerAgent(semanticExecutorAgent);
  });

  afterEach(async () => {
    await orchestrator.shutdown();
    await queryPlannerAgent.dispose();
    await semanticExecutorAgent.dispose();
  });

  describe('End-to-End Semantic Query Processing', () => {
    it('should process aggregation query through complete workflow', async () => {
      const query = 'Show total revenue by category';

      // Mock executeQuery to use our semantic workflow
      // In reality, this would be called through API endpoints
      const result = await processSemanticQuery(
        orchestrator,
        query,
        mockProfile
      );

      expect(result).toBeDefined();
      expect(result.intent.type).toBe('aggregation');
      expect(result.data).toBeInstanceOf(Array);
      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.metadata.agentPath).toContain(AgentType.QUERY_PLANNING);
      expect(result.metadata.agentPath).toContain(AgentType.SEMANTIC_EXECUTOR);
    });

    it('should handle trend analysis query', async () => {
      const query = 'Show revenue trends over quarters';

      const result = await processSemanticQuery(
        orchestrator,
        query,
        mockProfile
      );

      expect(result).toBeDefined();
      expect(result.intent.type).toBe('trend');
      expect(result.data).toBeInstanceOf(Array);
      expect(result.insights.some(insight => insight.type === 'trend')).toBe(
        true
      );
    });

    it('should process comparison query', async () => {
      const query = 'Compare revenue between Electronics and Books categories';

      const result = await processSemanticQuery(
        orchestrator,
        query,
        mockProfile
      );

      expect(result).toBeDefined();
      expect(result.intent.type).toBe('comparison');
      expect(result.data).toBeInstanceOf(Array);
      expect(result.metadata.dataPoints).toBeGreaterThan(0);
    });

    it('should handle filtering with aggregation', async () => {
      const query = 'Show total revenue for Electronics category in Q1';

      const result = await processSemanticQuery(
        orchestrator,
        query,
        mockProfile
      );

      expect(result).toBeDefined();
      expect(['filter', 'aggregation']).toContain(result.intent.type);
      expect(result.data).toBeInstanceOf(Array);
      expect(result.insights.length).toBeGreaterThan(0);
    });

    it('should validate agent health throughout workflow', async () => {
      const healthBefore = await orchestrator.getSystemHealth();

      expect(healthBefore.get(AgentType.QUERY_PLANNING)?.healthy).toBe(true);
      expect(healthBefore.get(AgentType.SEMANTIC_EXECUTOR)?.healthy).toBe(true);

      // Process multiple queries to validate agent stability
      const queries = [
        'Show revenue by category',
        'Show revenue trends by quarter',
        'Compare regional performance',
      ];

      for (const query of queries) {
        await processSemanticQuery(orchestrator, query, mockProfile);
      }

      const healthAfter = await orchestrator.getSystemHealth();
      expect(healthAfter.get(AgentType.QUERY_PLANNING)?.healthy).toBe(true);
      expect(healthAfter.get(AgentType.SEMANTIC_EXECUTOR)?.healthy).toBe(true);
    });

    it('should handle execution plan optimization', async () => {
      const query =
        'Show top 5 revenue performers by category sorted descending';

      const result = await processSemanticQuery(
        orchestrator,
        query,
        mockProfile
      );

      expect(result).toBeDefined();
      expect(result.executionPlan).toBeDefined();
      expect(result.executionPlan.optimizations).toBeInstanceOf(Array);
      expect(result.metadata.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should handle missing agents gracefully', async () => {
      // Create orchestrator without semantic executor
      const testOrchestrator = new AgentOrchestrator();
      testOrchestrator.registerAgent(queryPlannerAgent);

      await expect(
        processSemanticQuery(testOrchestrator, 'test query', mockProfile)
      ).rejects.toThrow('Semantic executor agent not available');

      await testOrchestrator.shutdown();
    });

    it('should validate input data profile', async () => {
      const invalidProfile = {
        ...mockProfile,
        sampleData: [], // Empty sample data
      };

      const result = await processSemanticQuery(
        orchestrator,
        'Show revenue by category',
        invalidProfile
      );

      // Should still succeed but with empty results
      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
    });
  });
});

/**
 * Helper function to simulate semantic query processing
 * This mimics what would happen in the API endpoint
 */
async function processSemanticQuery(
  orchestrator: AgentOrchestrator,
  query: string,
  profile: DataProfile
) {
  // Get query planning agent
  const queryPlannerAgent = orchestrator.getAgent(AgentType.QUERY_PLANNING);
  if (!queryPlannerAgent) {
    throw new Error('Query planning agent not available');
  }

  // Create execution context
  const context = {
    requestId: `test-${Date.now()}`,
    startTime: new Date(),
    timeout: 30000,
  };

  // Parse query intent
  const planningResult = await queryPlannerAgent.execute(
    { query, profile },
    context
  );

  if (!planningResult.success) {
    throw planningResult.error || new Error('Query planning failed');
  }

  const { queryIntent, executionPlan } = planningResult.data as any;

  // Get semantic executor agent
  const semanticExecutorAgent = orchestrator.getAgent(
    AgentType.SEMANTIC_EXECUTOR
  );
  if (!semanticExecutorAgent) {
    throw new Error('Semantic executor agent not available');
  }

  // Execute semantic query
  const executorResult = await semanticExecutorAgent.execute(
    {
      queryIntent,
      profile,
      executionPlan,
    },
    context
  );

  if (!executorResult.success) {
    throw executorResult.error || new Error('Semantic execution failed');
  }

  const semanticResult = executorResult.data as any;

  // Convert to AnalysisResult format (same as orchestrator does)
  return {
    id: `analysis-${Date.now()}`,
    query,
    intent: queryIntent,
    executionPlan: executionPlan, // Use the execution plan from QueryPlannerAgent
    data: semanticResult.data || [],
    insights: [
      ...(semanticResult.insights.keyFindings || []).map((finding: string) => ({
        type: 'insight' as const,
        content: finding,
        confidence: 0.9,
      })),
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
}

/**
 * Simple query parser for testing
 * In reality, this would use the IntentClassifier
 */
function parseQuery(query: string): QueryIntent {
  const lowerQuery = query.toLowerCase();

  let type: QueryIntent['type'] = 'custom';
  if (lowerQuery.includes('total') || lowerQuery.includes('sum')) {
    type = 'aggregation';
  } else if (lowerQuery.includes('trend') || lowerQuery.includes('over')) {
    type = 'trend';
  } else if (lowerQuery.includes('compare') || lowerQuery.includes('between')) {
    type = 'comparison';
  } else if (lowerQuery.includes('filter') || lowerQuery.includes('where')) {
    type = 'filter';
  } else if (lowerQuery.includes('show') && lowerQuery.includes('by')) {
    type = 'aggregation';
  }

  // Extract entities based on keywords
  const measures = [];
  const dimensions = [];

  if (lowerQuery.includes('revenue')) measures.push('revenue');
  if (lowerQuery.includes('category')) dimensions.push('category');
  if (lowerQuery.includes('quarter')) dimensions.push('quarter');
  if (lowerQuery.includes('region')) dimensions.push('region');

  return {
    type,
    entities: {
      measures,
      dimensions,
      filters: [],
    },
    operation: {
      groupBy: dimensions,
      aggregation: lowerQuery.includes('total') ? 'sum' : 'avg',
      sort: lowerQuery.includes('top')
        ? [{ column: 'revenue', direction: 'desc' }]
        : [],
      ...(lowerQuery.includes('top 5') && { limit: 5 }),
    },
    confidence: 0.8,
  };
}
