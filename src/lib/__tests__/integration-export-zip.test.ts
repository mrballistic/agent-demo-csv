import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import archiver from 'archiver';

// Mock archiver
vi.mock('archiver', () => ({
  default: vi.fn(() => ({
    append: vi.fn(),
    file: vi.fn(),
    finalize: vi.fn(),
    pipe: vi.fn(),
    on: vi.fn(),
  })),
}));

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
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      const { POST } = await import('@/app/api/export/artifacts/route');

      // Mock archiver
      const mockArchive = {
        append: vi.fn(),
        file: vi.fn(),
        finalize: vi.fn().mockResolvedValue(undefined),
        pipe: vi.fn(),
        on: vi.fn((event, callback) => {
          if (event === 'end') {
            setTimeout(callback, 10); // Simulate async completion
          }
        }),
      };
      (archiver as any).mockReturnValue(mockArchive);

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
            artifactIds: ['artifact_1', 'artifact_2', 'artifact_3'],
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

      // Verify archiver was called correctly
      expect(mockArchive.append).toHaveBeenCalledTimes(4); // 3 files + manifest
      expect(mockArchive.finalize).toHaveBeenCalled();
    });

    it('should include manifest.txt in ZIP archive', async () => {
      const { POST } = await import('@/app/api/export/artifacts/route');

      // Mock archiver
      const mockArchive = {
        append: vi.fn(),
        file: vi.fn(),
        finalize: vi.fn().mockResolvedValue(undefined),
        pipe: vi.fn(),
        on: vi.fn((event, callback) => {
          if (event === 'end') {
            setTimeout(callback, 10);
          }
        }),
      };
      (archiver as any).mockReturnValue(mockArchive);

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
            artifactIds: ['artifact_1'],
          }),
        }
      );

      await POST(request);

      // Check that manifest was added
      const manifestCall = (mockArchive.append as any).mock.calls.find(
        (call: any) => call[1] === 'manifest.txt'
      );
      expect(manifestCall).toBeDefined();
      expect(manifestCall[0]).toContain('Analysis Bundle Manifest');
    });

    it('should handle empty artifact list', async () => {
      const { POST } = await import('@/app/api/export/artifacts/route');

      const request = new NextRequest(
        'http://localhost:3000/api/export/artifacts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            threadId: 'thread_123',
            artifactIds: [],
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
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
      const { POST } = await import('@/app/api/export/artifacts/route');

      // Mock archiver
      const mockArchive = {
        append: vi.fn(),
        file: vi.fn(),
        finalize: vi.fn().mockResolvedValue(undefined),
        pipe: vi.fn(),
        on: vi.fn((event, callback) => {
          if (event === 'end') {
            setTimeout(callback, 10);
          }
        }),
      };
      (archiver as any).mockReturnValue(mockArchive);

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
            artifactIds: ['artifact_1'],
          }),
        }
      );

      const request2 = new NextRequest(
        'http://localhost:3000/api/export/artifacts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            threadId: 'thread_456',
            artifactIds: ['artifact_2'],
          }),
        }
      );

      const response1 = await POST(request1);
      const response2 = await POST(request2);

      const data1 = await response1.json();
      const data2 = await response2.json();

      expect(data1.filename).not.toBe(data2.filename);
      expect(data1.downloadUrl).not.toBe(data2.downloadUrl);
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
            return match ? parseInt(match[1], 10) : 0;
          })
          .filter(v => v > 0);

        return versions.length > 0 ? Math.max(...versions) + 1 : 1;
      };

      const nextVersion = getNextVersion(
        existingFiles,
        'revenue_trends_20241201_143022'
      );
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
