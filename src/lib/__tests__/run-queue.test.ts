import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RunQueue } from '@/lib/run-queue';

describe('RunQueue', () => {
  let queue: RunQueue;

  beforeEach(() => {
    // Create a queue with small limits for testing
    queue = new RunQueue(2, 5, 1); // 2 concurrent, 5 max queue, 1 retry
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('enqueue', () => {
    it('should accept runs when under capacity', () => {
      const result = queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'test query',
        priority: 'normal',
      });

      expect(result.accepted).toBe(true);
      expect(result.runId).toBeDefined();
      expect(result.queuePosition).toBe(1);
    });

    it('should reject runs when at max capacity', () => {
      // Fill up the queue
      for (let i = 0; i < 5; i++) {
        queue.enqueue({
          threadId: `thread${i}`,
          sessionId: `session${i}`,
          query: `query ${i}`,
          priority: 'normal',
        });
      }

      // Try to add one more
      const result = queue.enqueue({
        threadId: 'thread6',
        sessionId: 'session6',
        query: 'overflow query',
        priority: 'normal',
      });

      expect(result.accepted).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should provide queue position and estimated wait time', () => {
      // Add first run
      const result1 = queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'query 1',
        priority: 'normal',
      });

      // Add second run
      const result2 = queue.enqueue({
        threadId: 'thread2',
        sessionId: 'session2',
        query: 'query 2',
        priority: 'normal',
      });

      expect(result1.queuePosition).toBe(1);
      expect(result2.queuePosition).toBe(2);
      expect(result2.estimatedWaitTime).toBeGreaterThan(0);
    });
  });

  describe('getCurrentRun', () => {
    it('should return current run for a thread', () => {
      const result = queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'test query',
        priority: 'normal',
      });

      const currentRun = queue.getCurrentRun('thread1');
      expect(currentRun).toBeDefined();
      expect(currentRun?.id).toBe(result.runId);
      expect(currentRun?.threadId).toBe('thread1');
    });

    it('should return null for non-existent thread', () => {
      const currentRun = queue.getCurrentRun('nonexistent');
      expect(currentRun).toBeNull();
    });
  });

  describe('cancelRun', () => {
    it('should cancel queued runs', () => {
      const result = queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'test query',
        priority: 'normal',
      });

      const cancelled = queue.cancelRun(result.runId);
      expect(cancelled).toBe(true);

      const currentRun = queue.getCurrentRun('thread1');
      expect(currentRun).toBeNull();
    });

    it('should cancel running runs', () => {
      const result = queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'test query',
        priority: 'normal',
      });

      // Simulate run starting
      vi.advanceTimersByTime(1000);
      queue.markRunStarted(result.runId, 'openai-run-123');

      const cancelled = queue.cancelRun(result.runId);
      expect(cancelled).toBe(true);
    });

    it('should return false for non-existent runs', () => {
      const cancelled = queue.cancelRun('nonexistent');
      expect(cancelled).toBe(false);
    });
  });

  describe('markRunStarted', () => {
    it('should mark run as started with OpenAI run ID', () => {
      const result = queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'test query',
        priority: 'normal',
      });

      // Simulate queue processing
      vi.advanceTimersByTime(1000);

      queue.markRunStarted(result.runId, 'openai-run-123');

      const currentRun = queue.getCurrentRun('thread1');
      expect(currentRun?.status).toBe('running');
      expect(currentRun?.openaiRunId).toBe('openai-run-123');
      expect(currentRun?.startedAt).toBeDefined();
    });
  });

  describe('markRunCompleted', () => {
    it('should mark successful runs as completed', () => {
      const result = queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'test query',
        priority: 'normal',
      });

      // Simulate run lifecycle
      vi.advanceTimersByTime(1000);
      queue.markRunStarted(result.runId, 'openai-run-123');
      queue.markRunCompleted(result.runId, true);

      const currentRun = queue.getCurrentRun('thread1');
      expect(currentRun).toBeNull(); // Should be moved to completed
    });

    it('should retry failed runs if retries available', () => {
      const result = queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'test query',
        priority: 'normal',
      });

      // Simulate run lifecycle
      vi.advanceTimersByTime(1000);
      queue.markRunStarted(result.runId, 'openai-run-123');
      queue.markRunCompleted(result.runId, false, 'Test error');

      // Should be re-queued for retry
      const currentRun = queue.getCurrentRun('thread1');
      expect(currentRun?.status).toBe('queued');
      expect(currentRun?.retryCount).toBe(1);
    });

    it('should not retry failed runs if max retries exceeded', () => {
      const result = queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'test query',
        priority: 'normal',
      });

      // Simulate run lifecycle with multiple failures
      vi.advanceTimersByTime(1000);
      queue.markRunStarted(result.runId, 'openai-run-123');
      queue.markRunCompleted(result.runId, false, 'Test error');

      // First retry
      vi.advanceTimersByTime(1000);
      queue.markRunStarted(result.runId, 'openai-run-124');
      queue.markRunCompleted(result.runId, false, 'Test error again');

      // Should not be re-queued (max retries = 1)
      const currentRun = queue.getCurrentRun('thread1');
      expect(currentRun).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return accurate queue statistics', () => {
      // Add some runs
      queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'query 1',
        priority: 'normal',
      });

      const result2 = queue.enqueue({
        threadId: 'thread2',
        sessionId: 'session2',
        query: 'query 2',
        priority: 'normal',
      });

      // Start one run
      vi.advanceTimersByTime(1000);
      queue.markRunStarted(result2.runId, 'openai-run-123');

      const stats = queue.getStats();
      expect(stats.total).toBe(2);
      expect(stats.queued).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.cancelled).toBe(0);
      expect(stats.maxDepth).toBe(5);
    });
  });

  describe('getQueuePosition', () => {
    it('should return correct queue position', () => {
      const result1 = queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'query 1',
        priority: 'normal',
      });

      const result2 = queue.enqueue({
        threadId: 'thread2',
        sessionId: 'session2',
        query: 'query 2',
        priority: 'normal',
      });

      expect(queue.getQueuePosition(result1.runId)).toBe(1);
      expect(queue.getQueuePosition(result2.runId)).toBe(2);
    });

    it('should return null for non-queued runs', () => {
      expect(queue.getQueuePosition('nonexistent')).toBeNull();
    });
  });

  describe('hasCapacity', () => {
    it('should return true when under capacity', () => {
      expect(queue.hasCapacity()).toBe(true);

      // Add some runs but stay under max
      queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'query 1',
        priority: 'normal',
      });

      expect(queue.hasCapacity()).toBe(true);
    });

    it('should return false when at capacity', () => {
      // Fill up the queue
      for (let i = 0; i < 5; i++) {
        queue.enqueue({
          threadId: `thread${i}`,
          sessionId: `session${i}`,
          query: `query ${i}`,
          priority: 'normal',
        });
      }

      expect(queue.hasCapacity()).toBe(false);
    });
  });

  describe('queue processing', () => {
    it('should automatically process queued runs', () => {
      const result = queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'test query',
        priority: 'normal',
      });

      // Initially queued
      let currentRun = queue.getCurrentRun('thread1');
      expect(currentRun?.status).toBe('queued');

      // Manually trigger queue processing
      queue.processQueueManually();

      currentRun = queue.getCurrentRun('thread1');
      expect(currentRun?.status).toBe('running');
    });

    it('should respect concurrent run limits', () => {
      // Add 3 runs (max concurrent is 2)
      const result1 = queue.enqueue({
        threadId: 'thread1',
        sessionId: 'session1',
        query: 'query 1',
        priority: 'normal',
      });

      const result2 = queue.enqueue({
        threadId: 'thread2',
        sessionId: 'session2',
        query: 'query 2',
        priority: 'normal',
      });

      const result3 = queue.enqueue({
        threadId: 'thread3',
        sessionId: 'session3',
        query: 'query 3',
        priority: 'normal',
      });

      // Process queue manually
      queue.processQueueManually();

      // First two should be running
      expect(queue.getCurrentRun('thread1')?.status).toBe('running');
      expect(queue.getCurrentRun('thread2')?.status).toBe('running');

      // Third should still be queued
      expect(queue.getCurrentRun('thread3')?.status).toBe('queued');
    });
  });
});
