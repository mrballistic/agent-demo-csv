import {
  AgentType,
  AgentExecutionContext,
  AgentResult,
  AgentError,
  AgentTimeoutError,
} from './types';

/**
 * Base interface that all agents must implement
 */
export interface Agent<TInput = any, TOutput = any> {
  readonly type: AgentType;
  readonly name: string;
  readonly version: string;

  /**
   * Execute the agent's primary operation
   */
  execute(
    input: TInput,
    context: AgentExecutionContext
  ): Promise<AgentResult<TOutput>>;

  /**
   * Validate input before execution
   */
  validateInput(input: TInput): boolean;

  /**
   * Get agent health and readiness status
   */
  getHealth(): Promise<AgentHealthStatus>;

  /**
   * Clean up resources when shutting down
   */
  dispose(): Promise<void>;
}

export interface AgentHealthStatus {
  healthy: boolean;
  lastCheck: Date;
  metrics: {
    uptime: number;
    totalExecutions: number;
    successRate: number;
    avgExecutionTime: number;
    errorCount: number;
  };
  errors?: string[];
}

/**
 * Abstract base class providing common agent functionality
 */
export abstract class BaseAgent<TInput = any, TOutput = any>
  implements Agent<TInput, TOutput>
{
  abstract readonly type: AgentType;
  abstract readonly name: string;
  readonly version: string = '1.0.0';

  private _metrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    totalExecutionTime: 0,
    errorCount: 0,
    startTime: new Date(),
  };

  protected logger = console; // Can be replaced with proper logger

  /**
   * Template method that handles common execution concerns
   */
  async execute(
    input: TInput,
    context: AgentExecutionContext
  ): Promise<AgentResult<TOutput>> {
    const startTime = Date.now();
    const startMemory = this.getMemoryUsage();

    try {
      // Validate input
      if (!this.validateInput(input)) {
        throw new AgentError(
          `Invalid input for agent ${this.type}`,
          this.type,
          'INVALID_INPUT',
          input
        );
      }

      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new AgentTimeoutError(this.type, context.timeout));
        }, context.timeout);
      });

      // Execute with timeout
      const executionPromise = this.executeInternal(input, context);
      const result = await Promise.race([executionPromise, timeoutPromise]);

      // Calculate metrics
      const executionTime = Date.now() - startTime;
      const memoryUsed = this.getMemoryUsage() - startMemory;

      // Update success metrics
      this._metrics.totalExecutions++;
      this._metrics.successfulExecutions++;
      this._metrics.totalExecutionTime += executionTime;

      this.logger.info(`Agent ${this.type} executed successfully`, {
        executionTime,
        memoryUsed,
        requestId: context.requestId,
      });

      return {
        success: true,
        data: result,
        metrics: {
          executionTime,
          memoryUsed,
          cacheHit: false, // To be overridden by subclasses
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const memoryUsed = this.getMemoryUsage() - startMemory;

      // Update error metrics
      this._metrics.totalExecutions++;
      this._metrics.errorCount++;

      this.logger.error(`Agent ${this.type} execution failed`, {
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        requestId: context.requestId,
      });

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        metrics: {
          executionTime,
          memoryUsed,
          cacheHit: false,
        },
      };
    }
  }

  /**
   * Abstract method that subclasses must implement
   */
  protected abstract executeInternal(
    input: TInput,
    context: AgentExecutionContext
  ): Promise<TOutput>;

  /**
   * Default input validation - can be overridden
   */
  validateInput(input: TInput): boolean {
    return input != null;
  }

  /**
   * Get agent health status
   */
  async getHealth(): Promise<AgentHealthStatus> {
    const now = new Date();
    const uptime = now.getTime() - this._metrics.startTime.getTime();
    const successRate =
      this._metrics.totalExecutions > 0
        ? this._metrics.successfulExecutions / this._metrics.totalExecutions
        : 1;
    const avgExecutionTime =
      this._metrics.totalExecutions > 0
        ? this._metrics.totalExecutionTime / this._metrics.totalExecutions
        : 0;

    return {
      healthy: successRate > 0.95 && this._metrics.errorCount < 10,
      lastCheck: now,
      metrics: {
        uptime,
        totalExecutions: this._metrics.totalExecutions,
        successRate,
        avgExecutionTime,
        errorCount: this._metrics.errorCount,
      },
    };
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    this.logger.info(`Disposing agent ${this.type}`);
    // Base implementation does nothing - override as needed
  }

  /**
   * Get current memory usage (approximate)
   */
  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }

  /**
   * Protected method for logging warnings
   */
  protected warn(message: string, data?: any): void {
    this.logger.warn(`[${this.type}] ${message}`, data);
  }

  /**
   * Protected method for logging info
   */
  protected info(message: string, data?: any): void {
    this.logger.info(`[${this.type}] ${message}`, data);
  }

  /**
   * Protected method for logging debug
   */
  protected debug(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug?.(`[${this.type}] ${message}`, data);
    }
  }
}

/**
 * Utility function to create execution context
 */
export function createExecutionContext(
  requestId: string,
  options: Partial<AgentExecutionContext> = {}
): AgentExecutionContext {
  const context: AgentExecutionContext = {
    requestId,
    startTime: new Date(),
    timeout: options.timeout ?? 30000, // 30 second default timeout
  };
  if (options.userId !== undefined) {
    (context as any).userId = options.userId;
  }
  if (options.sessionId !== undefined) {
    (context as any).sessionId = options.sessionId;
  }
  return context;
}

/**
 * Utility for retrying failed agent executions
 */
export async function retryExecution<TInput, TOutput>(
  agent: Agent<TInput, TOutput>,
  input: TInput,
  context: AgentExecutionContext,
  maxRetries: number = 3,
  backoffMs: number = 1000
): Promise<AgentResult<TOutput>> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await agent.execute(input, context);
      if (result.success) {
        return result;
      }
      lastError = result.error;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt < maxRetries) {
      // Exponential backoff
      const delay = backoffMs * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: lastError || new Error('Max retries exceeded'),
    metrics: {
      executionTime: 0,
      memoryUsed: 0,
      cacheHit: false,
    },
  };
}
