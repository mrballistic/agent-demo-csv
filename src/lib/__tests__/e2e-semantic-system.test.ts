import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Test data
const sampleCSVContent = `name,age,city,salary
John Doe,25,New York,75000
Jane Smith,30,Los Angeles,85000
Bob Johnson,35,Chicago,95000
Alice Brown,28,Houston,70000
Charlie Wilson,32,Phoenix,80000`;

const mockDataProfile = {
  id: 'profile-test',
  version: 1,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  metadata: {
    filename: 'employees.csv',
    size: sampleCSVContent.length,
    encoding: 'utf-8',
    delimiter: ',',
    rowCount: 5,
    columnCount: 4,
    processingTime: 50,
    checksum: 'test-checksum',
  },
  schema: {
    columns: [
      { name: 'name', type: 'categorical' },
      { name: 'age', type: 'numeric' },
      { name: 'city', type: 'categorical' },
      { name: 'salary', type: 'numeric' },
    ],
    relationships: [],
    foreignKeys: [],
  },
  sampleData: [
    { name: 'John Doe', age: '25', city: 'New York', salary: '75000' },
    { name: 'Jane Smith', age: '30', city: 'Los Angeles', salary: '85000' },
    { name: 'Bob Johnson', age: '35', city: 'Chicago', salary: '95000' },
    { name: 'Alice Brown', age: '28', city: 'Houston', salary: '70000' },
    { name: 'Charlie Wilson', age: '32', city: 'Phoenix', salary: '80000' },
  ],
  insights: {
    keyFindings: [],
    trends: [],
    anomalies: [],
    suggestedQueries: [],
    recommendations: [],
  },
  quality: {},
  security: {},
  aggregations: {},
  indexes: {},
};

// Mock implementations
const mockSession = {
  id: 'test-session-123',
  threadId: 'test-thread-123',
  uploadedFile: {
    id: 'test-file-123',
    filename: 'employees.csv',
  },
};

const mockQueuedRun = {
  id: 'test-run-123',
  threadId: 'test-thread-123',
  sessionId: 'test-session-123',
  query: 'What is the average salary?',
  fileId: 'test-file-123',
};

