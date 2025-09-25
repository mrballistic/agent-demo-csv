import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { POST } from '@/app/api/runs/[threadId]/cancel/route';
import { NextRequest } from 'next/server';
import { runQueue } from '@/lib/run-queue';
import { sessionStore } from '@/lib/session-store';

// Mock the dependencies
vi.mock('@/lib/openai', () => ({
  assistantManager: {
    cancelRun: vi.fn(),
  },
}));

vi.mock('@/lib/session-store', () => ({
  sessionStore: {
    getSessionByThreadId: vi.fn(),
  },
}));

vi.mock('@/lib/run-queue', () => ({
  runQueue: {
    getCurrentRun: vi.fn(),
    cancelRun: vi.fn(),
  },
}));

describe('Cancel Run API', () => {
  const mockThreadId = 'thread_123';
  const mockRunId = 'run_456';
  const mockSessionId = 'session_789';

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mocks
    vi.mocked(sessionStore.getSessionByThreadId).mockReturnValue({
      id: mockSessionId,
      threadId: mockThreadId,
      messages: [],
      artifacts: [],
      lastActivity: Date.now(),
      expiresAt: Date.now() + 3600000,
      metrics: {
        analysisRequests: 0,
        artifactsGenerated: 0,
        totalTokensUsed: 0,
      },
    });

    vi.mocked(runQueue.getCurrentRun).mockReturnValue({
      id: mockRunId,
      threadId: mockThreadId,
      sessionId: mockSessionId,
      query: 'test query',
      priority: 'normal',
      queuedAt: Date.now(),
      status: 'running',
      retryCount: 0,
      maxRetries: 2,
      openaiRunId: 'openai_run_123',
    });

    vi.mocked(runQueue.cancelRun).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should cancel a running analysis successfully', async () => {
    const request = new NextRequest(
      'http://localhost/api/runs/thread_123/cancel',
      {
        method: 'POST',
      }
    );

    const response = await POST(request, {
      params: { threadId: mockThreadId },
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cancelled).toBe(true);
    expect(data.runId).toBe(mockRunId);
    expect(data.threadId).toBe(mockThreadId);
    expect(data.error).toBeUndefined();

    // Verify that the queue was updated
    expect(runQueue.cancelRun).toHaveBeenCalledWith(mockRunId);
  });

  it('should return 400 when threadId is missing', async () => {
    const request = new NextRequest('http://localhost/api/runs//cancel', {
      method: 'POST',
    });

    const response = await POST(request, { params: { threadId: '' } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('threadId is required');
  });

  it('should return 404 when session is not found', async () => {
    vi.mocked(sessionStore.getSessionByThreadId).mockReturnValue(null);

    const request = new NextRequest(
      'http://localhost/api/runs/thread_123/cancel',
      {
        method: 'POST',
      }
    );

    const response = await POST(request, {
      params: { threadId: mockThreadId },
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Session not found or expired');
  });

  it('should return 404 when no active run is found', async () => {
    vi.mocked(runQueue.getCurrentRun).mockReturnValue(null);

    const request = new NextRequest(
      'http://localhost/api/runs/thread_123/cancel',
      {
        method: 'POST',
      }
    );

    const response = await POST(request, {
      params: { threadId: mockThreadId },
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('No active run found for this thread');
  });

  it('should still cancel locally even if OpenAI cancellation fails', async () => {
    const { assistantManager } = await import('@/lib/openai');
    vi.mocked(assistantManager.cancelRun).mockRejectedValue(
      new Error('OpenAI API error')
    );

    // Set up environment to simulate real OpenAI key
    const originalEnv = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-key';

    try {
      const request = new NextRequest(
        'http://localhost/api/runs/thread_123/cancel',
        {
          method: 'POST',
        }
      );

      const response = await POST(request, {
        params: { threadId: mockThreadId },
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cancelled).toBe(true);
      expect(data.error).toBe('OpenAI API error');

      // Should still cancel in our queue
      expect(runQueue.cancelRun).toHaveBeenCalledWith(mockRunId);
    } finally {
      process.env.OPENAI_API_KEY = originalEnv;
    }
  });

  it('should handle queued runs without OpenAI run ID', async () => {
    vi.mocked(runQueue.getCurrentRun).mockReturnValue({
      id: mockRunId,
      threadId: mockThreadId,
      sessionId: mockSessionId,
      query: 'test query',
      priority: 'normal',
      queuedAt: Date.now(),
      status: 'queued', // Not yet started
      retryCount: 0,
      maxRetries: 2,
      // No openaiRunId
    });

    const request = new NextRequest(
      'http://localhost/api/runs/thread_123/cancel',
      {
        method: 'POST',
      }
    );

    const response = await POST(request, {
      params: { threadId: mockThreadId },
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cancelled).toBe(true);
    expect(data.runId).toBe(mockRunId);

    // Should cancel in our queue
    expect(runQueue.cancelRun).toHaveBeenCalledWith(mockRunId);
  });

  it('should handle demo mode (no OpenAI key)', async () => {
    // Ensure no OpenAI key is set
    const originalEnv = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'your-openai-api-key-here'; // Demo placeholder

    try {
      const request = new NextRequest(
        'http://localhost/api/runs/thread_123/cancel',
        {
          method: 'POST',
        }
      );

      const response = await POST(request, {
        params: { threadId: mockThreadId },
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cancelled).toBe(true);
      expect(data.runId).toBe(mockRunId);

      // Should cancel in our queue
      expect(runQueue.cancelRun).toHaveBeenCalledWith(mockRunId);

      // Should not try to call OpenAI
      const { assistantManager } = await import('@/lib/openai');
      expect(assistantManager.cancelRun).not.toHaveBeenCalled();
    } finally {
      process.env.OPENAI_API_KEY = originalEnv;
    }
  });

  it('should handle server errors gracefully', async () => {
    vi.mocked(runQueue.getCurrentRun).mockImplementation(() => {
      throw new Error('Database connection failed');
    });

    const request = new NextRequest(
      'http://localhost/api/runs/thread_123/cancel',
      {
        method: 'POST',
      }
    );

    const response = await POST(request, {
      params: { threadId: mockThreadId },
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to cancel run');
    expect(data.details).toBe('Database connection failed');
  });
});
