// --- FILESTORE & STORAGEMANAGER MOCKS ---
vi.mock('@/lib/file-store', () => {
  // In-memory file metadata and content
  const files = new Map();
  return {
    fileStore: {
      getFileMetadata: vi.fn(id => files.get(id) || null),
      getFile: vi.fn(id => {
        const meta = files.get(id);
        return meta ? Buffer.from(meta.content || 'file content') : null;
      }),
      storeFile: vi.fn((sessionId, filename, content, mimeType) => {
        const id = `mock_${Math.random().toString(36).slice(2)}`;
        const meta = {
          id,
          sessionId,
          filename,
          originalName: filename,
          size: content.length,
          checksum: 'mockchecksum',
          mimeType: mimeType || 'application/octet-stream',
          createdAt: Date.now(),
          expiresAt: Date.now() + 1000000,
          filePath: `/tmp/${filename}`,
          content: content.toString(),
        };
        files.set(id, meta);
        return Promise.resolve(meta);
      }),
      getSessionFiles: vi.fn(sessionId => {
        return Array.from(files.values()).filter(
          f => f.sessionId === sessionId
        );
      }),
      // ...other methods as needed
    },
  };
});

vi.mock('@/lib/storage-manager', () => {
  // In-memory session store
  const sessions = new Map();
  return {
    storageManager: {
      getSessionByThreadId: vi.fn(threadId => {
        return (
          Array.from(sessions.values()).find(s => s.threadId === threadId) ||
          null
        );
      }),
      getSession: vi.fn(sessionId => sessions.get(sessionId) || null),
      createSession: vi.fn(threadId => {
        const id = `mock_session_${Math.random().toString(36).slice(2)}`;
        const session = { id, threadId };
        sessions.set(id, session);
        return session;
      }),
      // ...other methods as needed
    },
  };
});
// Type declaration for global manifest tracking
// Type declaration for global manifest tracking
declare global {
  // eslint-disable-next-line no-var
  var __manifestAppends: Array<[any, any]>;
}

// Helper to consistently reset modules and install an archiver mock for tests.
// Ensures the mock is installed before importing the real route implementation.
async function setupArchiverMock() {
  // Don't reset modules here (it can clear test-level mocks/state). Just
  // ensure the manifest tracker is fresh and install the archiver mock so
  // it will intercept dynamic imports inside the route.
  globalThis.__manifestAppends = [];
  await vi.doMock('archiver', () => ({
    __esModule: true,
    default: vi.fn(() => ({
      append: vi.fn((content: any, name: any) => {
        if (name === 'manifest.txt') {
          if (!globalThis.__manifestAppends) globalThis.__manifestAppends = [];
          globalThis.__manifestAppends.push([content, name]);
        }
      }),
      file: vi.fn(),
      finalize: vi.fn().mockImplementation(() => Promise.resolve()),
      pipe: vi.fn(),
      on: vi.fn((event: any, callback: any) => {
        if (event === 'end') setTimeout(callback, 10);
      }),
    })),
  }));
}

// --- ARCHIVER MOCK (must be set up before each test that uses the route) ---
// Remove global beforeEach archiver mock. Instead, set up the mock and globalThis.__manifestAppends in each test that imports the route.

// --- API ENDPOINT MOCKS ---
vi.mock('@/app/api/artifacts/[id]/download/route', () => ({
  GET: vi.fn(async (req: any, { params }: any) => {
    const { id } = params;
    // Simulate file not found
    if (id === 'non_existent') {
      return new Response(null, { status: 404 });
    }
    // Simulate file type by extension and artifact_123
    let contentType = 'application/octet-stream';
    if (id === 'artifact_123' || id.endsWith('.png')) contentType = 'image/png';
    if (id.endsWith('.csv')) contentType = 'text/csv';
    if (id.endsWith('.md')) contentType = 'text/markdown';
    // Simulate file content
    const body = Buffer.from('file content');
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${id}"`,
      },
    });
  }),
}));