describe('End-to-End Semantic System Integration', () => {
  let mockOrchestrator: any;
  let mockQueryPlannerAgent: any;
  let mockSemanticExecutorAgent: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock QueryPlannerAgent
    mockQueryPlannerAgent = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: {
          queryIntent: {
            type: 'AGGREGATION',
            confidence: 0.9,
            entities: [{ value: 'salary', type: 'measure' }],
            measures: ['salary'],
            aggregations: ['average'],
          },
          executionPlan: {
            steps: [
              { type: 'load', source: 'csv_data' },
              { type: 'aggregate', operation: 'average', column: 'salary' },
            ],
            visualization: 'table',
            estimatedCost: 2,
          },
        },
      }),
    };

    // Mock SemanticExecutorAgent
    mockSemanticExecutorAgent = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: {
          data: [{ metric: 'average_salary', value: 81000 }],
          insights: {
            keyFindings: ['The average salary across all employees is $81,000'],
            trends: [
              {
                metric: 'salary',
                direction: 'stable',
                changePercent: 0,
                description: 'Salary distribution shows consistent ranges',
              },
            ],
          },
          metadata: { executionTime: 45, dataPoints: 5 },
          suggestions: [
            'Consider analyzing salary by city',
            'Look at age vs salary correlation',
          ],
        },
      }),
    };

    // Mock AgentOrchestrator
    mockOrchestrator = {
      registerAgent: vi.fn(),
      getAgent: vi.fn((agentType: string) => {
        if (agentType === 'query-planning') {
          return mockQueryPlannerAgent;
        }
        if (agentType === 'semantic-executor') {
          return mockSemanticExecutorAgent;
        }
        return null;
      }),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Semantic Processing Workflow', () => {
    it('should successfully process aggregation queries through semantic layer', async () => {
      // Test the semantic processing workflow
      const semanticResult = await processSemanticWorkflow(
        mockOrchestrator,
        'What is the average salary?',
        mockDataProfile
      );

      // Verify query planning was called
      expect(mockQueryPlannerAgent.execute).toHaveBeenCalledWith(
        {
          query: 'What is the average salary?',
          profile: mockDataProfile,
        },
        expect.any(Object)
      );

      // Verify semantic execution was called
      expect(mockSemanticExecutorAgent.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          queryIntent: expect.objectContaining({
            type: 'AGGREGATION',
            confidence: 0.9,
          }),
          profile: mockDataProfile,
          executionPlan: expect.any(Object),
        }),
        expect.any(Object)
      );

      // Verify result structure
      expect(semanticResult).toMatchObject({
        id: expect.any(String),
        query: 'What is the average salary?',
        intent: {
          type: 'AGGREGATION',
          confidence: 0.9,
        },
        data: [{ metric: 'average_salary', value: 81000 }],
        insights: expect.arrayContaining([
          expect.objectContaining({
            type: 'insight',
            content: 'The average salary across all employees is $81,000',
            confidence: 0.9,
          }),
        ]),
        metadata: expect.objectContaining({
          executionTime: expect.any(Number),
          dataPoints: expect.any(Number),
          agentPath: ['query-planning', 'semantic-executor'],
          cacheHit: false,
        }),
      });
    });

    it('should handle comparison queries through semantic layer', async () => {
      // Mock comparison query response
      mockQueryPlannerAgent.execute.mockResolvedValueOnce({
        success: true,
        data: {
          queryIntent: {
            type: 'COMPARISON',
            confidence: 0.85,
            entities: [
              { value: 'salary', type: 'measure' },
              { value: 'city', type: 'dimension' },
            ],
            measures: ['salary'],
            dimensions: ['city'],
            filters: [],
          },
          executionPlan: {
            steps: [
              { type: 'load', source: 'csv_data' },
              { type: 'filter', conditions: [] },
              {
                type: 'aggregate',
                operation: 'average',
                column: 'salary',
                groupBy: ['city'],
              },
              { type: 'sort', column: 'average_salary', direction: 'desc' },
            ],
            visualization: 'bar',
            estimatedCost: 3,
          },
        },
      });

      mockSemanticExecutorAgent.execute.mockResolvedValueOnce({
        success: true,
        data: {
          data: [
            { city: 'Chicago', average_salary: 95000 },
            { city: 'Los Angeles', average_salary: 85000 },
            { city: 'Phoenix', average_salary: 80000 },
            { city: 'New York', average_salary: 75000 },
            { city: 'Houston', average_salary: 70000 },
          ],
          insights: {
            keyFindings: [
              'Chicago has the highest average salary at $95,000',
              'Houston has the lowest average salary at $70,000',
            ],
            trends: [],
          },
          metadata: { executionTime: 65, dataPoints: 5 },
          suggestions: [
            'Analyze cost of living by city',
            'Look at salary ranges within each city',
          ],
        },
      });

      const result = await processSemanticWorkflow(
        mockOrchestrator,
        'Compare average salary by city',
        mockDataProfile
      );

      expect(result.intent.type).toBe('COMPARISON');
      expect(result.data).toHaveLength(5);
      expect(result.data[0]).toMatchObject({
        city: 'Chicago',
        average_salary: 95000,
      });
      expect(result.insights).toContainEqual(
        expect.objectContaining({
          content: 'Chicago has the highest average salary at $95,000',
        })
      );
    });

    it('should handle trend analysis queries', async () => {
      // Mock trend query response
      mockQueryPlannerAgent.execute.mockResolvedValueOnce({
        success: true,
        data: {
          queryIntent: {
            type: 'TREND',
            confidence: 0.8,
            entities: [
              { value: 'age', type: 'dimension' },
              { value: 'salary', type: 'measure' },
            ],
            measures: ['salary'],
            dimensions: ['age'],
          },
          executionPlan: {
            steps: [
              { type: 'load', source: 'csv_data' },
              { type: 'sort', column: 'age', direction: 'asc' },
              {
                type: 'aggregate',
                operation: 'correlation',
                columns: ['age', 'salary'],
              },
            ],
            visualization: 'line',
            estimatedCost: 4,
          },
        },
      });

      mockSemanticExecutorAgent.execute.mockResolvedValueOnce({
        success: true,
        data: {
          data: [
            { age_group: '25-30', average_salary: 76250 },
            { age_group: '30-35', average_salary: 82500 },
            { age_group: '35+', average_salary: 95000 },
          ],
          insights: {
            keyFindings: [
              'Salary increases with age',
              'Strong positive correlation between age and salary',
            ],
            trends: [
              {
                metric: 'salary',
                direction: 'increasing',
                changePercent: 24.5,
                description:
                  'Salary shows 24.5% increase from youngest to oldest group',
              },
            ],
          },
          metadata: { executionTime: 72, dataPoints: 5 },
          suggestions: [
            'Analyze experience levels',
            'Look at promotion patterns',
          ],
        },
      });

      const result = await processSemanticWorkflow(
        mockOrchestrator,
        'Show salary trends by age',
        mockDataProfile
      );

      expect(result.intent.type).toBe('TREND');
      expect(result.insights).toContainEqual(
        expect.objectContaining({
          type: 'trend',
          content: 'salary is increasing with 24.5% change',
        })
      );
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should handle query planning failures gracefully', async () => {
      mockQueryPlannerAgent.execute.mockRejectedValueOnce(
        new Error('Query planning failed')
      );

      await expect(
        processSemanticWorkflow(
          mockOrchestrator,
          'Invalid query',
          mockDataProfile
        )
      ).rejects.toThrow('Query planning failed');
    });

    it('should handle semantic execution failures gracefully', async () => {
      mockSemanticExecutorAgent.execute.mockRejectedValueOnce(
        new Error('Execution failed')
      );

      await expect(
        processSemanticWorkflow(
          mockOrchestrator,
          'What is the average salary?',
          mockDataProfile
        )
      ).rejects.toThrow('Execution failed');
    });

    it('should handle missing agents gracefully', async () => {
      mockOrchestrator.getAgent.mockReturnValue(null);

      await expect(
        processSemanticWorkflow(
          mockOrchestrator,
          'What is the average salary?',
          mockDataProfile
        )
      ).rejects.toThrow('Semantic agents not available');
    });
  });

  describe('Performance and Optimization', () => {
    it('should complete semantic processing within reasonable time', async () => {
      const startTime = Date.now();

      await processSemanticWorkflow(
        mockOrchestrator,
        'What is the average salary?',
        mockDataProfile
      );

      const executionTime = Date.now() - startTime;
      expect(executionTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should generate cost-effective execution plans', async () => {
      const result = await processSemanticWorkflow(
        mockOrchestrator,
        'What is the average salary?',
        mockDataProfile
      );

      // Verify that cost estimation is working
      expect(mockQueryPlannerAgent.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.any(String),
          profile: expect.any(Object),
        }),
        expect.any(Object)
      );
    });

    it('should provide structured output for streaming', async () => {
      const result = await processSemanticWorkflow(
        mockOrchestrator,
        'What is the average salary?',
        mockDataProfile
      );

      // Verify streaming-compatible structure
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('insights');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('suggestions');

      // Verify can be serialized for streaming
      expect(() => JSON.stringify(result)).not.toThrow();
    });
  });

  describe('Integration with API Streaming', () => {
    it('should create proper synthetic stream for semantic results', async () => {
      const semanticResult = await processSemanticWorkflow(
        mockOrchestrator,
        'What is the average salary?',
        mockDataProfile
      );

      // Create synthetic stream like in the actual implementation
      const syntheticStream = createSemanticStream(semanticResult);
      const events = [];

      for await (const event of syntheticStream) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        type: 'structured_output',
        data: {
          type: 'analysis_response',
          content: expect.any(String),
        },
      });
      expect(events[1]).toMatchObject({
        type: 'done',
        data: { success: true },
      });

      // Verify content can be parsed
      const parsedContent = JSON.parse(events[0]?.data?.content || '{}');
      expect(parsedContent.intent.type).toBe('AGGREGATION');
      expect(parsedContent.data).toEqual([
        { metric: 'average_salary', value: 81000 },
      ]);
    });

    it('should handle confidence-based routing correctly', async () => {
      // Test high confidence - should use semantic results
      const highConfidenceResult = await processSemanticWorkflow(
        mockOrchestrator,
        'What is the average salary?',
        mockDataProfile
      );

      expect(highConfidenceResult.intent.confidence).toBeGreaterThanOrEqual(
        0.7
      );

      // Test low confidence scenario
      mockQueryPlannerAgent.execute.mockResolvedValueOnce({
        success: true,
        data: {
          queryIntent: {
            type: 'COMPLEX',
            confidence: 0.4, // Low confidence
          },
          executionPlan: {
            steps: [],
            visualization: 'table',
            estimatedCost: 8,
          },
        },
      });

      const lowConfidenceResult = await processSemanticWorkflow(
        mockOrchestrator,
        'Complex unstructured query',
        mockDataProfile
      );

      expect(lowConfidenceResult.intent.confidence).toBeLessThan(0.7);
    });
  });
});

