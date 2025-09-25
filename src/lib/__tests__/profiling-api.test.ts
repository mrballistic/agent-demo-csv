import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/analysis/profile/route';
import { GET } from '../../app/api/artifacts/[id]/download/route';

// Mock the dependencies
vi.mock('../openai', () => ({
  assistantManager: {
    createAssistant: vi.fn(() => Promise.resolve({ id: 'asst_test123' })),
    createThread: vi.fn(() => Promise.resolve({ id: 'thread_test123' })),
    createMessage: vi.fn(() => Promise.resolve({ id: 'msg_test123' })),
    createRun: vi.fn(() =>
      Promise.resolve({
        id: 'run_test123',
        status: 'queued',
        thread_id: 'thread_test123',
      })
    ),
  },
}));

vi.mock('../session-store', () => ({
  sessionStore: {
    createSession: vi.fn(threadId => ({
      id: 'session_test123',
      threadId,
      metrics: {
        analysesCount: 0,
        uploadsCount: 0,
        artifactsGenerated: 0,
        totalTokensUsed: 0,
      },
    })),
    getSession: vi.fn(() => ({
      id: 'session_test123',
      threadId: 'thread_test123',
      metrics: {
        analysesCount: 0,
        uploadsCount: 0,
        artifactsGenerated: 0,
        totalTokensUsed: 0,
      },
    })),
    updateSession: vi.fn(() => true),
  },
}));

vi.mock('../file-store', () => ({
  fileStore: {
    getFileMetadata: vi.fn(() => ({
      id: 'file_test123',
      originalName: 'test_summary.md',
      size: 100,
      mimeType: 'text/markdown',
      checksum: 'abc123',
    })),
    getFile: vi.fn(() => Promise.resolve(Buffer.from('Test file content'))),
    verifyFileIntegrity: vi.fn(() => Promise.resolve(true)),
  },
}));

describe('Profiling API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/analysis/profile', () => {
    it('should create a profiling analysis', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/analysis/profile',
        {
          method: 'POST',
          body: JSON.stringify({ fileId: 'test-file-123' }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        runId: 'run_test123',
        threadId: 'thread_test123',
        sessionId: 'session_test123',
        status: 'queued',
      });
    });

    it('should return error when fileId is missing', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/analysis/profile',
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('fileId is required');
    });
  });

  describe('GET /api/artifacts/[id]/download', () => {
    it('should download an artifact file', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/artifacts/file_test123/download'
      );

      const response = await GET(request, { params: { id: 'file_test123' } });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/markdown');
      expect(response.headers.get('Content-Disposition')).toContain(
        'attachment'
      );
      expect(response.headers.get('Content-Disposition')).toContain(
        'test_summary.md'
      );

      const content = await response.text();
      expect(content).toBe('Test file content');
    });

    it('should return 404 for non-existent artifact', async () => {
      // Mock file store to return null
      const { fileStore } = await import('../file-store');
      vi.mocked(fileStore.getFileMetadata).mockReturnValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/artifacts/nonexistent/download'
      );

      const response = await GET(request, { params: { id: 'nonexistent' } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Artifact not found or expired');
    });

    it('should return 400 when artifact ID is missing', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/artifacts//download'
      );

      const response = await GET(request, { params: { id: '' } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Artifact ID is required');
    });
  });
});
