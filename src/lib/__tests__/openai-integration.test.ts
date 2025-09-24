import { describe, it, expect, vi } from 'vitest';
import type { OpenAI } from 'openai';

// Mock the OpenAI module before importing our code
vi.mock('openai', () => ({
  default: vi.fn(() => ({
    beta: {
      assistants: { create: vi.fn() },
      threads: {
        create: vi.fn(),
        messages: { create: vi.fn(), list: vi.fn() },
        runs: { create: vi.fn(), cancel: vi.fn(), retrieve: vi.fn() },
      },
    },
    files: { content: vi.fn() },
  })),
}));

// Mock environment variable
vi.stubEnv('OPENAI_API_KEY', 'test-api-key');

import { AssistantManager, extractManifest } from '../openai';

// Mock OpenAI for integration test
const createMockOpenAI = () =>
  ({
    beta: {
      assistants: {
        create: vi.fn().mockResolvedValue({ id: 'asst_test123' }),
      },
      threads: {
        create: vi.fn().mockResolvedValue({ id: 'thread_test123' }),
        messages: {
          create: vi.fn().mockResolvedValue({
            id: 'msg_test123',
            role: 'user',
            content: 'Profile the file',
          }),
          list: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'msg_assistant123',
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: {
                      value:
                        'Data profiling complete. Found 1000 rows with 5 columns.\n{"manifest":{"insight":"Dataset contains sales data with 1000 rows","files":[{"path":"/mnt/data/profile.png","type":"image","purpose":"chart"}],"metadata":{"analysis_type":"profile","columns_used":["order_date","revenue"]}}}',
                    },
                  },
                ],
              },
            ],
          }),
        },
        runs: {
          create: vi.fn().mockResolvedValue({
            id: 'run_test123',
            status: 'queued',
          }),
          cancel: vi.fn().mockResolvedValue({
            id: 'run_test123',
            status: 'cancelled',
          }),
          retrieve: vi.fn().mockResolvedValue({
            id: 'run_test123',
            status: 'completed',
          }),
        },
      },
    },
    files: {
      content: vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
      }),
    },
  }) as unknown as OpenAI;

describe('OpenAI Integration Workflow', () => {
  it('should complete full analysis workflow', async () => {
    const mockClient = createMockOpenAI();
    const manager = new AssistantManager(mockClient);

    // Step 1: Create assistant
    const assistant = await manager.createAssistant();
    expect(assistant.id).toBe('asst_test123');

    // Step 2: Create thread
    const thread = await manager.createThread();
    expect(thread.id).toBe('thread_test123');

    // Step 3: Create message with file attachment
    const message = await manager.createMessage(
      thread.id,
      'Profile the file and suggest questions.',
      'file_test123'
    );
    expect(message.id).toBe('msg_test123');

    // Step 4: Create and run analysis
    const run = await manager.createRun(thread.id);
    expect(run.id).toBe('run_test123');
    expect(run.status).toBe('queued');

    // Step 5: Get messages and extract manifest
    const messages = await manager.getMessages(thread.id);
    expect(messages).toHaveLength(1);

    const manifest = extractManifest(messages);
    expect(manifest).toEqual({
      insight: 'Dataset contains sales data with 1000 rows',
      files: [
        {
          path: '/mnt/data/profile.png',
          type: 'image',
          purpose: 'chart',
        },
      ],
      metadata: {
        analysis_type: 'profile',
        columns_used: ['order_date', 'revenue'],
      },
    });

    // Step 6: Download file
    const fileBuffer = await manager.downloadFile('file_test123');
    expect(fileBuffer).toBeInstanceOf(Buffer);
    expect(fileBuffer.length).toBe(1024);

    // Verify all API calls were made correctly
    expect(mockClient.beta.assistants.create).toHaveBeenCalledTimes(1);
    expect(mockClient.beta.threads.create).toHaveBeenCalledTimes(1);
    expect(mockClient.beta.threads.messages.create).toHaveBeenCalledWith(
      'thread_test123',
      {
        role: 'user',
        content: 'Profile the file and suggest questions.',
        attachments: [
          {
            file_id: 'file_test123',
            tools: [{ type: 'code_interpreter' }],
          },
        ],
      }
    );
    expect(mockClient.beta.threads.runs.create).toHaveBeenCalledWith(
      'thread_test123',
      {
        assistant_id: 'asst_test123',
        max_prompt_tokens: 1000,
        max_completion_tokens: 1000,
        temperature: 0.2,
      }
    );
  });

  it('should handle run cancellation', async () => {
    const mockClient = createMockOpenAI();
    const manager = new AssistantManager(mockClient);

    // Create assistant first
    await manager.createAssistant();

    // Cancel a run
    const cancelledRun = await manager.cancelRun(
      'thread_test123',
      'run_test123'
    );
    expect(cancelledRun.status).toBe('cancelled');
    expect(mockClient.beta.threads.runs.cancel).toHaveBeenCalledWith(
      'thread_test123',
      'run_test123'
    );
  });

  it('should handle streaming run creation', async () => {
    const mockClient = createMockOpenAI();
    const manager = new AssistantManager(mockClient);

    // Create assistant first
    await manager.createAssistant();

    // Create streaming run
    const run = await manager.createRun('thread_test123', undefined, true);
    expect(run.id).toBe('run_test123');
    expect(mockClient.beta.threads.runs.create).toHaveBeenCalledWith(
      'thread_test123',
      {
        assistant_id: 'asst_test123',
        max_prompt_tokens: 1000,
        max_completion_tokens: 1000,
        temperature: 0.2,
        stream: true,
      }
    );
  });
});