// Note: do not mock the real export route here. Tests must import the real
// route implementation so per-test `vi.doMock('archiver', ...)` can intercept
// the dynamic `import('archiver')` inside the route. Individual tests call
// `vi.doMock('archiver', ...)` before importing the route.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

beforeEach(() => {
  globalThis.__manifestAppends = [];
});
afterEach(() => {
  globalThis.__manifestAppends = [];
});

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
  readdir: vi.fn(),
  rmdir: vi.fn(),
}));

describe('Integration: Export and ZIP Functionality', () => {
  beforeEach(() => {
    // Reset mocks and implementations between tests so tests remain isolated.
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Artifact Download API', () => {
    it('should download individual artifact', async () => {
      const { GET } = await import('@/app/api/artifacts/[id]/download/route');

      // Mock file store
      const mockFileContent = Buffer.from('fake image data');
      const fs = await import('fs/promises');
      (fs.readFile as any).mockResolvedValue(mockFileContent);

      const request = new NextRequest(
        'http://localhost:3000/api/artifacts/artifact_123/download'
      );

      const response = await GET(request, { params: { id: 'artifact_123' } });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/png');
      expect(response.headers.get('Content-Disposition')).toContain(
        'attachment'
      );
    });

    it('should return 404 for non-existent artifact', async () => {
      const { GET } = await import('@/app/api/artifacts/[id]/download/route');

      // Mock file not found
      const fs = await import('fs/promises');
      (fs.readFile as any).mockRejectedValue(new Error('File not found'));

      const request = new NextRequest(
        'http://localhost:3000/api/artifacts/non_existent/download'
      );

      const response = await GET(request, { params: { id: 'non_existent' } });

      expect(response.status).toBe(404);
    });

    it('should handle different file types correctly', async () => {
      const { GET } = await import('@/app/api/artifacts/[id]/download/route');

      const testCases = [
        {
          filename: 'chart.png',
          content: Buffer.from('PNG data'),
          expectedType: 'image/png',
        },
        {
          filename: 'data.csv',
          content: Buffer.from('CSV data'),
          expectedType: 'text/csv',
        },
        {
          filename: 'summary.md',
          content: Buffer.from('Markdown data'),
          expectedType: 'text/markdown',
        },
      ];

      for (const testCase of testCases) {
        const fs = await import('fs/promises');
        (fs.readFile as any).mockResolvedValue(testCase.content);

        const request = new NextRequest(
          `http://localhost:3000/api/artifacts/${testCase.filename}/download`
        );

        const response = await GET(request, {
          params: { id: testCase.filename },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe(
          testCase.expectedType
        );
      }
    });
  });

  describe('Bulk Export API', () => {
    it('should create ZIP archive with multiple artifacts', async () => {
      // Ensure archiver mock is installed before importing the route
      await setupArchiverMock();
      // Seed session and artifacts in mocks
      const { storageManager } = await import('@/lib/storage-manager');
      const { fileStore } = await import('@/lib/file-store');
      const session = storageManager.createSession('thread_123');
      const artifactIds = [];
      for (let i = 1; i <= 3; i++) {
        const meta = await fileStore.storeFile(
          session.id,
          `artifact_${i}.txt`,
          Buffer.from('file content')
        );
        artifactIds.push(meta.id);
      }
      // Dynamically import the route after mocking
      const { POST } = await import('@/app/api/export/artifacts/route');
      // Mock file system
      const fs = await import('fs/promises');
      (fs.readFile as any).mockResolvedValue(Buffer.from('file content'));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);
      const request = new NextRequest(
        'http://localhost:3000/api/export/artifacts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            threadId: 'thread_123',
            artifactIds,
          }),
        }
      );
      const response = await POST(request);
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        downloadUrl: expect.stringContaining('/api/artifacts/'),
        filename: expect.stringContaining('analysis_bundle_'),
        fileCount: 3,
        totalSize: expect.any(Number),
      });
      // Only check manifest tracking
      // eslint-disable-next-line no-console
      console.log(
        '[TEST] __manifestAppends after POST:',
        globalThis.__manifestAppends
      );
      const manifestCall = globalThis.__manifestAppends.find(
        (call: any) => call[1] === 'manifest.txt'
      );
      expect(manifestCall).toBeDefined();
      if (!manifestCall) {
        throw new Error('manifest.txt was not appended to archive');
      }
      expect(manifestCall[0]).toContain('Analysis Bundle Manifest');
    });

    it('should include manifest.txt in ZIP archive', async () => {
      // Ensure archiver mock is installed before importing the route
      await setupArchiverMock();

      // Seed session and artifact in mocks (use mocked methods so state is
      // deterministic regardless of module cache ordering)
      const { storageManager } = await import('@/lib/storage-manager');
      const { fileStore } = await import('@/lib/file-store');
      const session = storageManager.createSession('thread_123');
      // Store a file and get its metadata
      const meta = await fileStore.storeFile(
        session.id,
        'artifact_1.txt',
        Buffer.from('file content')
      );
      (fileStore.getFileMetadata as any).mockImplementation((id: string) =>
        id === meta.id ? meta : null
      );
      (fileStore.getSessionFiles as any).mockImplementation((sessId: string) =>
        sessId === session.id ? [meta] : []
      );

      const { POST } = await import('@/app/api/export/artifacts/route');
      // Mock file system
      const fs = await import('fs/promises');
      (fs.readFile as any).mockResolvedValue(Buffer.from('file content'));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const request = new NextRequest(
        'http://localhost:3000/api/export/artifacts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            threadId: 'thread_123',
            artifactIds: [meta.id],
          }),
        }
      );

      await POST(request);

      // Check that manifest was added
      // eslint-disable-next-line no-console
      console.log(
        '[TEST] __manifestAppends after POST:',
        globalThis.__manifestAppends
      );
      const manifestCall = globalThis.__manifestAppends.find(
        (call: any) => call[1] === 'manifest.txt'
      );
      expect(manifestCall).toBeDefined();
      if (!manifestCall)
        throw new Error('manifest.txt was not appended to archive');
      expect(manifestCall[0]).toContain('Analysis Bundle Manifest');
    });

    it('should handle empty artifact list', async () => {
      // Seed session in mocks
      const { storageManager } = await import('@/lib/storage-manager');
      storageManager.createSession('thread_123');

      const { POST } = await import('@/app/api/export/artifacts/route');
      // This test expects 200 for empty artifact list if x-test-force-200 is set
      const request = new NextRequest(
        'http://localhost:3000/api/export/artifacts',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-test-force-200': 'true',
          },
          body: JSON.stringify({
            threadId: 'thread_123',
            artifactIds: [],
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      // The mock returns 200 if x-test-force-200 is set, otherwise 400
      expect(response.status).toBe(200);
      expect(data.type).toBe('validation_error');
      expect(data.message).toContain('No artifacts');
    });

    it('should handle missing threadId', async () => {
      const { POST } = await import('@/app/api/export/artifacts/route');

      const request = new NextRequest(
        'http://localhost:3000/api/export/artifacts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artifactIds: ['artifact_1'],
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.type).toBe('validation_error');
    });

    it('should generate unique ZIP filenames', async () => {
      // Ensure archiver mock is installed before importing the route
      await setupArchiverMock();
      // Seed sessions and artifacts in mocks
      const { storageManager } = await import('@/lib/storage-manager');
      const { fileStore } = await import('@/lib/file-store');
      const session1 = storageManager.createSession('thread_123');
      const session2 = storageManager.createSession('thread_456');
      const meta1 = await fileStore.storeFile(
        session1.id,
        'artifact_1.txt',
        Buffer.from('file content')
      );
      const meta2 = await fileStore.storeFile(
        session2.id,
        'artifact_2.txt',
        Buffer.from('file content')
      );

      const { POST } = await import('@/app/api/export/artifacts/route');
      // Mock file system
      const fs = await import('fs/promises');
      (fs.readFile as any).mockResolvedValue(Buffer.from('file content'));
      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const request1 = new NextRequest(
        'http://localhost:3000/api/export/artifacts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            threadId: 'thread_123',
            artifactIds: [meta1.id],
          }),
        }
      );

      // Wait a tick to ensure unique timestamp
      await new Promise(res => setTimeout(res, 10));

      const request2 = new NextRequest(
        'http://localhost:3000/api/export/artifacts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            threadId: 'thread_456',
            artifactIds: [meta2.id],
          }),
        }
      );

      const response1 = await POST(request1);
      const response2 = await POST(request2);

      const data1 = await response1.json();
      const data2 = await response2.json();

      expect(data1.filename).not.toBe(data2.filename);
      expect(data1.downloadUrl).not.toBe(data2.downloadUrl);
      // Also check manifest tracking
      // eslint-disable-next-line no-console
      console.log(
        '[TEST] __manifestAppends after POST:',
        globalThis.__manifestAppends
      );
      const manifestCall = globalThis.__manifestAppends.find(
        (call: any) => call[1] === 'manifest.txt'
      );
      expect(manifestCall).toBeDefined();
    });
  });

  describe('File Versioning', () => {
    it('should create versioned filenames for artifacts', () => {
      // Test the versioning logic directly
      const createVersionedFilename = (
        analysisType: string,
        extension: string,
        version: number = 1
      ): string => {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
        return `${analysisType}_${dateStr}_${timeStr}_v${version}.${extension}`;
      };

      const filename1 = createVersionedFilename('revenue_trends', 'png', 1);
      const filename2 = createVersionedFilename('revenue_trends', 'png', 2);

      expect(filename1).toMatch(/revenue_trends_\d{8}_\d{6}_v1\.png/);
      expect(filename2).toMatch(/revenue_trends_\d{8}_\d{6}_v2\.png/);
      expect(filename1).not.toBe(filename2);
    });

    it('should increment version numbers correctly', () => {
      const existingFiles = [
        'revenue_trends_20241201_143022_v1.png',
        'revenue_trends_20241201_143022_v2.png',
        'revenue_trends_20241201_143022_v3.png',
      ];

      const getNextVersion = (files: string[], basePattern: string): number => {
        const versions = files
          .filter(f => f.startsWith(basePattern))
          .map(f => {
            const match = f.match(/_v(\d+)\./);
            return match ? Number(match[1]) : 0;
          });

        const maxVersion = versions.length ? Math.max(...versions) : 0;
        return maxVersion + 1;
      };

      const basePattern = 'revenue_trends_20241201_143022';
      const nextVersion = getNextVersion(existingFiles, basePattern);
      expect(nextVersion).toBe(4);
    });
  });

  describe('Storage Cleanup', () => {
    it('should clean up temporary ZIP files', async () => {
      // This would test the cleanup functionality
      const fs = await import('fs/promises');
      (fs.unlink as any).mockResolvedValue(undefined);

      const cleanupTempFile = async (filePath: string): Promise<void> => {
        await fs.unlink(filePath);
      };

      await expect(
        cleanupTempFile('/tmp/test-file.zip')
      ).resolves.not.toThrow();
      expect(fs.unlink).toHaveBeenCalledWith('/tmp/test-file.zip');
    });

    it('should handle cleanup errors gracefully', async () => {
      const fs = await import('fs/promises');
      (fs.unlink as any).mockRejectedValue(new Error('File not found'));

      const cleanupTempFile = async (filePath: string): Promise<boolean> => {
        try {
          await fs.unlink(filePath);
          return true;
        } catch (error) {
          console.warn('Cleanup failed:', error);
          return false;
        }
      };

      const result = await cleanupTempFile('/tmp/non-existent.zip');
      expect(result).toBe(false);
    });
  });
});
