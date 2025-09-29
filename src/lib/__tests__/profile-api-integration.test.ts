import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/analysis/profile/route';
import { AgentType } from '../agents/types';

// Mock telemetry service
vi.mock('../../lib/telemetry', () => ({
  telemetryService: {
    logError: vi.fn(),
  },
  Telemetry: {
    trackSessionEvent: vi.fn(),
    trackAnalysisRequest: vi.fn(),
    trackAnalysisCompletion: vi.fn(),
  },
}));

// Mock the dependencies
vi.mock('../../lib/session-store', () => ({
  sessionStore: {
    getSession: vi.fn(),
    createSession: vi.fn(),
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
  createExecutionContext: vi.fn(),
  AgentType: {
    PROFILING: 'profiling',
  },
}));

// Mock error handler
vi.mock('../../lib/error-handler', () => ({
  AppError: vi
    .fn()
    .mockImplementation((type: string, message: string, options: any) => ({
      type,
      message,
      options,
      toErrorResponse: () => ({ success: false, error: message }),
    })),
  ErrorFactory: {
    sessionNotFound: () => ({
      toErrorResponse: () => ({ success: false, error: 'Session not found' }),
    }),
  },
  ErrorType: {
    VALIDATION_ERROR: 'validation_error',
  },
  defaultRetryHandler: {
    executeWithRetry: vi.fn(),
  },
  classifyError: vi.fn(error => ({
    type: 'UNKNOWN_ERROR',
    message: error.message || 'Unknown error',
    errorClass: 'unknown',
    retryable: false,
    toErrorResponse: () => ({
      success: false,
      error: error.message || 'Unknown error',
    }),
  })),
  createErrorTelemetry: vi.fn(),
}));

// Get the mocked instances
const { sessionStore } = await import('../../lib/session-store');
const { fileStore } = await import('../../lib/file-store');
const { globalOrchestrator } = await import('../../lib/agents');
const { defaultRetryHandler } = await import('../../lib/error-handler');

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
    id: 'test-file-id',
    sessionId: 'test-session',
    filename: 'test.csv',
    originalName: 'test.csv',
    size: mockFileContent.length,
    checksum: 'test-checksum',
    mimeType: 'text/csv',
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    filePath: '/tmp/test.csv',
  };

  const mockProfile = {
    id: 'profile-123',
    version: 1,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    metadata: {
      filename: 'test.csv',
      size: mockFileContent.length,
      encoding: 'utf-8',
      delimiter: ',',
      rowCount: 2,
      columnCount: 3,
      processingTime: 100,
      checksum: 'test-checksum',
    },
    schema: {
      columns: [
        {
          name: 'name',
          type: 'text' as const,
          nullable: true,
          unique: false,
          statistics: {
            avgLength: 5,
            minLength: 4,
            maxLength: 6,
            commonWords: [
              { word: 'john', count: 1 },
              { word: 'jane', count: 1 },
            ],
            encoding: 'utf-8',
            languages: ['en'],
            patterns: [],
          },
          nullCount: 0,
          nullPercentage: 0,
          uniqueCount: 2,
          duplicateCount: 0,
          sampleValues: ['John', 'Jane'],
          qualityFlags: [],
        },
        {
          name: 'age',
          type: 'numeric' as const,
          nullable: true,
          unique: false,
          statistics: {
            min: 25,
            max: 30,
            mean: 27.5,
            median: 27.5,
            mode: [],
            stddev: 2.5,
            variance: 6.25,
            percentiles: { p25: 25, p50: 27.5, p75: 30, p90: 30, p95: 30 },
            histogram: [],
            outliers: [],
          },
          nullCount: 0,
          nullPercentage: 0,
          uniqueCount: 2,
          duplicateCount: 0,
          sampleValues: [25, 30],
          qualityFlags: [],
        },
      ],

      foreignKeys: [],
      relationships: [],
    },
    quality: {
      overall: 95,
      dimensions: {
        completeness: 100,
        consistency: 90,
        accuracy: 95,
        uniqueness: 100,
        validity: 95,
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
      keyFindings: [],
      trends: [],
      anomalies: [],
      recommendations: [],
      suggestedQueries: [],
    },
    sampleData: [
      { name: 'John', age: 25, city: 'NYC' },
      { name: 'Jane', age: 30, city: 'LA' },
    ],
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

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(sessionStore.getSession).mockReturnValue(mockSession);
    vi.mocked(sessionStore.createSession).mockReturnValue(mockSession);
    vi.mocked(sessionStore.updateSession).mockReturnValue(true);
    vi.mocked(fileStore.getFile).mockResolvedValue(mockFileContent);
    vi.mocked(fileStore.getFileMetadata).mockReturnValue(mockFileMetadata);
    vi.mocked(globalOrchestrator.getAgent).mockReturnValue(undefined);
    vi.mocked(globalOrchestrator.registerAgent).mockResolvedValue(undefined);
    vi.mocked(globalOrchestrator.processDataUpload).mockResolvedValue(
      mockProfile
    );
    vi.mocked(defaultRetryHandler.executeWithRetry).mockImplementation(
      async (fn: () => any) => await fn()
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
    expect(result.status).toBe('completed');
    // Compare profile with date serialization adjustments
    const expectedProfile = {
      ...mockProfile,
      createdAt: mockProfile.createdAt.toISOString(),
      expiresAt: mockProfile.expiresAt.toISOString(),
    };
    expect(result.profile).toEqual(expectedProfile);
    expect(result.sessionId).toBe('test-session');
    expect(result.threadId).toBe('test-thread');

    // Verify agent orchestrator was called correctly
    expect(globalOrchestrator.getAgent).toHaveBeenCalledWith(
      AgentType.PROFILING
    );
    expect(globalOrchestrator.registerAgent).toHaveBeenCalled();
    expect(globalOrchestrator.processDataUpload).toHaveBeenCalledWith({
      buffer: mockFileContent,
      name: 'test.csv',
      mimeType: 'text/csv',
      size: mockFileContent.length,
    });

    // Verify session was updated with profile data
    expect(sessionStore.updateSession).toHaveBeenCalledWith('test-session', {
      uploadedFile: {
        id: 'test-file-id',
        filename: 'test.csv',
        size: mockFileContent.length,
        checksum: 'test-checksum',
      },
      dataProfile: mockProfile,
    });
  });

  it('should handle missing file error', async () => {
    vi.mocked(fileStore.getFile).mockResolvedValue(null);

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
    vi.mocked(globalOrchestrator.processDataUpload).mockRejectedValue(
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
    const mockExistingAgent = {
      type: AgentType.PROFILING,
      name: 'DataProfilingAgent',
      version: '1.0.0',
      execute: vi.fn(),
      validateInput: vi.fn(),
      getHealth: vi.fn(),
      destroy: vi.fn(),
    };
    vi.mocked(globalOrchestrator.getAgent).mockReturnValue(
      mockExistingAgent as any
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

    expect(response.status).toBe(200);
    expect(result.status).toBe('completed');

    // Should not register a new agent
    expect(globalOrchestrator.registerAgent).not.toHaveBeenCalled();
    // But should still process the upload
    expect(globalOrchestrator.processDataUpload).toHaveBeenCalled();
  });
});