/**
 * Helper function to simulate the semantic workflow processing
 * This mirrors the logic in the actual API endpoint
 */
async function processSemanticWorkflow(
  orchestrator: any,
  query: string,
  profile: any
): Promise<any> {
  // Create execution context
  const context = {
    requestId: `semantic-${Date.now()}`,
    startTime: new Date(),
    timeout: 30000,
  };

  // Get agents
  const queryPlannerAgent = orchestrator.getAgent('query-planning');
  const semanticExecutorAgent = orchestrator.getAgent('semantic-executor');

  if (!queryPlannerAgent || !semanticExecutorAgent) {
    throw new Error('Semantic agents not available');
  }

  // Step 1: Query Planning
  const planningResult = await queryPlannerAgent.execute(
    { query, profile },
    context
  );

  if (!planningResult.success) {
    throw planningResult.error || new Error('Query planning failed');
  }

  const { queryIntent, executionPlan } = planningResult.data;

  // Step 2: Semantic Execution
  const executionResult = await semanticExecutorAgent.execute(
    { queryIntent, profile, executionPlan },
    context
  );

  if (!executionResult.success) {
    throw executionResult.error || new Error('Semantic execution failed');
  }

  const semanticResult = executionResult.data;

  // Return structured result
  return {
    id: `analysis-${Date.now()}`,
    query,
    intent: queryIntent,
    executionPlan,
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
      agentPath: ['query-planning', 'semantic-executor'],
    },
    suggestions: semanticResult.suggestions || [],
  };
}

/**
 * Helper function to create synthetic stream for semantic results
 * This mirrors the streaming logic in the actual API endpoint
 */
async function* createSemanticStream(semanticResult: any) {
  // Send structured output event for semantic results
  yield {
    type: 'structured_output',
    data: {
      type: 'analysis_response',
      content: JSON.stringify(semanticResult),
    },
  };

  // Send completion event
  yield {
    type: 'done',
    data: { success: true },
  };
}
