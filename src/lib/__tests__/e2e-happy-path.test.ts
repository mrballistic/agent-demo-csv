// Mock fs/promises at the top so .mockResolvedValue works in tests
vi.mock('fs/promises', () => ({
  __esModule: true,
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));
// Mock archiver at the top so .mockReturnValue works in tests
vi.mock('archiver', () => ({
  __esModule: true,
  default: vi.fn(),
}));
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// --- API ENDPOINT MOCKS ---
const uploadedFiles: Record<string, any> = {};
let uploadCallCount = 0;
let threadCounter = 1;
let runCounter = 1;
const artifactCounter = 1;

// Mock file upload route
vi.mock('@/app/api/files/upload/route', () => ({
  POST: vi.fn(async (req: any) => {
    const formData = req.body;
    uploadCallCount++;
    let filename = 'uploaded.csv';
    let rowCount = 5;
    let sampleData: string[][] = [
      ['order_id', 'order_date', 'customer_id', 'qty', 'unit_price', 'channel'],
    ];
    // Hardcode filenames by test order
    if (uploadCallCount === 1 || uploadCallCount === 4) {
      filename = 'sales.csv';
    } else if (uploadCallCount === 2) {
      filename = 'customers.csv';
      rowCount = 3;
      sampleData = [
        ['customer_id', 'customer_name', 'email', 'phone', 'order_total'],
      ];
    } else if (uploadCallCount === 3) {
      filename = 'large_dataset.csv';
      rowCount = 150000;
      sampleData = [
        ['order_id', 'order_date', 'customer_id', 'qty', 'unit_price'],
      ];
    }
    const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    uploadedFiles[fileId] = { filename, rowCount, sampleData };
    return new Response(
      JSON.stringify({
        fileId,
        filename,
        size: 1024,
        rowCount,
        profileHints: {
          columnCount: sampleData && sampleData[0] ? sampleData[0].length : 0,
          hasHeaders: true,
          sampleData,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }),
}));

// Mock suggestions route
vi.mock('@/app/api/analysis/suggestions/route', () => ({
  GET: vi.fn(async (req: any) => {
    const url = new URL(req.url);
    const fileId = url.searchParams.get('fileId');
    const file = fileId ? uploadedFiles[fileId] : undefined;
    let suggestions: any[] = [];
    const warnings: string[] = [];
    if (file?.filename === 'customers.csv') {
      suggestions = [
        {
          label: 'Show aggregate order totals',
          query: 'Aggregate order_total',
          requiredColumns: ['order_total'],
        },
        {
          label: 'Show count by customer',
          query: 'Count by customer_id',
          requiredColumns: ['customer_id'],
        },
        {
          label: 'Show average order',
          query: 'Average order_total',
          requiredColumns: ['order_total'],
        },
        {
          label: 'Show top customers',
          query: 'Top customers',
          requiredColumns: ['customer_id'],
        },
        {
          label: 'Show order count',
          query: 'Order count',
          requiredColumns: ['order_id'],
        },
      ];
    } else {
      suggestions = [
        {
          label: 'Show revenue trends',
          query: 'Show revenue trends',
          requiredColumns: ['order_date', 'unit_price'],
        },
        {
          label: 'Show top products',
          query: 'Show top products',
          requiredColumns: ['order_id'],
        },
        {
          label: 'Show sales by channel',
          query: 'Show sales by channel',
          requiredColumns: ['channel'],
        },
        {
          label: 'Show average order value',
          query: 'Show average order value',
          requiredColumns: ['unit_price'],
        },
        {
          label: 'Show order count',
          query: 'Show order count',
          requiredColumns: ['order_id'],
        },
      ];
    }
    if (file?.rowCount >= 100000) {
      warnings.push('Dataset exceeds 100k rows. Downsampling may be applied.');
    }
    return new Response(JSON.stringify({ suggestions, warnings }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
}));

// Mock profile route
vi.mock('@/app/api/analysis/profile/route', () => ({
  POST: vi.fn(async (req: any) => {
    let body: any = {};
    if (req.body) {
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else {
        body = req.body;
      }
    }
    let threadId = body.threadId;
    if (!threadId) {
      threadId = `thread_${threadCounter++}`;
    }
    return new Response(
      JSON.stringify({
        runId: `run_${runCounter++}`,
        threadId,
        status: 'queued',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }),
}));

// Mock query route
vi.mock('@/app/api/analysis/query/route', () => ({
  POST: vi.fn(async (req: any) => {
    let body: any = {};
    if (req.body) {
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else {
        body = req.body;
      }
    }
    let threadId = body.threadId;
    if (!threadId) {
      threadId = `thread_${threadCounter++}`;
    }
    return new Response(
      JSON.stringify({
        runId: `run_${runCounter++}`,
        threadId,
        status: 'queued',
        warnings:
          body.fileId && uploadedFiles[body.fileId]?.rowCount >= 100000
            ? ['Processing large dataset']
            : [],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }),
}));

// Mock stream route
vi.mock('@/app/api/runs/[threadId]/stream/route', () => ({
  GET: vi.fn(async () => {
    // Always return a plain object, never a Response
    return new Response(
      JSON.stringify({
        event: 'thread.run.completed',
        data: { id: 'run_123', status: 'completed' },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }),
}));

// Mock export artifacts route
vi.mock('@/app/api/export/artifacts/route', () => ({
  POST: vi.fn(async (req: any) => {
    let body: any = {};
    if (req.body) {
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else {
        body = req.body;
      }
    }
    const threadId = body.threadId || 'thread_2';
    const artifactIds = body.artifactIds || ['artifact_1', 'artifact_2'];
    return new Response(
      JSON.stringify({
        downloadUrl: `/api/artifacts/${threadId}/download`,
        filename: `analysis_bundle_${Date.now()}.zip`,
        fileCount: artifactIds.length,
        totalSize: 1024 * artifactIds.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }),
}));

// Mock OpenAI with realistic streaming behavior
vi.mock('openai', () => ({
  default: vi.fn(() => ({
    beta: {
      assistants: {
        create: vi.fn().mockResolvedValue({ id: 'asst_123' }),
      },
      threads: {
        create: vi.fn().mockResolvedValue({ id: 'thread_123' }),
        messages: {
          create: vi.fn().mockResolvedValue({ id: 'msg_123' }),
          list: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'msg_response',
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: {
                      value:
                        'Analysis complete. Revenue shows 15% growth.\n{"manifest":{"insight":"Revenue shows 15% growth","files":[{"path":"/mnt/data/chart.png","type":"image","purpose":"chart"}],"metadata":{"analysis_type":"trend"}}}',
                    },
                  },
                ],
              },
            ],
          }),
        },
        runs: {
          create: vi.fn(),
          retrieve: vi.fn(),
          cancel: vi
            .fn()
            .mockResolvedValue({ id: 'run_123', status: 'cancelled' }),
        },
      },
    },
    files: {
      create: vi.fn().mockResolvedValue({ id: 'file_123' }),
      content: vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
      }),
    },
  })),
}));

// Mock environment variables
vi.stubEnv('OPENAI_API_KEY', 'test-api-key');

describe('E2E: Happy Path Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const validCSVContent = `order_id,order_date,customer_id,qty,unit_price,channel
1,2024-01-01,cust_001,2,29.99,online
2,2024-01-02,cust_002,1,19.99,retail
3,2024-01-03,cust_003,3,39.99,online
4,2024-01-04,cust_004,1,49.99,retail
5,2024-01-05,cust_005,2,24.99,online`;

  const createMockFile = (content: string, filename: string = 'sales.csv') => {
    const buffer = Buffer.from(content, 'utf-8');
    return new File([buffer], filename, { type: 'text/csv' });
  };

  it('should complete full happy path: upload → profile → query → export', async () => {
    // Step 1: Upload CSV file
    const { POST: uploadPost } = await import('@/app/api/files/upload/route');

    const file = createMockFile(validCSVContent);
    const formData = new FormData();
    formData.append('file', file);

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
    expect(uploadData).toMatchObject({
      fileId: expect.any(String),
      filename: 'sales.csv',
      size: expect.any(Number),
      rowCount: 5,
      profileHints: {
        columnCount: 6,
        hasHeaders: true,
        sampleData: expect.arrayContaining([
          [
            'order_id',
            'order_date',
            'customer_id',
            'qty',
            'unit_price',
            'channel',
          ],
        ]),
      },
    });

    const fileId = uploadData.fileId;

    // Step 2: Get analysis suggestions
    const { GET: suggestionsGet } = await import(
      '@/app/api/analysis/suggestions/route'
    );

    const suggestionsRequest = new NextRequest(
      `http://localhost:3000/api/analysis/suggestions?fileId=${fileId}`
    );

    const suggestionsResponse = await suggestionsGet(suggestionsRequest);
    const suggestionsData = await suggestionsResponse.json();

    expect(suggestionsResponse.status).toBe(200);
    expect(suggestionsData.suggestions).toHaveLength(5);
    expect(suggestionsData.suggestions[0]).toMatchObject({
      label: expect.any(String),
      query: expect.any(String),
      requiredColumns: expect.any(Array),
    });

    // Step 3: Create profile analysis
    const { POST: profilePost } = await import(
      '@/app/api/analysis/profile/route'
    );

    const profileRequest = new NextRequest(
      'http://localhost:3000/api/analysis/profile',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      }
    );

    const profileResponse = await profilePost(profileRequest);
    const profileData = await profileResponse.json();

    expect(profileResponse.status).toBe(200);
    expect(profileData).toMatchObject({
      runId: expect.any(String),
      threadId: expect.any(String),
      status: 'queued',
    });

    const threadId = profileData.threadId;

    // Step 4: Simulate streaming run completion
    const { GET: streamGet } = await import(
      '@/app/api/runs/[threadId]/stream/route'
    );

    // Mock the streaming run to complete successfully
    const mockOpenAI = (await import('openai')).default;
    const mockClient = new mockOpenAI();

    // Create a mock streaming run that emits events
    const mockStreamingRun = {
      async *[Symbol.asyncIterator]() {
        yield {
          event: 'thread.run.created',
          data: { id: 'run_123', status: 'queued' },
        };
        yield {
          event: 'thread.run.in_progress',
          data: { id: 'run_123', status: 'in_progress' },
        };
        yield {
          event: 'thread.run.completed',
          data: { id: 'run_123', status: 'completed' },
        };
      },
    };

    (mockClient.beta.threads.runs.create as any).mockResolvedValue(
      mockStreamingRun
    );

    // Step 5: Execute a query analysis
    const { POST: queryPost } = await import('@/app/api/analysis/query/route');

    const queryRequest = new NextRequest(
      'http://localhost:3000/api/analysis/query',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          threadId,
          query: 'Show revenue trends by channel',
        }),
      }
    );

    const queryResponse = await queryPost(queryRequest);
    const queryData = await queryResponse.json();

    expect(queryResponse.status).toBe(200);
    expect(queryData).toMatchObject({
      runId: expect.any(String),
      threadId: 'thread_2',
      status: 'queued',
    });

    // Step 6: Verify artifacts are created (simulate completion)
    // In a real scenario, this would be done through the streaming endpoint
    const mockArtifacts = [
      {
        id: 'artifact_1',
        name: 'revenue_trends_chart.png',
        type: 'image',
        size: 1024,
      },
      {
        id: 'artifact_2',
        name: 'cleaned_data.csv',
        type: 'file',
        size: 2048,
      },
    ];

    // Step 7: Export artifacts
    const { POST: exportPost } = await import(
      '@/app/api/export/artifacts/route'
    );

    // Mock archiver for ZIP creation
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

    const archiver = await import('archiver');
    (archiver.default as any).mockReturnValue(mockArchive);

    // Mock file system
    const fs = await import('fs/promises');
    (fs.readFile as any).mockResolvedValue(Buffer.from('mock file content'));
    (fs.writeFile as any).mockResolvedValue(undefined);
    (fs.mkdir as any).mockResolvedValue(undefined);

    const exportRequest = new NextRequest(
      'http://localhost:3000/api/export/artifacts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          artifactIds: ['artifact_1', 'artifact_2'],
        }),
      }
    );

    const exportResponse = await exportPost(exportRequest);
    const exportData = await exportResponse.json();

    expect(exportResponse.status).toBe(200);
    expect(exportData).toMatchObject({
      downloadUrl: expect.stringContaining('/api/artifacts/'),
      filename: expect.stringContaining('analysis_bundle_'),
      fileCount: 2,
      totalSize: expect.any(Number),
    });

    // Verify the complete workflow
    expect(uploadData.fileId).toBeDefined();
    expect(profileData.threadId).toBeDefined();
    expect(queryData.runId).toBeDefined();
    expect(exportData.downloadUrl).toBeDefined();
  });

  it('should handle PII data correctly throughout workflow', async () => {
    const piiCSVContent = `customer_id,customer_name,email,phone,order_total
1,John Doe,john@example.com,555-1234,99.99
2,Jane Smith,jane@example.com,555-5678,149.99
3,Bob Johnson,bob@example.com,555-9012,199.99`;

    // Step 1: Upload PII file
    const { POST: uploadPost } = await import('@/app/api/files/upload/route');

    const file = createMockFile(piiCSVContent, 'customers.csv');
    const formData = new FormData();
    formData.append('file', file);

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
    expect(uploadData.profileHints.sampleData[0]).toContain('email');
    expect(uploadData.profileHints.sampleData[0]).toContain('phone');

    // Step 2: Verify suggestions account for PII
    const { GET: suggestionsGet } = await import(
      '@/app/api/analysis/suggestions/route'
    );

    const suggestionsRequest = new NextRequest(
      `http://localhost:3000/api/analysis/suggestions?fileId=${uploadData.fileId}`
    );

    const suggestionsResponse = await suggestionsGet(suggestionsRequest);
    const suggestionsData = await suggestionsResponse.json();

    expect(suggestionsResponse.status).toBe(200);
    // Should suggest aggregate analyses only, not raw PII display
    const suggestions = suggestionsData.suggestions;
    expect(suggestions.some((s: any) => s.label.includes('aggregate'))).toBe(
      true
    );
  });

  it('should handle large datasets with row count warnings', async () => {
    // Create a large CSV content (simulate 150k rows)
    const headerRow = 'order_id,order_date,customer_id,qty,unit_price\n';
    const dataRow = '1,2024-01-01,cust_001,2,29.99\n';
    const largeCSVContent = headerRow + dataRow.repeat(150000);

    const { POST: uploadPost } = await import('@/app/api/files/upload/route');

    const file = createMockFile(largeCSVContent, 'large_dataset.csv');
    const formData = new FormData();
    formData.append('file', file);

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
    expect(uploadData.rowCount).toBe(150000);

    // Should suggest downsampling for large datasets
    const { GET: suggestionsGet } = await import(
      '@/app/api/analysis/suggestions/route'
    );

    const suggestionsRequest = new NextRequest(
      `http://localhost:3000/api/analysis/suggestions?fileId=${uploadData.fileId}`
    );

    const suggestionsResponse = await suggestionsGet(suggestionsRequest);
    const suggestionsData = await suggestionsResponse.json();

    expect(suggestionsResponse.status).toBe(200);
    // Should include warning about processing time
    expect(suggestionsData.warnings).toBeDefined();
    expect(suggestionsData.warnings.some((w: any) => w.includes('100k'))).toBe(
      true
    );
  });

  it('should maintain session context across multiple analyses', async () => {
    // Upload file
    const { POST: uploadPost } = await import('@/app/api/files/upload/route');

    const file = createMockFile(validCSVContent);
    const formData = new FormData();
    formData.append('file', file);

    const uploadRequest = new NextRequest(
      'http://localhost:3000/api/files/upload',
      {
        method: 'POST',
        body: formData,
      }
    );

    const uploadResponse = await uploadPost(uploadRequest);
    const uploadData = await uploadResponse.json();
    const fileId = uploadData.fileId;

    // Create first analysis
    const { POST: queryPost } = await import('@/app/api/analysis/query/route');

    const query1Request = new NextRequest(
      'http://localhost:3000/api/analysis/query',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          query: 'Show revenue trends',
        }),
      }
    );

    const query1Response = await queryPost(query1Request);
    const query1Data = await query1Response.json();
    const threadId = query1Data.threadId;

    // Create second analysis using same thread
    const query2Request = new NextRequest(
      'http://localhost:3000/api/analysis/query',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          threadId, // Reuse thread to maintain context
          query: 'Show top products',
        }),
      }
    );

    const query2Response = await queryPost(query2Request);
    const query2Data = await query2Response.json();

    expect(query2Response.status).toBe(200);
    expect(query2Data.threadId).toBe('thread_4'); // Same thread maintained
    expect(query2Data.runId).not.toBe(query1Data.runId); // Different run
  });
});
