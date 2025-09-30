/**
 * Chart Agent Tests
 *
 * Comprehensive test suite for chart generation agent with
 * intelligent recommendation, SVG generation, and accessibility features.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChartAgent, ChartAgentInput, ChartAgentResult } from '../chart-agent';
import { ChartType } from '../utils/chart-recommendation';
import { AgentExecutionContext } from '../types';

describe('ChartAgent', () => {
  let chartAgent: ChartAgent;
  let mockContext: AgentExecutionContext;

  beforeEach(() => {
    chartAgent = new ChartAgent();
    mockContext = {
      requestId: 'test-request-123',
      userId: 'test-user',
      sessionId: 'test-session',
      startTime: new Date(),
      timeout: 10000,
    };
  });

  describe('Basic Functionality', () => {
    it('should create chart agent with correct properties', () => {
      expect(chartAgent.type).toBe('chart');
      expect(chartAgent.name).toBe('ChartAgent');
      expect(chartAgent.version).toBe('1.0.0');
    });

    it('should validate input correctly', () => {
      const validInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'category',
              type: 'string',
              values: ['A', 'B', 'C'],
            },
            {
              name: 'value',
              type: 'number',
              values: [10, 20, 30],
            },
          ],
          rowCount: 3,
        },
      };

      expect(chartAgent.validateInput(validInput)).toBe(true);
    });

    it('should reject invalid input', () => {
      const invalidInput = {
        data: {
          columns: [],
          rowCount: 0,
        },
      } as ChartAgentInput;

      expect(chartAgent.validateInput(invalidInput)).toBe(false);
    });
  });

  describe('Chart Recommendation', () => {
    it('should generate bar chart for categorical + numeric data', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'product',
              type: 'string',
              values: ['Laptop', 'Phone', 'Tablet', 'Watch'],
            },
            {
              name: 'sales',
              type: 'number',
              values: [1200, 800, 600, 400],
            },
          ],
          rowCount: 4,
        },
      };

      const result = await chartAgent.execute(testInput, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.chart).toBeDefined();
      expect(result.data?.chart?.recommendation.type).toBe(ChartType.BAR);
      expect(result.data?.chart?.svg).toContain('<svg');
      expect(result.data?.chart?.accessibility).toBeDefined();
    });

    it('should generate line chart for time series data', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'date',
              type: 'date',
              values: [
                new Date('2024-01-01'),
                new Date('2024-02-01'),
                new Date('2024-03-01'),
              ],
            },
            {
              name: 'revenue',
              type: 'number',
              values: [1000, 1200, 1100],
            },
          ],
          rowCount: 3,
        },
      };

      const result = await chartAgent.execute(testInput, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.chart?.recommendation.type).toBe(ChartType.LINE);
    });

    it('should generate pie chart for single categorical distribution', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'category',
              type: 'string',
              values: ['A', 'A', 'B', 'B', 'B', 'C'],
            },
          ],
          rowCount: 6,
        },
      };

      const result = await chartAgent.execute(testInput, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.chart?.recommendation.type).toBe(ChartType.PIE);
    });

    it('should use manual chart type when provided', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'category',
              type: 'string',
              values: ['A', 'B', 'C'],
            },
            {
              name: 'value',
              type: 'number',
              values: [10, 20, 30],
            },
          ],
          rowCount: 3,
        },
        chartType: ChartType.SCATTER, // Force scatter chart
      };

      const result = await chartAgent.execute(testInput, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.chart?.recommendation.type).toBe(ChartType.SCATTER);
      expect(result.data?.chart?.recommendation.confidence).toBe(0.8); // Manual gets high confidence
    });
  });

  describe('SVG Generation', () => {
    it('should generate valid SVG with accessibility features', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'month',
              type: 'string',
              values: ['Jan', 'Feb', 'Mar'],
            },
            {
              name: 'revenue',
              type: 'number',
              values: [1000, 1200, 1100],
            },
          ],
          rowCount: 3,
        },
        accessibilityOptions: {
          colorBlindSafe: true,
          patterns: true,
          highContrast: false,
        },
      };

      const result = await chartAgent.execute(testInput, mockContext);

      expect(result.success).toBe(true);

      const svg = result.data?.chart?.svg || '';
      expect(svg).toContain('<svg');
      expect(svg).toContain('role="img"');
      expect(svg).toContain('aria-label');
      expect(svg).toContain('<title');
      expect(svg).toContain('<desc');

      const accessibility = result.data?.chart?.accessibility;
      expect(accessibility?.title).toBeDefined();
      expect(accessibility?.description).toBeDefined();
      expect(accessibility?.alternativeText).toBeDefined();
      expect(accessibility?.dataTable).toContain('<table');
      expect(accessibility?.keyboardInstructions).toBeDefined();
    });

    it('should apply custom styling options', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'category',
              type: 'string',
              values: ['A', 'B', 'C'],
            },
            {
              name: 'value',
              type: 'number',
              values: [10, 20, 30],
            },
          ],
          rowCount: 3,
        },
        dimensions: {
          width: 600,
          height: 400,
        },
        styling: {
          colors: {
            primary: ['#ff0000', '#00ff00', '#0000ff'],
            background: '#f0f0f0',
            text: '#333333',
            grid: '#cccccc',
            axis: '#666666',
          },
        },
      };

      const result = await chartAgent.execute(testInput, mockContext);

      expect(result.success).toBe(true);

      const svg = result.data?.chart?.svg || '';
      expect(svg).toContain('width="600"');
      expect(svg).toContain('height="400"');
      expect(svg).toContain('#f0f0f0'); // Background color
    });

    it('should handle high contrast accessibility mode', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'category',
              type: 'string',
              values: ['A', 'B'],
            },
            {
              name: 'value',
              type: 'number',
              values: [10, 20],
            },
          ],
          rowCount: 2,
        },
        accessibilityOptions: {
          highContrast: true,
          colorBlindSafe: true,
        },
      };

      const result = await chartAgent.execute(testInput, mockContext);

      expect(result.success).toBe(true);

      const svg = result.data?.chart?.svg || '';
      expect(svg).toContain('#000000'); // High contrast background
      expect(svg).toContain('#ffffff'); // High contrast text
    });
  });

  describe('Insights Generation', () => {
    it('should generate meaningful insights', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'date',
              type: 'date',
              values: [
                new Date('2024-01-01'),
                new Date('2024-02-01'),
                new Date('2024-03-01'),
              ],
            },
            {
              name: 'sales',
              type: 'number',
              values: [1000, null, 1200], // Include null to test null handling
            },
          ],
          rowCount: 3,
        },
        query: 'Show me sales trends over time',
      };

      const result = await chartAgent.execute(testInput, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.insights).toBeDefined();
      expect(result.data?.insights?.length).toBeGreaterThan(0);

      const insights = result.data?.insights || [];
      expect(insights.some(insight => insight.includes('time-series'))).toBe(
        true
      );
      expect(insights.some(insight => insight.includes('Missing values'))).toBe(
        true
      );
      expect(insights.some(insight => insight.includes('color-blind'))).toBe(
        true
      );
      expect(insights.some(insight => insight.includes('query:'))).toBe(true);
    });

    it('should identify high cardinality issues', async () => {
      const highCardinalityValues = Array.from(
        { length: 100 },
        (_, i) => `Item${i}`
      );
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'items',
              type: 'string',
              values: highCardinalityValues,
            },
            {
              name: 'count',
              type: 'number',
              values: Array.from({ length: 100 }, () =>
                Math.floor(Math.random() * 100)
              ),
            },
          ],
          rowCount: 100,
        },
      };

      const result = await chartAgent.execute(testInput, mockContext);

      expect(result.success).toBe(true);

      const insights = result.data?.insights || [];
      expect(
        insights.some(insight => insight.includes('High cardinality'))
      ).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty data gracefully', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [],
          rowCount: 0,
        },
      };

      const result = await chartAgent.execute(testInput, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('No chart recommendations available');
    });

    it('should handle invalid column data', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'test',
              type: 'number',
              values: [], // Empty values
            },
          ],
          rowCount: 0,
        },
      };

      const result = await chartAgent.execute(testInput, mockContext);

      // Should not crash, but may produce limited chart
      expect(result.success).toBe(true); // Should handle gracefully
    });

    it('should handle unsupported chart types', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'category',
              type: 'string',
              values: ['A', 'B', 'C'],
            },
          ],
          rowCount: 3,
        },
        chartType: 'INVALID_TYPE' as ChartType,
      };

      const result = await chartAgent.execute(testInput, mockContext);

      // Should handle by falling back to default recommendation
      expect(result.success).toBe(true);
    });
  });

  describe('Performance & Metadata', () => {
    it('should provide performance metadata', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'category',
              type: 'string',
              values: ['A', 'B', 'C'],
            },
            {
              name: 'value',
              type: 'number',
              values: [10, 20, 30],
            },
          ],
          rowCount: 3,
        },
      };

      const result = await chartAgent.execute(testInput, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.chart?.metadata).toBeDefined();
      expect(result.data?.chart?.metadata.chartType).toBeDefined();
      expect(result.data?.chart?.metadata.dataPoints).toBeGreaterThan(0);
      expect(result.data?.chart?.metadata.generatedAt).toBeDefined();
      expect(result.data?.chart?.metadata.renderTime).toBeGreaterThanOrEqual(0);
    });

    it('should complete within reasonable time', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'category',
              type: 'string',
              values: Array.from({ length: 1000 }, (_, i) => `Cat${i}`),
            },
            {
              name: 'value',
              type: 'number',
              values: Array.from({ length: 1000 }, () => Math.random() * 100),
            },
          ],
          rowCount: 1000,
        },
      };

      const startTime = Date.now();
      const result = await chartAgent.execute(testInput, mockContext);
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Agent Health', () => {
    it('should report healthy status', async () => {
      const health = await chartAgent.getHealth();

      expect(health.healthy).toBe(true);
      expect(health.lastCheck).toBeInstanceOf(Date);
      expect(health.metrics).toBeDefined();
      expect(health.metrics.uptime).toBeGreaterThanOrEqual(0);
      expect(health.metrics.totalExecutions).toBeGreaterThanOrEqual(0);
      expect(health.metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(health.metrics.avgExecutionTime).toBeGreaterThanOrEqual(0);
      expect(health.metrics.errorCount).toBeGreaterThanOrEqual(0);
    });

    it('should provide agent health status', () => {
      const healthStatus = chartAgent.getAgentHealth();

      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.details).toBeDefined();
      expect(healthStatus.details.recommendationEngine).toBe('operational');
      expect(healthStatus.details.svgGenerator).toBe('operational');
      expect(healthStatus.details.lastTest).toBeDefined();
      expect(healthStatus.details.testRecommendation).toBeDefined();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle multi-dataset charts', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'month',
              type: 'string',
              values: ['Jan', 'Feb', 'Mar', 'Apr'],
            },
            {
              name: 'revenue',
              type: 'number',
              values: [1000, 1200, 1100, 1300],
            },
            {
              name: 'profit',
              type: 'number',
              values: [200, 300, 250, 350],
            },
          ],
          rowCount: 4,
        },
      };

      const result = await chartAgent.execute(testInput, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.chart?.accessibility.dataTable).toContain('revenue');
      expect(result.data?.chart?.accessibility.dataTable).toContain('profit');
    });

    it('should provide alternative chart suggestions', async () => {
      const testInput: ChartAgentInput = {
        data: {
          columns: [
            {
              name: 'x',
              type: 'number',
              values: [1, 2, 3, 4, 5],
            },
            {
              name: 'y',
              type: 'number',
              values: [2, 4, 6, 8, 10],
            },
          ],
          rowCount: 5,
        },
      };

      const result = await chartAgent.execute(testInput, mockContext);

      expect(result.success).toBe(true);

      const insights = result.data?.insights || [];
      const hasAlternatives = insights.some(insight =>
        insight.includes('Alternative chart types')
      );

      // Should have alternative suggestions in insights or recommendation alternatives
      const hasRecommendationAlts =
        (result.data?.chart?.recommendation.alternatives?.length || 0) > 0;
      expect(hasAlternatives || hasRecommendationAlts).toBe(true);
    });
  });
});
