import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentOrchestrator } from '../agents/orchestrator';
import { BaseAgent } from '../agents/base';
import { AgentType, AgentExecutionContext } from '../agents/types';

// Mock profiling agent for testing
class MockProfilingAgent extends BaseAgent<any, any> {
  readonly type = AgentType.PROFILING;
  readonly name = 'MockProfilingAgent';

  protected async executeInternal(input: any): Promise<any> {
    return {
      id: 'profile-123',
      version: 1,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: {
        filename: input.name || 'test.csv',
        size: input.size || 1000,
        encoding: 'utf-8',
        delimiter: ',',
        rowCount: 100,
        columnCount: 5,
        processingTime: 50,
        checksum: 'abc123',
      },
      schema: {
        columns: [],
        relationships: [],
      },
      quality: {
        overall: 85,
        dimensions: {
          completeness: 90,
          consistency: 85,
          accuracy: 80,
          uniqueness: 95,
          validity: 85,
        },
        issues: [],
      },
      security: {
        piiColumns: [],
        riskLevel: 'low' as const,
        recommendations: [],
        complianceFlags: [],
        hasRedaction: false,
      },
      insights: {
        keyFindings: ['High data quality'],
        trends: [],
        anomalies: [],
        recommendations: [],
        suggestedQueries: [],
      },
      sampleData: [],
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
  }
}

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;
  let mockAgent: MockProfilingAgent;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator();
    mockAgent = new MockProfilingAgent();
  });

  afterEach(async () => {
    await orchestrator.shutdown();
    await mockAgent.dispose();
  });

  describe('agent registration', () => {
    it('should register an agent successfully', () => {
      expect(() => {
        orchestrator.registerAgent(mockAgent);
      }).not.toThrow();
    });

    it('should prevent duplicate agent registration', () => {
      orchestrator.registerAgent(mockAgent);

      expect(() => {
        orchestrator.registerAgent(mockAgent);
      }).toThrow('already registered');
    });

    it('should retrieve registered agent', () => {
      orchestrator.registerAgent(mockAgent);

      const retrieved = orchestrator.getAgent(AgentType.PROFILING);
      expect(retrieved).toBe(mockAgent);
    });

    it('should return undefined for unregistered agent', () => {
      const retrieved = orchestrator.getAgent(AgentType.SECURITY);
      expect(retrieved).toBeUndefined();
    });

    it('should unregister agent successfully', async () => {
      orchestrator.registerAgent(mockAgent);
      await orchestrator.unregisterAgent(AgentType.PROFILING);

      const retrieved = orchestrator.getAgent(AgentType.PROFILING);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('file processing', () => {
    beforeEach(() => {
      orchestrator.registerAgent(mockAgent);
    });

    it('should process valid CSV file', async () => {
      const file = {
        buffer: Buffer.from('name,age\nJohn,25\nJane,30'),
        name: 'test.csv',
        mimeType: 'text/csv',
        size: 1000,
      };

      const profile = await orchestrator.processDataUpload(file);

      expect(profile.id).toBe('profile-123');
      expect(profile.metadata.filename).toBe('test.csv');
      expect(profile.quality.overall).toBe(85);
    });

    it('should reject empty file', async () => {
      const file = {
        buffer: Buffer.alloc(0),
        name: 'empty.csv',
        mimeType: 'text/csv',
        size: 0,
      };

      await expect(orchestrator.processDataUpload(file)).rejects.toThrow(
        'empty'
      );
    });

    it('should reject oversized file', async () => {
      const file = {
        buffer: Buffer.alloc(1000),
        name: 'large.csv',
        mimeType: 'text/csv',
        size: 600 * 1024 * 1024, // 600MB
      };

      await expect(orchestrator.processDataUpload(file)).rejects.toThrow(
        'exceeds maximum limit'
      );
    });

    it('should reject non-CSV file', async () => {
      const file = {
        buffer: Buffer.from('test data'),
        name: 'test.txt',
        mimeType: 'text/plain',
        size: 100,
      };

      await expect(orchestrator.processDataUpload(file)).rejects.toThrow(
        'Only CSV files'
      );
    });
  });

  describe('system health', () => {
    beforeEach(() => {
      orchestrator.registerAgent(mockAgent);
    });

    it('should return health status for all agents', async () => {
      const healthMap = await orchestrator.getSystemHealth();

      expect(healthMap.has(AgentType.PROFILING)).toBe(true);
      const health = healthMap.get(AgentType.PROFILING);
      expect(health?.healthy).toBe(true);
    });

    it('should check resource limits', () => {
      const resources = orchestrator.checkResourceLimits();

      expect(resources.memory).toBeDefined();
      expect(resources.cpu).toBeDefined();
      expect(resources.agents).toBeDefined();
      expect(typeof resources.memory.used).toBe('number');
      expect(typeof resources.agents.active).toBe('number');
    });
  });

  describe('error handling', () => {
    it('should handle agent failure gracefully', async () => {
      const error = new Error('Test error');

      // This should not throw
      await expect(
        orchestrator.handleAgentFailure(AgentType.PROFILING, error)
      ).resolves.not.toThrow();
    });

    it('should handle missing agent for file processing', async () => {
      // Don't register the agent
      const file = {
        buffer: Buffer.from('test'),
        name: 'test.csv',
        mimeType: 'text/csv',
        size: 100,
      };

      await expect(orchestrator.processDataUpload(file)).rejects.toThrow(
        'not available'
      );
    });
  });
});
