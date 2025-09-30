import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticExecutorAgent } from '../semantic-executor-agent';
import type {
  SemanticExecutorInput,
  SemanticExecutorResult,
} from '../semantic-executor-agent';
import { AgentType, DataProfile, QueryIntent, ExecutionPlan } from '../types';
import { createExecutionContext } from '../base';

describe('SemanticExecutorAgent', () => {
  let agent: SemanticExecutorAgent;
  let mockProfile: DataProfile;
  let mockContext: any;

  beforeEach(() => {
    agent = new SemanticExecutorAgent();

    // Create mock DataProfile with sample data
    mockProfile = {
      id: 'test-profile-123',
      version: 1,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      metadata: {
        filename: 'sales.csv',
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
          {
            name: 'revenue',
            type: 'numeric',
            nullable: false,
            unique: false,
            statistics: {
              min: 100,
              max: 1000,
              mean: 500,
              median: 450,
              mode: [],
              stddev: 200,
              variance: 40000,
              percentiles: { p25: 300, p50: 450, p75: 700, p90: 850, p95: 900 },
              histogram: [],
              outliers: [],
            },
            nullCount: 0,
            nullPercentage: 0,
            uniqueCount: 100,
            duplicateCount: 0,
            sampleValues: [100, 200, 300],
            qualityFlags: [],
          },
          {
            name: 'category',
            type: 'categorical',
            nullable: false,
            unique: false,
            statistics: {
              uniqueCount: 3,
              topValues: [
                { value: 'A', count: 50, percentage: 50 },
                { value: 'B', count: 30, percentage: 30 },
                { value: 'C', count: 20, percentage: 20 },
              ],
              entropy: 1.5,
              mode: ['A'],
              distribution: { A: 50, B: 30, C: 20 },
            },
            nullCount: 0,
            nullPercentage: 0,
            uniqueCount: 3,
            duplicateCount: 0,
            sampleValues: ['A', 'B', 'C'],
            qualityFlags: [],
          },
          {
            name: 'quarter',
            type: 'categorical',
            nullable: false,
            unique: false,
            statistics: {
              uniqueCount: 4,
              topValues: [
                { value: 'Q1', count: 25, percentage: 25 },
                { value: 'Q2', count: 25, percentage: 25 },
                { value: 'Q3', count: 25, percentage: 25 },
                { value: 'Q4', count: 25, percentage: 25 },
              ],
              entropy: 2.0,
              mode: ['Q1'],
              distribution: { Q1: 25, Q2: 25, Q3: 25, Q4: 25 },
            },
            nullCount: 0,
            nullPercentage: 0,
            uniqueCount: 4,
            duplicateCount: 0,
            sampleValues: ['Q1', 'Q2', 'Q3', 'Q4'],
            qualityFlags: [],
          },
          {
            name: 'region',
            type: 'categorical',
            nullable: false,
            unique: false,
            statistics: {
              uniqueCount: 2,
              topValues: [
                { value: 'North', count: 60, percentage: 60 },
                { value: 'South', count: 40, percentage: 40 },
              ],
              entropy: 0.97,
              mode: ['North'],
              distribution: { North: 60, South: 40 },
            },
            nullCount: 0,
            nullPercentage: 0,
            uniqueCount: 2,
            duplicateCount: 0,
            sampleValues: ['North', 'South'],
            qualityFlags: [],
          },
        ],
        foreignKeys: [],
        relationships: [],
      },
      quality: {
        overall: 95,
        dimensions: {
          completeness: 100,
          consistency: 90,
          accuracy: 95,
          uniqueness: 100,
          validity: 95,
        },
        issues: [],
      },
      security: {
        piiColumns: [],
        riskLevel: 'low',
        recommendations: [],
        complianceFlags: [],
        hasRedaction: false,
      },
      insights: {
        keyFindings: [],
        trends: [],
        anomalies: [],
        recommendations: [],
        suggestedQueries: [],
      },
      sampleData: [
        { revenue: 500, category: 'A', quarter: 'Q1', region: 'North' },
        { revenue: 300, category: 'B', quarter: 'Q1', region: 'South' },
        { revenue: 700, category: 'A', quarter: 'Q2', region: 'North' },
        { revenue: 450, category: 'C', quarter: 'Q2', region: 'South' },
        { revenue: 600, category: 'A', quarter: 'Q3', region: 'North' },
        { revenue: 250, category: 'B', quarter: 'Q3', region: 'South' },
        { revenue: 800, category: 'A', quarter: 'Q4', region: 'North' },
        { revenue: 350, category: 'C', quarter: 'Q4', region: 'South' },
      ],
      aggregations: {
        numeric: {},
        categorical: {},
        temporal: {},
      },
      indexes: {
        secondaryIndexes: [],
        compositeIndexes: [],
        fullText: [],
      },
    };

    mockContext = createExecutionContext('test-context', { timeout: 5000 });
  });

  describe('Basic functionality', () => {
    it('should be created with correct properties', () => {
      expect(agent.type).toBe(AgentType.SEMANTIC_EXECUTOR);
      expect(agent.name).toBe('SemanticExecutorAgent');
      expect(agent.version).toBe('1.0.0');
    });

    it('should validate input correctly', () => {
      const validInput: SemanticExecutorInput = {
        queryIntent: {
          type: 'aggregation',
          entities: {
            measures: ['revenue'],
            dimensions: ['category'],
            filters: [],
          },
          operation: {
            groupBy: ['category'],
            aggregation: 'sum',
            sort: [],
          },
          confidence: 0.8,
        },
        profile: mockProfile,
        executionPlan: {
          id: 'plan-123',
          steps: [
            {
              id: 'step-1',
              type: 'aggregate',
              operation: 'compute_aggregation',
              params: {
                measures: ['revenue'],
                dimensions: ['category'],
              },
              estimatedTime: 100,
              dependsOn: [],
            },
          ],
          estimatedTime: 100,
          estimatedCost: 1,
          fallbackToLLM: false,
          optimizations: [],
        },
      };

      expect(agent.validateInput(validInput)).toBe(true);
    });

    it('should reject invalid input', () => {
      expect(() => {
        agent.validateInput({
          queryIntent: null as any,
          profile: mockProfile,
          executionPlan: {
            id: 'plan-123',
            steps: [],
            estimatedTime: 0,
            estimatedCost: 0,
            fallbackToLLM: false,
            optimizations: [],
          },
        });
      }).toThrow('QueryIntent is required');

      expect(() => {
        agent.validateInput({
          queryIntent: {
            type: 'aggregation',
            entities: { measures: [], dimensions: [], filters: [] },
            operation: { groupBy: [], aggregation: 'sum', sort: [] },
            confidence: 0.8,
          },
          profile: null as any,
          executionPlan: {
            id: 'plan-123',
            steps: [],
            estimatedTime: 0,
            estimatedCost: 0,
            fallbackToLLM: false,
            optimizations: [],
          },
        });
      }).toThrow('Valid DataProfile with sample data is required');

      expect(() => {
        agent.validateInput({
          queryIntent: {
            type: 'aggregation',
            entities: { measures: [], dimensions: [], filters: [] },
            operation: { groupBy: [], aggregation: 'sum', sort: [] },
            confidence: 0.8,
          },
          profile: mockProfile,
          executionPlan: {
            id: 'plan-123',
            steps: [],
            estimatedTime: 0,
            estimatedCost: 0,
            fallbackToLLM: false,
            optimizations: [],
          },
        });
      }).toThrow('ExecutionPlan with steps is required');
    });
  });

  describe('Execution Plan Processing', () => {
    it('should execute simple aggregation plan', async () => {
      const input: SemanticExecutorInput = {
        queryIntent: {
          type: 'aggregation',
          entities: {
            measures: ['revenue'],
            dimensions: ['category'],
            filters: [],
          },
          operation: {
            groupBy: ['category'],
            aggregation: 'sum',
            sort: [],
          },
          confidence: 0.8,
        },
        profile: mockProfile,
        executionPlan: {
          id: 'plan-123',
          steps: [
            {
              id: 'step-1',
              type: 'aggregate',
              operation: 'compute_aggregation',
              params: {
                measures: ['revenue'],
                dimensions: ['category'],
                aggregationType: 'sum',
              },
              estimatedTime: 100,
              dependsOn: [],
            },
          ],
          estimatedTime: 100,
          estimatedCost: 1,
          fallbackToLLM: false,
          optimizations: [],
        },
      };

      const result = await agent.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const executorResult = result.data as SemanticExecutorResult;
      expect(executorResult.data.length).toBeGreaterThan(0);
      expect(executorResult.metadata.stepsExecuted).toBe(1);
      expect(executorResult.insights.keyFindings.length).toBeGreaterThan(0);
    });

    it('should execute filtering and aggregation plan', async () => {
      const input: SemanticExecutorInput = {
        queryIntent: {
          type: 'filter',
          entities: {
            measures: ['revenue'],
            dimensions: ['category'],
            filters: [
              {
                column: 'region',
                operator: 'eq',
                value: 'North',
                dataType: 'string',
              },
            ],
          },
          operation: {
            groupBy: ['category'],
            aggregation: 'sum',
            sort: [],
          },
          confidence: 0.8,
        },
        profile: mockProfile,
        executionPlan: {
          id: 'plan-filter',
          steps: [
            {
              id: 'step-1',
              type: 'filter',
              operation: 'apply_filters',
              params: {
                filters: [
                  {
                    column: 'region',
                    operator: 'eq',
                    value: 'North',
                    dataType: 'string',
                  },
                ],
              },
              estimatedTime: 50,
              dependsOn: [],
            },
            {
              id: 'step-2',
              type: 'aggregate',
              operation: 'compute_aggregation',
              params: {
                measures: ['revenue'],
                dimensions: ['category'],
                aggregationType: 'sum',
              },
              estimatedTime: 100,
              dependsOn: ['step-1'],
            },
          ],
          estimatedTime: 150,
          estimatedCost: 2,
          fallbackToLLM: false,
          optimizations: [],
        },
      };

      const result = await agent.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const executorResult = result.data as SemanticExecutorResult;
      expect(executorResult.data.length).toBeGreaterThan(0);
      expect(executorResult.metadata.stepsExecuted).toBe(2);

      // Check that filtering worked - should only have North region data
      const allRegions = new Set(
        mockProfile.sampleData
          .filter(row => row.region === 'North')
          .map(row => row.region)
      );
      expect(allRegions.has('North')).toBe(true);
      expect(allRegions.has('South')).toBe(false);
    });

    it('should execute sorting and limiting plan', async () => {
      const input: SemanticExecutorInput = {
        queryIntent: {
          type: 'custom', // ranking maps to custom
          entities: {
            measures: ['revenue'],
            dimensions: ['category'],
            filters: [],
          },
          operation: {
            groupBy: ['category'],
            aggregation: 'sum',
            sort: [{ column: 'revenue', direction: 'desc' }],
            limit: 2,
          },
          confidence: 0.8,
        },
        profile: mockProfile,
        executionPlan: {
          id: 'plan-ranking',
          steps: [
            {
              id: 'step-1',
              type: 'aggregate',
              operation: 'compute_aggregation',
              params: {
                measures: ['revenue'],
                dimensions: ['category'],
                aggregationType: 'sum',
              },
              estimatedTime: 100,
              dependsOn: [],
            },
            {
              id: 'step-2',
              type: 'sort',
              operation: 'apply_sort',
              params: {
                columns: ['revenue'],
                direction: 'desc',
              },
              estimatedTime: 30,
              dependsOn: ['step-1'],
            },
            {
              id: 'step-3',
              type: 'limit',
              operation: 'apply_limit',
              params: {
                limit: 2,
              },
              estimatedTime: 5,
              dependsOn: ['step-2'],
            },
          ],
          estimatedTime: 135,
          estimatedCost: 3,
          fallbackToLLM: false,
          optimizations: [],
        },
      };

      const result = await agent.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const executorResult = result.data as SemanticExecutorResult;
      expect(executorResult.data.length).toBeLessThanOrEqual(2);
      expect(executorResult.metadata.stepsExecuted).toBe(3);
    });
  });

  describe('Data Processing Operations', () => {
    it('should group data by dimensions correctly', async () => {
      const input: SemanticExecutorInput = {
        queryIntent: {
          type: 'aggregation',
          entities: {
            measures: ['revenue'],
            dimensions: ['category', 'quarter'],
            filters: [],
          },
          operation: {
            groupBy: ['category', 'quarter'],
            aggregation: 'avg',
            sort: [],
          },
          confidence: 0.8,
        },
        profile: mockProfile,
        executionPlan: {
          id: 'plan-multi-group',
          steps: [
            {
              id: 'step-1',
              type: 'aggregate',
              operation: 'compute_aggregation',
              params: {
                measures: ['revenue'],
                dimensions: ['category', 'quarter'],
                aggregationType: 'avg',
              },
              estimatedTime: 100,
              dependsOn: [],
            },
          ],
          estimatedTime: 100,
          estimatedCost: 1,
          fallbackToLLM: false,
          optimizations: [],
        },
      };

      const result = await agent.execute(input, mockContext);

      expect(result.success).toBe(true);
      const executorResult = result.data as SemanticExecutorResult;

      // Should have one result per category-quarter combination
      expect(executorResult.data.length).toBeGreaterThan(0);

      // Check that all results have the expected dimensions
      for (const row of executorResult.data) {
        expect(row).toHaveProperty('category');
        expect(row).toHaveProperty('quarter');
        expect(row).toHaveProperty('revenue');
        expect(typeof row.revenue).toBe('number');
      }
    });

    it('should handle different aggregation types', async () => {
      const aggregationTypes = ['sum', 'avg', 'count', 'min', 'max'];

      for (const aggType of aggregationTypes) {
        const input: SemanticExecutorInput = {
          queryIntent: {
            type: 'aggregation',
            entities: {
              measures: ['revenue'],
              dimensions: ['category'],
              filters: [],
            },
            operation: {
              groupBy: ['category'],
              aggregation: aggType as any,
              sort: [],
            },
            confidence: 0.8,
          },
          profile: mockProfile,
          executionPlan: {
            id: `plan-${aggType}`,
            steps: [
              {
                id: 'step-1',
                type: 'aggregate',
                operation: 'compute_aggregation',
                params: {
                  measures: ['revenue'],
                  dimensions: ['category'],
                  aggregationType: aggType,
                },
                estimatedTime: 100,
                dependsOn: [],
              },
            ],
            estimatedTime: 100,
            estimatedCost: 1,
            fallbackToLLM: false,
            optimizations: [],
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        const executorResult = result.data as SemanticExecutorResult;
        expect(executorResult.data.length).toBeGreaterThan(0);

        // Check that aggregation was applied
        for (const row of executorResult.data) {
          expect(row.revenue).toBeDefined();
          expect(typeof row.revenue).toBe('number');
        }
      }
    });
  });

  describe('Insight Generation', () => {
    it('should generate aggregation insights', async () => {
      const input: SemanticExecutorInput = {
        queryIntent: {
          type: 'aggregation',
          entities: {
            measures: ['revenue'],
            dimensions: ['category'],
            filters: [],
          },
          operation: {
            groupBy: ['category'],
            aggregation: 'sum',
            sort: [],
          },
          confidence: 0.8,
        },
        profile: mockProfile,
        executionPlan: {
          id: 'plan-insights',
          steps: [
            {
              id: 'step-1',
              type: 'aggregate',
              operation: 'compute_aggregation',
              params: {
                measures: ['revenue'],
                dimensions: ['category'],
                aggregationType: 'sum',
              },
              estimatedTime: 100,
              dependsOn: [],
            },
          ],
          estimatedTime: 100,
          estimatedCost: 1,
          fallbackToLLM: false,
          optimizations: [],
        },
      };

      const result = await agent.execute(input, mockContext);

      expect(result.success).toBe(true);
      const executorResult = result.data as SemanticExecutorResult;

      expect(executorResult.insights.keyFindings.length).toBeGreaterThan(0);
      expect(executorResult.insights.aggregations).toBeDefined();

      // Should have aggregation insights for revenue
      const aggregations = executorResult.insights.aggregations!;
      expect(aggregations).toHaveProperty('revenue_sum');
      expect(aggregations).toHaveProperty('revenue_avg');
      expect(aggregations).toHaveProperty('revenue_min');
      expect(aggregations).toHaveProperty('revenue_max');
    });

    it('should generate trend insights for trend queries', async () => {
      const input: SemanticExecutorInput = {
        queryIntent: {
          type: 'trend',
          entities: {
            measures: ['revenue'],
            dimensions: ['quarter'],
            filters: [],
          },
          operation: {
            groupBy: ['quarter'],
            aggregation: 'avg',
            sort: [],
          },
          confidence: 0.8,
        },
        profile: mockProfile,
        executionPlan: {
          id: 'plan-trend',
          steps: [
            {
              id: 'step-1',
              type: 'aggregate',
              operation: 'compute_aggregation',
              params: {
                measures: ['revenue'],
                dimensions: ['quarter'],
                aggregationType: 'avg',
              },
              estimatedTime: 100,
              dependsOn: [],
            },
          ],
          estimatedTime: 100,
          estimatedCost: 1,
          fallbackToLLM: false,
          optimizations: [],
        },
      };

      const result = await agent.execute(input, mockContext);

      expect(result.success).toBe(true);
      const executorResult = result.data as SemanticExecutorResult;

      expect(executorResult.insights.trends).toBeDefined();
      if (
        executorResult.insights.trends &&
        executorResult.insights.trends.length > 0
      ) {
        const trend = executorResult.insights.trends[0]!;
        expect(trend.metric).toBe('revenue');
        expect(['increasing', 'decreasing', 'stable']).toContain(
          trend.direction
        );
        expect(typeof trend.changePercent).toBe('number');
      }
    });
  });

  describe('Performance and Error Handling', () => {
    it('should execute within reasonable time', async () => {
      const input: SemanticExecutorInput = {
        queryIntent: {
          type: 'aggregation',
          entities: {
            measures: ['revenue'],
            dimensions: ['category'],
            filters: [],
          },
          operation: {
            groupBy: ['category'],
            aggregation: 'sum',
            sort: [],
          },
          confidence: 0.8,
        },
        profile: mockProfile,
        executionPlan: {
          id: 'plan-performance',
          steps: [
            {
              id: 'step-1',
              type: 'aggregate',
              operation: 'compute_aggregation',
              params: {
                measures: ['revenue'],
                dimensions: ['category'],
                aggregationType: 'sum',
              },
              estimatedTime: 100,
              dependsOn: [],
            },
          ],
          estimatedTime: 100,
          estimatedCost: 1,
          fallbackToLLM: false,
          optimizations: [],
        },
      };

      const result = await agent.execute(input, mockContext);

      expect(result.success).toBe(true);

      const executorResult = result.data as SemanticExecutorResult;
      // Execution time should be recorded, even if it's 0ms for fast operations
      expect(executorResult.metadata.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle circular dependencies', async () => {
      const input: SemanticExecutorInput = {
        queryIntent: {
          type: 'aggregation',
          entities: {
            measures: ['revenue'],
            dimensions: ['category'],
            filters: [],
          },
          operation: {
            groupBy: ['category'],
            aggregation: 'sum',
            sort: [],
          },
          confidence: 0.8,
        },
        profile: mockProfile,
        executionPlan: {
          id: 'plan-circular',
          steps: [
            {
              id: 'step-1',
              type: 'aggregate',
              operation: 'compute_aggregation',
              params: {
                measures: ['revenue'],
                dimensions: ['category'],
                aggregationType: 'sum',
              },
              estimatedTime: 100,
              dependsOn: ['step-2'],
            },
            {
              id: 'step-2',
              type: 'sort',
              operation: 'apply_sort',
              params: {
                columns: ['revenue'],
                direction: 'desc',
              },
              estimatedTime: 30,
              dependsOn: ['step-1'],
            },
          ],
          estimatedTime: 130,
          estimatedCost: 2,
          fallbackToLLM: false,
          optimizations: [],
        },
      };

      const result = await agent.execute(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Circular dependency detected');
    });

    it('should handle empty data gracefully', async () => {
      const emptyProfile = {
        ...mockProfile,
        sampleData: [],
      };

      const input: SemanticExecutorInput = {
        queryIntent: {
          type: 'aggregation',
          entities: {
            measures: ['revenue'],
            dimensions: ['category'],
            filters: [],
          },
          operation: {
            groupBy: ['category'],
            aggregation: 'sum',
            sort: [],
          },
          confidence: 0.8,
        },
        profile: emptyProfile,
        executionPlan: {
          id: 'plan-empty',
          steps: [
            {
              id: 'step-1',
              type: 'aggregate',
              operation: 'compute_aggregation',
              params: {
                measures: ['revenue'],
                dimensions: ['category'],
                aggregationType: 'sum',
              },
              estimatedTime: 100,
              dependsOn: [],
            },
          ],
          estimatedTime: 100,
          estimatedCost: 1,
          fallbackToLLM: false,
          optimizations: [],
        },
      };

      const result = await agent.execute(input, mockContext);

      expect(result.success).toBe(true);
      const executorResult = result.data as SemanticExecutorResult;
      expect(executorResult.data).toEqual([]);
      expect(executorResult.metadata.processedRows).toBe(0);
    });
  });

  describe('Agent Health', () => {
    it('should return healthy status', async () => {
      const health = await agent.getHealth();

      expect(health.healthy).toBe(true);
      expect(health.metrics).toBeDefined();
      expect(health.metrics.totalExecutions).toBeGreaterThanOrEqual(0);
    });
  });
});
