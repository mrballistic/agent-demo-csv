import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BaseAgent,
  createExecutionContext,
  retryExecution,
} from '../agents/base';
import { AgentType, AgentExecutionContext, AgentResult } from '../agents/types';

// Mock agent for testing
class TestAgent extends BaseAgent<string, string> {
  readonly type = AgentType.PROFILING;
  readonly name = 'TestAgent';

  constructor(
    private shouldFail = false,
    private delay = 0
  ) {
    super();
  }

  protected async executeInternal(
    input: string,
    context: AgentExecutionContext
  ): Promise<string> {
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    if (this.shouldFail) {
      throw new Error('Test failure');
    }

    return `Processed: ${input}`;
  }

  validateInput(input: string): boolean {
    return typeof input === 'string' && input.length > 0;
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent;
  let context: AgentExecutionContext;

  beforeEach(() => {
    agent = new TestAgent();
    context = createExecutionContext('test-request-1');
  });

  afterEach(async () => {
    await agent.dispose();
  });

  it('should execute successfully with valid input', async () => {
    const result = await agent.execute('test input', context);

    expect(result.success).toBe(true);
    expect(result.data).toBe('Processed: test input');
    expect(result.metrics.executionTime).toBeGreaterThanOrEqual(0);
  });

  it('should fail with invalid input', async () => {
    const result = await agent.execute('', context);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('Invalid input');
  });

  it('should handle internal execution errors', async () => {
    const failingAgent = new TestAgent(true);
    const result = await failingAgent.execute('test', context);

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('Test failure');
    await failingAgent.dispose();
  });

  it('should timeout long-running operations', async () => {
    const slowAgent = new TestAgent(false, 100);
    const shortContext = createExecutionContext('test-timeout', {
      timeout: 50,
    });

    const result = await slowAgent.execute('test', shortContext);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('timed out');
    await slowAgent.dispose();
  });

  it('should track metrics correctly', async () => {
    await agent.execute('test1', context);
    await agent.execute('test2', context);

    const health = await agent.getHealth();

    expect(health.metrics.totalExecutions).toBe(2);
    expect(health.metrics.successRate).toBe(1);
    expect(health.healthy).toBe(true);
  });

  it('should update error metrics on failure', async () => {
    const failingAgent = new TestAgent(true);

    await failingAgent.execute('test', context);
    const health = await failingAgent.getHealth();

    expect(health.metrics.errorCount).toBe(1);
    expect(health.metrics.successRate).toBe(0);
    expect(health.healthy).toBe(false);

    await failingAgent.dispose();
  });
});

describe('createExecutionContext', () => {
  it('should create context with required fields', () => {
    const requestId = 'test-request';
    const context = createExecutionContext(requestId);

    expect(context.requestId).toBe(requestId);
    expect(context.startTime).toBeInstanceOf(Date);
    expect(context.timeout).toBe(30000); // default timeout
  });

  it('should accept optional parameters', () => {
    const requestId = 'test-request';
    const options = {
      userId: 'user-123',
      sessionId: 'session-456',
      timeout: 60000,
    };

    const context = createExecutionContext(requestId, options);

    expect(context.userId).toBe(options.userId);
    expect(context.sessionId).toBe(options.sessionId);
    expect(context.timeout).toBe(options.timeout);
  });
});

describe('retryExecution', () => {
  let context: AgentExecutionContext;

  beforeEach(() => {
    context = createExecutionContext('retry-test');
  });

  it('should succeed on first attempt', async () => {
    const agent = new TestAgent();
    const result = await retryExecution(agent, 'test', context, 3, 10);

    expect(result.success).toBe(true);
    expect(result.data).toBe('Processed: test');

    await agent.dispose();
  });

  it('should retry on failure and eventually succeed', async () => {
    let attemptCount = 0;

    class RetryTestAgent extends TestAgent {
      protected async executeInternal(input: string): Promise<string> {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return `Processed: ${input}`;
      }
    }

    const agent = new RetryTestAgent();
    const result = await retryExecution(agent, 'test', context, 3, 10);

    expect(result.success).toBe(true);
    expect(attemptCount).toBe(3);

    await agent.dispose();
  });

  it('should fail after max retries', async () => {
    const agent = new TestAgent(true);
    const result = await retryExecution(agent, 'test', context, 2, 10);

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('Test failure');

    await agent.dispose();
  });
});
