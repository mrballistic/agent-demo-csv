import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the OpenAI module
vi.mock('openai', () => ({
  default: vi.fn(() => ({
    beta: {
      assistants: { create: vi.fn() },
      threads: {
        create: vi.fn(),
        messages: { create: vi.fn(), list: vi.fn() },
        runs: { create: vi.fn() },
      },
    },
    files: { create: vi.fn(), content: vi.fn() },
  })),
}));

// Mock environment variables
vi.stubEnv('OPENAI_API_KEY', 'test-api-key');

// In-memory file store mock used across upload/profile tests
vi.mock('@/lib/file-store', () => {
  const files = new Map<string, any>();
  return {
    fileStore: {
      storeFile: vi.fn(
        async (
          sessionId: string,
          filename: string,
          content: Buffer,
          mimeType?: string
        ) => {
          const id = `file_${Math.random().toString(36).slice(2)}`;
          const meta = {
            id,
            sessionId,
            filename,
            originalName: filename,
            size: content.length,
            checksum: 'mockchecksum',
            mimeType: mimeType || 'text/csv',
            createdAt: Date.now(),
            content: content.toString(),
          };
          files.set(id, meta);
          return meta;
        }
      ),
      getFile: vi.fn(async (id: string) => {
        // Provide a fallback for commonly used test id 'file_123'
        if (id === 'file_123') {
          return Buffer.from('order_id,order_date\n1,2024-01-01');
        }
        const meta = files.get(id);
        return meta ? Buffer.from(meta.content || 'file content') : null;
      }),
      getFileMetadata: vi.fn((id: string) => {
        if (id === 'file_123') {
          return {
            id: 'file_123',
            sessionId: 'sess_fallback',
            filename: 'file_123.csv',
            originalName: 'file_123.csv',
            size: 123,
            checksum: 'mockchecksum',
            mimeType: 'text/csv',
            createdAt: Date.now(),
            content: 'order_id,order_date\n1,2024-01-01',
          };
        }
        return files.get(id) || null;
      }),
      getSessionFiles: vi.fn((sessionId: string) => {
        return Array.from(files.values()).filter(
          (f: any) => f.sessionId === sessionId
        );
      }),
    },
  };
});

// Minimal session store mock
vi.mock('@/lib/session-store', () => {
  const sessions = new Map<string, any>();
  return {
    sessionStore: {
      createSession: vi.fn((threadId: string) => {
        const id = `sess_${Math.random().toString(36).slice(2)}`;
        const session = { id, threadId, metrics: { analysesCount: 0 } };
        sessions.set(id, session);
        return session;
      }),
      getSession: vi.fn((id: string) => sessions.get(id) || null),
      getSessionByThreadId: vi.fn((threadId: string) => {
        for (const s of Array.from(sessions.values())) {
          if (s.threadId === threadId) return s;
        }
        return null;
      }),
      updateSession: vi.fn((id: string, patch: any) => {
        const s = sessions.get(id) || {};
        const updated = { ...s, ...patch };
        sessions.set(id, updated);
        return updated;
      }),
    },
  };
});

// Helper to create a lightweight request object that provides formData() and headers.get
function makeFormRequest(formData: FormData) {
  return {
    formData: async () => formData,
    headers: {
      get: (_: string) => null,
    },
  } as unknown as NextRequest;
}

// Telemetry mock
vi.mock('@/lib/telemetry', () => ({
  telemetryService: {
    logError: vi.fn(),
  },
  Telemetry: {
    trackFileUpload: vi.fn(),
    trackAnalysisRequest: vi.fn(),
    trackAnalysisCompletion: vi.fn(),
    trackQueueEvent: vi.fn(),
    trackSessionEvent: vi.fn(),
  },
}));

// Simple error handler mocks (AppError, ErrorFactory, classifyError)
vi.mock('@/lib/error-handler', () => {
  class AppError extends Error {
    type: any;
    errorClass: any;
    constructor(type: any, message: string, opts?: any) {
      super(message);
      this.type = type;
      this.errorClass = opts && opts.errorClass ? opts.errorClass : 'app_error';
    }
    toErrorResponse() {
      return { type: this.type, message: this.message };
    }
  }

  const ErrorFactory = {
    fileTooLarge: (size: number) =>
      new AppError('validation_error', `File too large: ${size}`),
    invalidFileFormat: (name: string) =>
      new AppError('validation_error', `Invalid file format: ${name}`),
    emptyFile: () => new AppError('validation_error', 'Empty file'),
    sessionNotFound: () => new AppError('not_found', 'Session not found'),
  };

  const classifyError = (err: any) => {
    if (err instanceof AppError) return err;
    return new AppError(
      'internal_error',
      err instanceof Error ? err.message : String(err)
    );
  };

  const createErrorTelemetry = (_: any, __: any) => ({});

  const defaultRetryHandler = {
    executeWithRetry: async (fn: any) => fn(),
  };

  const ErrorType = {
    VALIDATION_ERROR: 'validation_error',
  };

  return {
    AppError,
    ErrorFactory,
    classifyError,
    createErrorTelemetry,
    defaultRetryHandler,
    ErrorType,
  };
});

