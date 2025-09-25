/**
 * Simple FIFO queue for managing analysis runs
 * Implements in-memory queue with max depth and 429 responses
 */

export interface QueuedRun {
  id: string;
  threadId: string;
  sessionId: string;
  query: string;
  fileId?: string;
  priority: 'normal' | 'high';
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  openaiRunId?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface QueueStats {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  maxDepth: number;
  averageWaitTime: number;
  averageRunTime: number;
}

export class RunQueue {
  private queue: QueuedRun[] = [];
  private running = new Map<string, QueuedRun>();
  private completed: QueuedRun[] = [];

  private readonly maxConcurrent: number;
  private readonly maxQueueDepth: number;
  private readonly maxRetries: number;

  constructor(
    maxConcurrent: number = 3,
    maxQueueDepth: number = 20,
    maxRetries: number = 2
  ) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueDepth = maxQueueDepth;
    this.maxRetries = maxRetries;

    // Start the queue processor
    this.startProcessor();

    // Cleanup completed runs every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Add a run to the queue
   */
  enqueue(
    run: Omit<
      QueuedRun,
      'id' | 'queuedAt' | 'status' | 'retryCount' | 'maxRetries'
    >
  ): {
    runId: string;
    queuePosition?: number;
    estimatedWaitTime?: number;
    accepted: boolean;
    retryAfter?: number;
  } {
    // Check if queue is at capacity
    if (this.queue.length >= this.maxQueueDepth) {
      return {
        runId: '',
        accepted: false,
        retryAfter: this.estimateRetryAfter(),
      };
    }

    const queuedRun: QueuedRun = {
      ...run,
      id: `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      queuedAt: Date.now(),
      status: 'queued',
      retryCount: 0,
      maxRetries: this.maxRetries,
    };

    this.queue.push(queuedRun);

    return {
      runId: queuedRun.id,
      queuePosition: this.queue.length,
      estimatedWaitTime: this.estimateWaitTime(),
      accepted: true,
    };
  }

  /**
   * Get current run for a thread
   */
  getCurrentRun(threadId: string): QueuedRun | null {
    // Check running runs first
    for (const run of this.running.values()) {
      if (run.threadId === threadId) {
        return run;
      }
    }

    // Check queued runs
    return this.queue.find(run => run.threadId === threadId) || null;
  }

  /**
   * Cancel a run
   */
  cancelRun(runId: string): boolean {
    // Check if it's running
    const runningRun = this.running.get(runId);
    if (runningRun) {
      runningRun.status = 'cancelled';
      runningRun.completedAt = Date.now();
      this.running.delete(runId);
      this.completed.push(runningRun);
      return true;
    }

    // Check if it's queued
    const queueIndex = this.queue.findIndex(run => run.id === runId);
    if (queueIndex !== -1) {
      const queuedRun = this.queue[queueIndex];
      if (queuedRun) {
        queuedRun.status = 'cancelled';
        queuedRun.completedAt = Date.now();
        this.queue.splice(queueIndex, 1);
        this.completed.push(queuedRun);
        return true;
      }
    }

    return false;
  }

  /**
   * Mark a run as started (called when OpenAI run begins)
   */
  markRunStarted(runId: string, openaiRunId: string): void {
    // Find run in running map
    const run = this.running.get(runId);
    if (run) {
      run.openaiRunId = openaiRunId;
      run.startedAt = Date.now();
      run.status = 'running';
      return;
    }

    // If not in running, check if it's in queue and move it
    const queueIndex = this.queue.findIndex(r => r.id === runId);
    if (queueIndex !== -1) {
      const queuedRun = this.queue.splice(queueIndex, 1)[0];
      if (queuedRun) {
        queuedRun.openaiRunId = openaiRunId;
        queuedRun.startedAt = Date.now();
        queuedRun.status = 'running';
        this.running.set(runId, queuedRun);
      }
    }
  }

  /**
   * Mark a run as completed
   */
  markRunCompleted(runId: string, success: boolean, error?: string): void {
    const run = this.running.get(runId);
    if (run) {
      run.status = success ? 'completed' : 'failed';
      run.completedAt = Date.now();
      if (error) {
        run.error = error;
      }

      this.running.delete(runId);
      this.completed.push(run);

      // If failed and retries available, re-queue
      if (!success && run.retryCount < run.maxRetries) {
        run.retryCount++;
        run.status = 'queued';
        run.queuedAt = Date.now();
        delete run.startedAt;
        delete run.completedAt;
        delete run.openaiRunId;
        this.queue.unshift(run); // Add to front for retry
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const allRuns = [
      ...this.queue,
      ...this.running.values(),
      ...this.completed,
    ];

    const stats: QueueStats = {
      total: allRuns.length,
      queued: this.queue.length,
      running: this.running.size,
      completed: this.completed.filter(r => r.status === 'completed').length,
      failed: this.completed.filter(r => r.status === 'failed').length,
      cancelled: this.completed.filter(r => r.status === 'cancelled').length,
      maxDepth: this.maxQueueDepth,
      averageWaitTime: this.calculateAverageWaitTime(),
      averageRunTime: this.calculateAverageRunTime(),
    };

    return stats;
  }

  /**
   * Get queue position for a run
   */
  getQueuePosition(runId: string): number | null {
    const index = this.queue.findIndex(run => run.id === runId);
    return index !== -1 ? index + 1 : null;
  }

  /**
   * Check if queue has capacity
   */
  hasCapacity(): boolean {
    return this.queue.length < this.maxQueueDepth;
  }

  /**
   * Estimate retry-after time in seconds
   */
  private estimateRetryAfter(): number {
    const avgRunTime = this.calculateAverageRunTime();
    const queueLength = this.queue.length;
    const runningCount = this.running.size;

    // Estimate based on current load
    const estimatedSeconds = Math.ceil(
      (queueLength * avgRunTime) /
        Math.max(this.maxConcurrent - runningCount, 1)
    );

    return Math.min(Math.max(estimatedSeconds, 30), 300); // Between 30s and 5min
  }

  /**
   * Estimate wait time for new runs
   */
  private estimateWaitTime(): number {
    const avgRunTime = this.calculateAverageRunTime();
    const queuePosition = this.queue.length;

    if (this.running.size < this.maxConcurrent && queuePosition === 0) {
      return 0; // Can start immediately
    }

    // Estimate based on queue position and average run time
    const waitTime = Math.ceil(
      (queuePosition * avgRunTime) / this.maxConcurrent
    );
    return Math.max(waitTime, 1000); // Minimum 1 second wait time
  }

  /**
   * Calculate average wait time from queue to start
   */
  private calculateAverageWaitTime(): number {
    const completedWithTimes = this.completed.filter(
      run => run.startedAt && run.queuedAt
    );

    if (completedWithTimes.length === 0) return 15000; // Default 15s

    const totalWaitTime = completedWithTimes.reduce(
      (sum, run) => sum + (run.startedAt! - run.queuedAt),
      0
    );

    return totalWaitTime / completedWithTimes.length;
  }

  /**
   * Calculate average run time from start to completion
   */
  private calculateAverageRunTime(): number {
    const completedWithTimes = this.completed.filter(
      run => run.completedAt && run.startedAt && run.status === 'completed'
    );

    if (completedWithTimes.length === 0) return 30000; // Default 30s

    const totalRunTime = completedWithTimes.reduce(
      (sum, run) => sum + (run.completedAt! - run.startedAt!),
      0
    );

    return totalRunTime / completedWithTimes.length;
  }

  /**
   * Start the queue processor
   */
  private startProcessor(): void {
    setInterval(() => {
      this.processQueue();
    }, 1000); // Check every second
  }

  /**
   * Process the queue - move runs from queue to running
   */
  private processQueue(): void {
    // Process as many runs as we can up to the concurrent limit
    while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
      const nextRun = this.queue.shift();
      if (!nextRun) {
        break;
      }

      // Move to running
      nextRun.status = 'running';
      this.running.set(nextRun.id, nextRun);

      // The actual run execution will be handled by the analysis endpoints
      // They will call markRunStarted and markRunCompleted
    }
  }

  /**
   * Clean up old completed runs
   */
  private cleanup(): void {
    const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour ago

    this.completed = this.completed.filter(
      run => (run.completedAt || run.queuedAt) > cutoff
    );
  }

  /**
   * Manually trigger queue processing (for testing)
   */
  processQueueManually(): void {
    this.processQueue();
  }
}

// Create singleton instance
export const runQueue = new RunQueue(
  parseInt(process.env.MAX_CONCURRENT_RUNS || '3'),
  parseInt(process.env.MAX_QUEUE_DEPTH || '20'),
  parseInt(process.env.MAX_RETRIES || '2')
);
