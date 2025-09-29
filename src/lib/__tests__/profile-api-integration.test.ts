import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/analysis/profile/route';
import { AgentType } from '../../lib/agents/types';

// Mock the dependencies
vi.mock('../../lib/session-store', () => ({
  sessionStore: {
    getSession: vi.fn(),
    updateSession: vi.fn(),
  },
}));

vi.mock('../../lib/file-store', () => ({
  fileStore: {
    getFile: vi.fn(),
    getFileMetadata: vi.fn(),
  },
}));

vi.mock('../../lib/agents', () => ({
  globalOrchestrator: {
    getAgent: vi.fn(),
    registerAgent: vi.fn(),
    processDataUpload: vi.fn(),
  },
  DataProfilingAgent: vi.fn().mockImplementation(() => ({
    type: AgentType.PROFILING,
  })),
}));

// Get the mocked instances
const { sessionStore } = await import('../../lib/session-store');
const { fileStore } = await import('../../lib/file-store');
const { globalOrchestrator } = await import('../../lib/agents');

describe('Profile API Integration', () => {
  const mockSession = {
    id: 'test-session',
    threadId: 'test-thread',
    ttlExpiresAt: Date.now() + 3600000,
    lastActivity: Date.now(),
    metrics: {
      uploadsCount: 0,
      analysesCount: 0,
      artifactsGenerated: 0,
      totalTokensUsed: 0,
    },
    messages: [],
    artifacts: [],
  };

  const mockFileContent = Buffer.from('name,age,city\nJohn,25,NYC\nJane,30,LA');
  const mockFileMetadata = {
    originalName: 'test.csv',
    size: mockFileContent.length,
    mimeType: 'text/csv',
    checksum: 'test-checksum',
  };

  const mockProfile = {
    summary: {
      rowCount: 2,
      columnCount: 3,
      totalSize: mockFileContent.length,
      completeness: 1.0,
      quality: 'good',
    },
    columns: [
      {
        name: 'name',
        type: 'text',
        uniqueCount: 2,
        nullCount: 0,
        quality: { score: 1.0, issues: [] },
      },
      {
        name: 'age',
        type: 'integer',
        uniqueCount: 2,
        nullCount: 0,
        quality: { score: 1.0, issues: [] },
        statistics: { min: 25, max: 30, mean: 27.5 },
      },
      {
        name: 'city',
        type: 'text',
        uniqueCount: 2,
        nullCount: 0,
        quality: { score: 1.0, issues: [] },
      },
    ],
    insights: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(sessionStore.getSession).mockReturnValue(mockSession);
    vi.mocked(sessionStore.updateSession).mockResolvedValue(undefined);
    vi.mocked(fileStore.getFile).mockResolvedValue(mockFileContent);
    vi.mocked(fileStore.getFileMetadata).mockReturnValue(mockFileMetadata);
    vi.mocked(globalOrchestrator.getAgent).mockReturnValue(null);
    vi.mocked(globalOrchestrator.registerAgent).mockResolvedValue(undefined);
    vi.mocked(globalOrchestrator.processDataUpload).mockResolvedValue(
      mockProfile
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully profile a CSV file using the Data Profiling Agent', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/analysis/profile',
      {
        method: 'POST',
        body: JSON.stringify({ fileId: 'test-file-id' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('completed');
    expect(result.data.profile).toEqual(mockProfile);

    // Verify agent orchestrator was called correctly
    expect(mockGlobalOrchestrator.getAgent).toHaveBeenCalledWith(
      AgentType.PROFILING
    );
    expect(mockGlobalOrchestrator.registerAgent).toHaveBeenCalled();
    expect(mockGlobalOrchestrator.processDataUpload).toHaveBeenCalledWith({
      buffer: mockFileContent,
      name: 'test.csv',
      mimeType: 'text/csv',
      size: mockFileContent.length,
    });

    // Verify session was updated with profile data
    expect(mockSessionStore.updateSession).toHaveBeenCalledWith(
      'test-session',
      {
        uploadedFile: {
          id: 'test-file-id',
          filename: 'test.csv',
          size: mockFileContent.length,
          checksum: 'test-checksum',
        },
        dataProfile: mockProfile,
      }
    );
  });

  it('should handle missing file error', async () => {
    mockFileStore.getFile.mockResolvedValue(null);

    const request = new NextRequest(
      'http://localhost:3000/api/analysis/profile',
      {
        method: 'POST',
        body: JSON.stringify({ fileId: 'missing-file-id' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found in store');
  });

  it('should handle profiling agent errors gracefully', async () => {
    mockGlobalOrchestrator.processDataUpload.mockRejectedValue(
      new Error('Agent processing failed')
    );

    const request = new NextRequest(
      'http://localhost:3000/api/analysis/profile',
      {
        method: 'POST',
        body: JSON.stringify({ fileId: 'test-file-id' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Agent processing failed');
  });

  it('should reuse existing profiling agent if already registered', async () => {
    const mockExistingAgent = { type: AgentType.PROFILING };
    mockGlobalOrchestrator.getAgent.mockReturnValue(mockExistingAgent);

    const request = new NextRequest(
      'http://localhost:3000/api/analysis/profile',
      {
        method: 'POST',
        body: JSON.stringify({ fileId: 'test-file-id' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);

    // Should not register a new agent
    expect(mockGlobalOrchestrator.registerAgent).not.toHaveBeenCalled();
    // But should still process the upload
    expect(mockGlobalOrchestrator.processDataUpload).toHaveBeenCalled();
  });
});