describe('Integration: Upload → Profile Workflow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createMockFile = (content: string, filename: string = 'test.csv') => {
    const buffer = Buffer.from(content, 'utf-8');
    // Return a minimal File-like object that provides arrayBuffer(), name, type, size
    return {
      name: filename,
      type: 'text/csv',
      size: buffer.length,
      arrayBuffer: async () => Uint8Array.from(buffer).buffer,
    } as unknown as File;
  };

  const createLargeMockFile = (
    size: number,
    filename: string = 'large.csv'
  ) => {
    return {
      name: filename,
      type: 'text/csv',
      size,
      arrayBuffer: async () => new Uint8Array(size).buffer,
    } as unknown as File;
  };

  // Lightweight formData-like object used by makeFormRequest to avoid jsdom FormData
  const createFormData = (file: File) => {
    return {
      get: (key: string) => (key === 'file' ? file : null),
    } as unknown as FormData;
  };

  const validCSVContent = `order_id,order_date,customer_email,qty,unit_price
1,2024-01-01,john@example.com,2,29.99
2,2024-01-02,jane@example.com,1,19.99
3,2024-01-03,bob@example.com,3,39.99`;

  describe('File Upload API', () => {
    it('should successfully upload and validate CSV file', async () => {
      const { POST } = await import('@/app/api/files/upload/route');

      const file = createMockFile(validCSVContent);
      const formData = createFormData(file);

      const request = makeFormRequest(formData);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        fileId: expect.any(String),
        filename: 'test.csv',
        size: expect.any(Number),
        rowCount: 3,
        profileHints: {
          columnCount: 5,
          hasHeaders: true,
          sampleData: expect.arrayContaining([
            ['order_id', 'order_date', 'customer_email', 'qty', 'unit_price'],
            ['1', '2024-01-01', 'john@example.com', '2', '29.99'],
          ]),
        },
      });
    });

    it('should detect PII in uploaded CSV', async () => {
      const { POST } = await import('@/app/api/files/upload/route');

      const piiCSV = `customer_name,email,phone,address,order_total
John Doe,john@example.com,555-1234,123 Main St,99.99
Jane Smith,jane@example.com,555-5678,456 Oak Ave,149.99`;

      const file = createMockFile(piiCSV);
      const formData = createFormData(file);

      const request = makeFormRequest(formData);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.profileHints.sampleData[0]).toContain('customer_name');
      expect(data.profileHints.sampleData[0]).toContain('email');
      expect(data.profileHints.sampleData[0]).toContain('phone');
    });

    it('should reject non-CSV files', async () => {
      const { POST } = await import('@/app/api/files/upload/route');

      const file = createMockFile('{"data": "json"}', 'test.json');
      const formData = createFormData(file);

      const request = makeFormRequest(formData);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.type).toBe('validation_error');
      expect(data.message).toContain('Invalid file format');
    });

    it('should reject files over 50MB', async () => {
      const { POST } = await import('@/app/api/files/upload/route');
      // Create a mock file that reports a size slightly over 50MB so validation fails
      const file = createLargeMockFile(50 * 1024 * 1024 + 1, 'large.csv');
      const formData = createFormData(file);

      const request = makeFormRequest(formData);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.type).toBe('validation_error');
      expect(data.message).toContain('File too large');
    });

    it('should handle empty files', async () => {
      const { POST } = await import('@/app/api/files/upload/route');

      const file = createMockFile('');
      const formData = createFormData(file);

      const request = makeFormRequest(formData);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.type).toBe('validation_error');
    });

    it('should handle files with insufficient data', async () => {
      const { POST } = await import('@/app/api/files/upload/route');

      const file = createMockFile('header1,header2'); // Only header, no data
      const formData = createFormData(file);

      const request = makeFormRequest(formData);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.type).toBe('validation_error');
      expect(data.message).toContain('header row and one data row');
    });
  });

  describe('Profile Analysis API', () => {
    it('should create profile analysis request', async () => {
      const { POST } = await import('@/app/api/analysis/profile/route');

      // Mock OpenAI responses
      const mockOpenAI = (await import('openai')).default;
      const mockClient = new mockOpenAI();

      (mockClient.beta.assistants.create as any).mockResolvedValue({
        id: 'asst_123',
      });
      (mockClient.beta.threads.create as any).mockResolvedValue({
        id: 'thread_123',
      });
      (mockClient.beta.threads.messages.create as any).mockResolvedValue({
        id: 'msg_123',
      });
      (mockClient.beta.threads.runs.create as any).mockResolvedValue({
        id: 'run_123',
        status: 'queued',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/analysis/profile',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: 'file_123' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        runId: expect.any(String),
        threadId: expect.any(String),
        status: 'queued',
      });
    });

    it('should handle missing fileId in profile request', async () => {
      const { POST } = await import('@/app/api/analysis/profile/route');

      const request = new NextRequest(
        'http://localhost:3000/api/analysis/profile',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.type).toBe('validation_error');
    });
  });

  describe('Query Analysis API', () => {
    it('should create query analysis request', async () => {
      const { POST } = await import('@/app/api/analysis/query/route');

      // Mock OpenAI responses
      const mockOpenAI = (await import('openai')).default;
      const mockClient = new mockOpenAI();

      (mockClient.beta.assistants.create as any).mockResolvedValue({
        id: 'asst_123',
      });
      (mockClient.beta.threads.create as any).mockResolvedValue({
        id: 'thread_123',
      });
      (mockClient.beta.threads.messages.create as any).mockResolvedValue({
        id: 'msg_123',
      });
      (mockClient.beta.threads.runs.create as any).mockResolvedValue({
        id: 'run_123',
        status: 'queued',
      });

      // Ensure a session exists for the threadId used in this test
      const ss = (await import('@/lib/session-store')).sessionStore;
      ss.createSession('thread_123');

      const request = new NextRequest(
        'http://localhost:3000/api/analysis/query',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: 'file_123',
            query: 'Show revenue trends',
            threadId: 'thread_123',
          }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        runId: expect.any(String),
        status: 'queued',
      });
    });

    it('should handle idempotency key', async () => {
      const { POST } = await import('@/app/api/analysis/query/route');

      const idempotencyKey = 'test-key-123';

      // Ensure a session exists for the threads used by idempotency test
      const ss2 = (await import('@/lib/session-store')).sessionStore;
      ss2.createSession('thread_123');

      const request = new NextRequest(
        'http://localhost:3000/api/analysis/query',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            fileId: 'file_123',
            query: 'Show revenue trends',
            threadId: 'thread_123',
          }),
        }
      );

      const request1 = new NextRequest(
        'http://localhost:3000/api/analysis/query',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            fileId: 'file_123',
            query: 'Show revenue trends',
            threadId: 'thread_123',
          }),
        }
      );

      const request2 = new NextRequest(
        'http://localhost:3000/api/analysis/query',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            fileId: 'file_123',
            query: 'Show revenue trends',
            threadId: 'thread_123',
          }),
        }
      );

      const response = await POST(request1);
      expect(response.status).toBe(200);

      // Second request with same key should return same result (new request instance)
      const response2 = await POST(request2);
      expect(response2.status).toBe(200);
    });
  });

  describe('Suggestions API', () => {
    it('should generate analysis suggestions', async () => {
      const { GET } = await import('@/app/api/analysis/suggestions/route');

      const request = new NextRequest(
        'http://localhost:3000/api/analysis/suggestions?fileId=file_123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Suggestions shape: array of suggestion items with label and requiredColumns
      expect(data).toMatchObject({
        suggestions: expect.arrayContaining([
          expect.objectContaining({
            label: expect.any(String),
            requiredColumns: expect.any(Array),
          }),
        ]),
      });
    });

    it('should handle missing fileId in suggestions', async () => {
      const { GET } = await import('@/app/api/analysis/suggestions/route');

      const request = new NextRequest(
        'http://localhost:3000/api/analysis/suggestions'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });
  });

  describe('End-to-End Upload → Profile Flow', () => {
    it('should complete full upload and profile workflow', async () => {
      // Step 1: Upload file
      const { POST: uploadPost } = await import('@/app/api/files/upload/route');

      const file = createMockFile(validCSVContent);
      const formData = createFormData(file);

      const uploadRequest = makeFormRequest(formData);

      const uploadResponse = await uploadPost(uploadRequest);
      const uploadData = await uploadResponse.json();

      expect(uploadResponse.status).toBe(200);
      expect(uploadData.fileId).toBeDefined();

      // Step 2: Get suggestions
      const { GET: suggestionsGet } = await import(
        '@/app/api/analysis/suggestions/route'
      );

      const suggestionsRequest = new NextRequest(
        `http://localhost:3000/api/analysis/suggestions?fileId=${uploadData.fileId}`
      );

      const suggestionsResponse = await suggestionsGet(suggestionsRequest);
      const suggestionsData = await suggestionsResponse.json();

      expect(suggestionsResponse.status).toBe(200);
      expect(suggestionsData.suggestions).toHaveLength(5);

      // Step 3: Create profile analysis
      const { POST: profilePost } = await import(
        '@/app/api/analysis/profile/route'
      );

      // Mock OpenAI responses
      const mockOpenAI = (await import('openai')).default;
      const mockClient = new mockOpenAI();

      (mockClient.beta.assistants.create as any).mockResolvedValue({
        id: 'asst_123',
      });
      (mockClient.beta.threads.create as any).mockResolvedValue({
        id: 'thread_123',
      });
      (mockClient.beta.threads.messages.create as any).mockResolvedValue({
        id: 'msg_123',
      });
      (mockClient.beta.threads.runs.create as any).mockResolvedValue({
        id: 'run_123',
        status: 'queued',
      });

      const profileRequest = new NextRequest(
        'http://localhost:3000/api/analysis/profile',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: uploadData.fileId }),
        }
      );

      const profileResponse = await profilePost(profileRequest);
      const profileData = await profileResponse.json();

      expect(profileResponse.status).toBe(200);
      expect(profileData.runId).toBeDefined();
      expect(profileData.threadId).toBeDefined();
    });
  });
});
