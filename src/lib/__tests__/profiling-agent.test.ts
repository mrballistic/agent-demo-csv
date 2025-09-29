import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataProfilingAgent } from '../agents/profiling-agent';
import { createExecutionContext } from '../agents/base';

describe('DataProfilingAgent', () => {
  let agent: DataProfilingAgent;

  beforeEach(() => {
    agent = new DataProfilingAgent();
  });

  afterEach(async () => {
    await agent.dispose();
  });

  describe('input validation', () => {
    it('should reject empty buffer', () => {
      const input = {
        buffer: Buffer.alloc(0),
        name: 'test.csv',
        mimeType: 'text/csv',
        size: 0,
      };

      expect(agent.validateInput(input)).toBe(false);
    });

    it('should reject oversized files', () => {
      const input = {
        buffer: Buffer.from('test'),
        name: 'test.csv',
        mimeType: 'text/csv',
        size: 600 * 1024 * 1024, // 600MB
      };

      expect(agent.validateInput(input)).toBe(false);
    });

    it('should reject non-CSV files', () => {
      const input = {
        buffer: Buffer.from('test'),
        name: 'test.txt',
        mimeType: 'text/plain',
        size: 100,
      };

      expect(agent.validateInput(input)).toBe(false);
    });

    it('should accept valid CSV files', () => {
      const input = {
        buffer: Buffer.from('name,age\nJohn,25'),
        name: 'test.csv',
        mimeType: 'text/csv',
        size: 100,
      };

      expect(agent.validateInput(input)).toBe(true);
    });
  });

  describe('data profiling', () => {
    it('should profile simple CSV data', async () => {
      const csvData =
        'name,age,salary,active\nJohn,25,50000,true\nJane,30,60000,false\nBob,35,70000,true';
      const input = {
        buffer: Buffer.from(csvData),
        name: 'employees.csv',
        mimeType: 'text/csv',
        size: csvData.length,
      };

      const context = createExecutionContext('test-profile');
      const result = await agent.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      if (result.success && result.data) {
        const profile = result.data;

        // Check basic metadata
        expect(profile.metadata.filename).toBe('employees.csv');
        expect(profile.metadata.rowCount).toBe(3);
        expect(profile.metadata.columnCount).toBe(4);

        // Check schema
        expect(profile.schema.columns).toHaveLength(4);
        expect(profile.schema.columns.map(c => c.name)).toEqual([
          'name',
          'age',
          'salary',
          'active',
        ]);

        // Check column types
        const nameCol = profile.schema.columns.find(c => c.name === 'name');
        const ageCol = profile.schema.columns.find(c => c.name === 'age');
        const salaryCol = profile.schema.columns.find(c => c.name === 'salary');
        const activeCol = profile.schema.columns.find(c => c.name === 'active');

        expect(nameCol?.type).toBe('text');
        expect(ageCol?.type).toBe('numeric');
        expect(salaryCol?.type).toBe('numeric');
        expect(activeCol?.type).toBe('boolean');

        // Check quality metrics
        expect(profile.quality.overall).toBeGreaterThan(0);
        expect(profile.quality.dimensions.completeness).toBe(100); // No missing values
      }
    });

    it('should handle missing values correctly', async () => {
      const csvData = 'name,age\nJohn,25\n,30\nBob,';
      const input = {
        buffer: Buffer.from(csvData),
        name: 'missing.csv',
        mimeType: 'text/csv',
        size: csvData.length,
      };

      const context = createExecutionContext('test-missing');
      const result = await agent.execute(input, context);

      expect(result.success).toBe(true);

      if (result.success && result.data) {
        const profile = result.data;

        // Check that missing values are detected
        const nameCol = profile.schema.columns.find(c => c.name === 'name');
        const ageCol = profile.schema.columns.find(c => c.name === 'age');

        expect(nameCol?.nullCount).toBe(1);
        expect(ageCol?.nullCount).toBe(1);
        expect(nameCol?.nullable).toBe(true);
        expect(ageCol?.nullable).toBe(true);

        // Check quality flags
        expect(nameCol?.qualityFlags).toHaveLength(1);
        expect(nameCol?.qualityFlags[0]?.type).toBe('missing_values');
      }
    });

    it('should generate appropriate insights', async () => {
      const csvData =
        'product,price,category\nWidget,10.99,Tools\nGadget,25.50,Electronics\nTool,15.00,Tools';
      const input = {
        buffer: Buffer.from(csvData),
        name: 'products.csv',
        mimeType: 'text/csv',
        size: csvData.length,
      };

      const context = createExecutionContext('test-insights');
      const result = await agent.execute(input, context);

      expect(result.success).toBe(true);

      if (result.success && result.data) {
        const profile = result.data;

        expect(profile.insights.keyFindings).toContain(
          'Dataset contains 3 rows and 3 columns'
        );
        expect(profile.insights.suggestedQueries).toContain(
          'What is the average price?'
        );
        // Note: With only 3 rows, category might be detected as text instead of categorical
        expect(profile.insights.suggestedQueries.length).toBeGreaterThan(1);
      }
    });
  });

  describe('performance', () => {
    it('should process reasonably sized data quickly', async () => {
      // Generate larger dataset
      const headers = 'id,name,age,salary,department';
      const rows = [];
      for (let i = 1; i <= 1000; i++) {
        rows.push(
          `${i},User${i},${20 + (i % 40)},${30000 + i * 100},Dept${i % 5}`
        );
      }
      const csvData = headers + '\n' + rows.join('\n');

      const input = {
        buffer: Buffer.from(csvData),
        name: 'large.csv',
        mimeType: 'text/csv',
        size: csvData.length,
      };

      const context = createExecutionContext('test-performance');
      const startTime = Date.now();

      const result = await agent.execute(input, context);
      const processingTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });
});
