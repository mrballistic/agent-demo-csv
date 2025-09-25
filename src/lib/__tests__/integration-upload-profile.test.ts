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

describe('Integration: Upload → Profile Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createMockFile = (content: string, filename: string = 'test.csv') => {
    const buffer = Buffer.from(content, 'utf-8');
    return new File([buffer], filename, { type: 'text/csv' });
  };

  const createFormData = (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return formData;
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

      const request = new NextRequest(
        'http://localhost:3000/api/files/upload',
        {
          method: 'POST',
          body: formData,
        }
      );

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

      const request = new NextRequest(
        'http://localhost:3000/api/files/upload',
        {
          method: 'POST',
          body: formData,
        }
      );

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

      const request = new NextRequest(
        'http://localhost:3000/api/files/upload',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.type).toBe('validation_error');
      expect(data.message).toContain('CSV');
    });

    it('should reject files over 50MB', async () => {
      const { POST } = await import('@/app/api/files/upload/route');

      // Create a large content string (over 50MB)
      const largeContent = 'a,b,c\n' + '1,2,3\n'.repeat(2000000); // ~14MB of repeated content
      const file = new File([largeContent], 'large.csv', { type: 'text/csv' });
      const formData = createFormData(file);

      const request = new NextRequest(
        'http://localhost:3000/api/files/upload',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.type).toBe('validation_error');
      expect(data.message).toContain('50MB');
    });

    it('should handle empty files', async () => {
      const { POST } = await import('@/app/api/files/upload/route');

      const file = createMockFile('');
      const formData = createFormData(file);

      const request = new NextRequest(
        'http://localhost:3000/api/files/upload',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.type).toBe('validation_error');
    });

    it('should handle files with insufficient data', async () => {
      const { POST } = await import('@/app/api/files/upload/route');

      const file = createMockFile('header1,header2'); // Only header, no data
      const formData = createFormData(file);

      const request = new NextRequest(
        'http://localhost:3000/api/files/upload',
        {
          method: 'POST',
          body: formData,
        }
      );

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
        threadId: 'thread_123',
        status: 'queued',
      });
    });

    it('should handle idempotency key', async () => {
      const { POST } = await import('@/app/api/analysis/query/route');

      const idempotencyKey = 'test-key-123';

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
          }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Second request with same key should return same result
      const response2 = await POST(request);
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
      expect(data).toMatchObject({
        suggestions: expect.arrayContaining([
          expect.objectContaining({
            label: expect.any(String),
            query: expect.any(String),
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
      expect(data.type).toBe('validation_error');
    });
  });

  describe('End-to-End Upload → Profile Flow', () => {
    it('should complete full upload and profile workflow', async () => {
      // Step 1: Upload file
      const { POST: uploadPost } = await import('@/app/api/files/upload/route');

      const file = createMockFile(validCSVContent);
      const formData = createFormData(file);

      const uploadRequest = new NextRequest(
        'http://localhost:3000/api/files/upload',
        {
          method: 'POST',
          body: formData,
        }
      );

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
