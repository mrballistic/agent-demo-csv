/**
 * Intent Classifier Tests
 *
 * Test suite for query intent classification and entity extraction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IntentClassifier } from '../utils/intent-classifier';
import { QueryType } from '../utils/query-types';

describe('IntentClassifier', () => {
  let classifier: IntentClassifier;
  const sampleColumns = [
    'sales',
    'revenue',
    'date',
    'category',
    'region',
    'price',
    'quantity',
  ];

  beforeEach(() => {
    classifier = new IntentClassifier();
  });

  describe('Profile Queries', () => {
    it('should classify basic profile queries', () => {
      const testCases = ['overview', 'summary', 'profile', 'describe dataset'];

      testCases.forEach(query => {
        const result = classifier.classifyIntent(query);
        expect(result.intent.type).toBe(QueryType.PROFILE);
        expect(result.intent.confidence).toBeGreaterThan(0.8);
        expect(result.intent.requiresLLM).toBe(false);
        expect(result.intent.canUseCache).toBe(true);
      });
    });
  });

  describe('Trend Queries', () => {
    it('should classify trend queries with time elements', () => {
      const testCases = [
        'Show sales trends over time',
        'Revenue growth by month',
        'Changes in price over the year',
        'Time series analysis of quantity',
      ];

      testCases.forEach(query => {
        const result = classifier.classifyIntent(query, sampleColumns);
        expect(result.intent.type).toBe(QueryType.TREND);
        expect(result.intent.confidence).toBeGreaterThan(0.7);
        expect(result.intent.measures.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Aggregation Queries', () => {
    it('should classify aggregation queries correctly', () => {
      const testCases = [
        { query: 'Sum of sales', expectedMeasure: 'sales' },
        { query: 'Average price', expectedMeasure: 'price' },
        { query: 'Count of orders', expectedMeasure: 'orders' },
        { query: 'Total revenue', expectedMeasure: 'revenue' },
        { query: 'Maximum quantity', expectedMeasure: 'quantity' },
      ];

      testCases.forEach(({ query, expectedMeasure }) => {
        const result = classifier.classifyIntent(query, sampleColumns);
        expect(result.intent.type).toBe(QueryType.AGGREGATION);
        expect(result.intent.confidence).toBeGreaterThan(0.8);
        expect(result.intent.measures).toContain(expectedMeasure);
      });
    });
  });

  describe('Comparison Queries', () => {
    it('should classify comparison queries', () => {
      const testCases = [
        'Compare sales vs revenue',
        'Difference between regions',
        'Sales compared to last year',
        'Revenue versus cost',
      ];

      testCases.forEach(query => {
        const result = classifier.classifyIntent(query, sampleColumns);
        expect(result.intent.type).toBe(QueryType.COMPARISON);
        expect(result.intent.confidence).toBeGreaterThan(0.6);
      });
    });
  });

  describe('Filter Queries', () => {
    it('should classify filter queries', () => {
      const testCases = [
        'Show only sales > 1000',
        'Filter where region = North',
        'Display records where category contains electronics',
      ];

      testCases.forEach(query => {
        const result = classifier.classifyIntent(query, sampleColumns);
        expect(result.intent.type).toBe(QueryType.FILTER);
        expect(result.intent.confidence).toBeGreaterThan(0.6);
        expect(result.intent.canUseCache).toBe(false); // Filters disable caching
      });
    });
  });

  describe('Ranking Queries', () => {
    it('should classify ranking queries with limits', () => {
      const testCases = [
        { query: 'Top 10 customers', expectedLimit: 10 },
        { query: 'Highest revenue products', expectedLimit: undefined },
        { query: 'Bottom 5 performers', expectedLimit: 5 },
      ];

      testCases.forEach(({ query, expectedLimit }) => {
        const result = classifier.classifyIntent(query, sampleColumns);
        expect(result.intent.type).toBe(QueryType.RANKING);
        expect(result.intent.confidence).toBeGreaterThan(0.7);
        if (expectedLimit) {
          expect(result.intent.limit).toBe(expectedLimit);
        }
      });
    });
  });

  describe('Distribution Queries', () => {
    it('should classify distribution queries', () => {
      const testCases = [
        'Distribution of ages',
        'Price histogram',
        'Frequency analysis of categories',
      ];

      testCases.forEach(query => {
        const result = classifier.classifyIntent(query, sampleColumns);
        expect(result.intent.type).toBe(QueryType.DISTRIBUTION);
        expect(result.intent.confidence).toBeGreaterThan(0.6);
      });
    });
  });

  describe('Relationship Queries', () => {
    it('should classify relationship queries and require LLM', () => {
      const testCases = [
        'Correlation between price and sales',
        'Relationship of age to income',
        'How are sales related to marketing spend',
      ];

      testCases.forEach(query => {
        const result = classifier.classifyIntent(query, sampleColumns);
        expect(result.intent.type).toBe(QueryType.RELATIONSHIP);
        expect(result.intent.requiresLLM).toBe(true); // Complex analysis
        expect(result.intent.estimatedCost).toBeGreaterThan(7);
      });
    });
  });

  describe('Unknown Queries', () => {
    it('should classify complex queries as unknown and require LLM', () => {
      const testCases = [
        'Perform advanced statistical analysis with regression models',
        'Generate a machine learning prediction model',
        'complex multivariate analysis with statistical significance',
      ];

      testCases.forEach(query => {
        const result = classifier.classifyIntent(query, sampleColumns);
        expect(result.intent.type).toBe(QueryType.UNKNOWN);
        expect(result.intent.requiresLLM).toBe(true);
        expect(result.intent.estimatedCost).toBe(10);
      });
    });
  });

  describe('Entity Extraction', () => {
    it('should extract entities and match them to available columns', () => {
      const query = 'Show sales trends over time by region';
      const result = classifier.classifyIntent(query, sampleColumns);

      expect(result.intent.measures).toContain('sales');
      expect(result.intent.dimensions).toContain('region');

      // Should find entities with column matches
      const measureEntity = result.intent.entities.find(
        e => e.type === 'measure'
      );
      expect(measureEntity?.column).toBe('sales');
      expect(measureEntity?.confidence).toBeGreaterThan(0.8);
    });

    it('should handle queries without column matches', () => {
      const query = 'Sum of profits';
      const result = classifier.classifyIntent(query, sampleColumns);

      expect(result.intent.type).toBe(QueryType.AGGREGATION);
      expect(result.intent.measures).toContain('profits');

      // Should create entity even without column match
      const measureEntity = result.intent.entities.find(
        e => e.type === 'measure'
      );
      expect(measureEntity?.column).toBeUndefined();
      expect(measureEntity?.confidence).toBeLessThan(0.8);
    });
  });

  describe('Performance', () => {
    it('should classify queries quickly', () => {
      const query = 'Show sales trends over time';
      const result = classifier.classifyIntent(query, sampleColumns);

      expect(result.processingTime).toBeLessThan(50); // Should be very fast
      expect(result.intent.type).toBe(QueryType.TREND);
    });

    it('should provide alternatives for ambiguous queries', () => {
      const query = 'revenue data analysis'; // Could match multiple patterns
      const result = classifier.classifyIntent(query, sampleColumns);

      // This might match profile, aggregation, or other patterns
      expect(result.alternatives.length).toBeGreaterThanOrEqual(0);
      expect(result.alternatives.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate costs correctly by query type', () => {
      const costTests = [
        { query: 'overview', expectedCost: 2 }, // Profile query
        { query: 'Sum of sales', expectedCost: 3 }, // Aggregation query
        { query: 'Show trends over time', expectedCost: 5 }, // Trend query
        { query: 'Correlation between price and sales', expectedCost: 9 }, // Relationship query
      ];

      costTests.forEach(({ query, expectedCost }) => {
        const result = classifier.classifyIntent(query, sampleColumns);
        expect(result.intent.estimatedCost).toBe(expectedCost);
      });
    });

    it('should increase cost for complex queries with many entities', () => {
      const simpleQuery = 'Sum of sales';
      const complexQuery =
        'Compare sales vs revenue vs profit by region and category over time with filters';

      const simpleResult = classifier.classifyIntent(
        simpleQuery,
        sampleColumns
      );
      const complexResult = classifier.classifyIntent(
        complexQuery,
        sampleColumns
      );

      expect(complexResult.intent.estimatedCost).toBeGreaterThan(
        simpleResult.intent.estimatedCost
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty queries', () => {
      const result = classifier.classifyIntent('', sampleColumns);
      expect(result.intent.type).toBe(QueryType.UNKNOWN);
      expect(result.intent.confidence).toBeLessThan(0.5);
    });

    it('should handle queries with special characters', () => {
      const query = 'Show sales > $1,000 & revenue < €500';
      const result = classifier.classifyIntent(query, sampleColumns);

      expect(result.intent.type).toBe(QueryType.FILTER);
      expect(result.processingTime).toBeLessThan(100);
    });

    it('should handle queries without available columns', () => {
      const query = 'Sum of sales';
      const result = classifier.classifyIntent(query, []); // No columns available

      expect(result.intent.type).toBe(QueryType.AGGREGATION);
      expect(result.intent.measures).toContain('sales');
    });
  });
});
