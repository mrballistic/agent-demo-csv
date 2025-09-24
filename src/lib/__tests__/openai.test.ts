import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { AssistantManager, extractManifest, ASSISTANT_CONFIG } from '../openai';

// Mock OpenAI client
const mockOpenAI = {
  beta: {
    assistants: {
      create: vi.fn(),
    },
    threads: {
      create: vi.fn(),
      messages: {
        create: vi.fn(),
        list: vi.fn(),
      },
      runs: {
        create: vi.fn(),
        cancel: vi.fn(),
        retrieve: vi.fn(),
      },
    },
  },
  files: {
    content: vi.fn(),
  },
} as unknown as OpenAI;

describe('AssistantManager', () => {
  let assistantManager: AssistantManager;

  beforeEach(() => {
    vi.clearAllMocks();
    assistantManager = new AssistantManager(mockOpenAI);
  });

  describe('createAssistant', () => {
    it('should create a new assistant with correct configuration', async () => {
      const mockAssistant = { id: 'asst_123' };
      (mockOpenAI.beta.assistants.create as any).mockResolvedValue(
        mockAssistant
      );

      const result = await assistantManager.createAssistant();

      expect(result).toEqual({ id: 'asst_123' });
      expect(mockOpenAI.beta.assistants.create).toHaveBeenCalledWith(
        ASSISTANT_CONFIG
      );
    });

    it('should return existing assistant ID if already created', async () => {
      const mockAssistant = { id: 'asst_123' };
      (mockOpenAI.beta.assistants.create as any).mockResolvedValue(
        mockAssistant
      );

      // First call
      await assistantManager.createAssistant();

      // Second call should not create new assistant
      const result = await assistantManager.createAssistant();

      expect(result).toEqual({ id: 'asst_123' });
      expect(mockOpenAI.beta.assistants.create).toHaveBeenCalledTimes(1);
    });

    it('should handle creation errors', async () => {
      (mockOpenAI.beta.assistants.create as any).mockRejectedValue(
        new Error('API Error')
      );

      await expect(assistantManager.createAssistant()).rejects.toThrow(
        'Failed to create assistant: API Error'
      );
    });
  });

  describe('createThread', () => {
    it('should create a new thread', async () => {
      const mockThread = { id: 'thread_123' };
      (mockOpenAI.beta.threads.create as any).mockResolvedValue(mockThread);

      const result = await assistantManager.createThread();

      expect(result).toEqual({ id: 'thread_123' });
      expect(mockOpenAI.beta.threads.create).toHaveBeenCalled();
    });

    it('should handle thread creation errors', async () => {
      (mockOpenAI.beta.threads.create as any).mockRejectedValue(
        new Error('Thread Error')
      );

      await expect(assistantManager.createThread()).rejects.toThrow(
        'Failed to create thread: Thread Error'
      );
    });
  });

  describe('createMessage', () => {
    it('should create a message without file attachment', async () => {
      const mockMessage = {
        id: 'msg_123',
        role: 'user',
        content: 'Test message',
      };
      (mockOpenAI.beta.threads.messages.create as any).mockResolvedValue(
        mockMessage
      );

      const result = await assistantManager.createMessage(
        'thread_123',
        'Test message'
      );

      expect(result).toEqual(mockMessage);
      expect(mockOpenAI.beta.threads.messages.create).toHaveBeenCalledWith(
        'thread_123',
        {
          role: 'user',
          content: 'Test message',
        }
      );
    });

    it('should create a message with file attachment', async () => {
      const mockMessage = {
        id: 'msg_123',
        role: 'user',
        content: 'Test message',
      };
      (mockOpenAI.beta.threads.messages.create as any).mockResolvedValue(
        mockMessage
      );

      const result = await assistantManager.createMessage(
        'thread_123',
        'Test message',
        'file_123'
      );

      expect(result).toEqual(mockMessage);
      expect(mockOpenAI.beta.threads.messages.create).toHaveBeenCalledWith(
        'thread_123',
        {
          role: 'user',
          content: 'Test message',
          attachments: [
            {
              file_id: 'file_123',
              tools: [{ type: 'code_interpreter' }],
            },
          ],
        }
      );
    });

    it('should handle message creation errors', async () => {
      (mockOpenAI.beta.threads.messages.create as any).mockRejectedValue(
        new Error('Message Error')
      );

      await expect(
        assistantManager.createMessage('thread_123', 'Test')
      ).rejects.toThrow('Failed to create message: Message Error');
    });
  });

  describe('createRun', () => {
    it('should create a run with assistant ID', async () => {
      const mockRun = { id: 'run_123', status: 'queued' };
      (mockOpenAI.beta.threads.runs.create as any).mockResolvedValue(mockRun);

      // First create assistant to set ID
      const mockAssistant = { id: 'asst_123' };
      (mockOpenAI.beta.assistants.create as any).mockResolvedValue(
        mockAssistant
      );
      await assistantManager.createAssistant();

      const result = await assistantManager.createRun('thread_123');

      expect(result).toEqual(mockRun);
      expect(mockOpenAI.beta.threads.runs.create).toHaveBeenCalledWith(
        'thread_123',
        {
          assistant_id: 'asst_123',
          max_prompt_tokens: 1000,
          max_completion_tokens: 1000,
          temperature: 0.2,
        }
      );
    });

    it('should create a streaming run', async () => {
      const mockRun = { id: 'run_123', status: 'queued' };
      (mockOpenAI.beta.threads.runs.create as any).mockResolvedValue(mockRun);

      // First create assistant to set ID
      const mockAssistant = { id: 'asst_123' };
      (mockOpenAI.beta.assistants.create as any).mockResolvedValue(
        mockAssistant
      );
      await assistantManager.createAssistant();

      const result = await assistantManager.createRun(
        'thread_123',
        undefined,
        true
      );

      expect(result).toEqual(mockRun);
      expect(mockOpenAI.beta.threads.runs.create).toHaveBeenCalledWith(
        'thread_123',
        {
          assistant_id: 'asst_123',
          max_prompt_tokens: 1000,
          max_completion_tokens: 1000,
          temperature: 0.2,
          stream: true,
        }
      );
    });

    it('should throw error if no assistant ID available', async () => {
      await expect(assistantManager.createRun('thread_123')).rejects.toThrow(
        'No assistant ID available. Call createAssistant() first.'
      );
    });
  });

  describe('cancelRun', () => {
    it('should cancel a run', async () => {
      const mockCancelledRun = { id: 'run_123', status: 'cancelled' };
      (mockOpenAI.beta.threads.runs.cancel as any).mockResolvedValue(
        mockCancelledRun
      );

      const result = await assistantManager.cancelRun('thread_123', 'run_123');

      expect(result).toEqual(mockCancelledRun);
      expect(mockOpenAI.beta.threads.runs.cancel).toHaveBeenCalledWith(
        'thread_123',
        'run_123'
      );
    });

    it('should handle cancellation errors', async () => {
      (mockOpenAI.beta.threads.runs.cancel as any).mockRejectedValue(
        new Error('Cancel Error')
      );

      await expect(
        assistantManager.cancelRun('thread_123', 'run_123')
      ).rejects.toThrow('Failed to cancel run: Cancel Error');
    });
  });

  describe('getMessages', () => {
    it('should retrieve messages from thread', async () => {
      const mockMessages = {
        data: [
          { id: 'msg_1', role: 'user', content: 'Hello' },
          { id: 'msg_2', role: 'assistant', content: 'Hi there' },
        ],
      };
      (mockOpenAI.beta.threads.messages.list as any).mockResolvedValue(
        mockMessages
      );

      const result = await assistantManager.getMessages('thread_123');

      expect(result).toEqual(mockMessages.data);
      expect(mockOpenAI.beta.threads.messages.list).toHaveBeenCalledWith(
        'thread_123',
        {
          order: 'desc',
          limit: 10,
        }
      );
    });

    it('should handle custom limit', async () => {
      const mockMessages = { data: [] };
      (mockOpenAI.beta.threads.messages.list as any).mockResolvedValue(
        mockMessages
      );

      await assistantManager.getMessages('thread_123', 5);

      expect(mockOpenAI.beta.threads.messages.list).toHaveBeenCalledWith(
        'thread_123',
        {
          order: 'desc',
          limit: 5,
        }
      );
    });
  });

  describe('downloadFile', () => {
    it('should download file content', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      const mockResponse = {
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      };
      (mockOpenAI.files.content as any).mockResolvedValue(mockResponse);

      const result = await assistantManager.downloadFile('file_123');

      expect(result).toBeInstanceOf(Buffer);
      expect(mockOpenAI.files.content).toHaveBeenCalledWith('file_123');
    });

    it('should handle download errors', async () => {
      (mockOpenAI.files.content as any).mockRejectedValue(
        new Error('Download Error')
      );

      await expect(assistantManager.downloadFile('file_123')).rejects.toThrow(
        'Failed to download file: Download Error'
      );
    });
  });
});

describe('extractManifest', () => {
  it('should extract manifest from valid JSON in last line', () => {
    const messages = [
      {
        id: 'msg_1',
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: {
              value:
                'Analysis complete.\n{"manifest":{"insight":"Revenue trends show growth","files":[{"path":"/mnt/data/plot.png","type":"image","purpose":"chart"}],"metadata":{"analysis_type":"trend"}}}',
            },
          },
        ],
      },
    ];

    const result = extractManifest(messages);

    expect(result).toEqual({
      insight: 'Revenue trends show growth',
      files: [{ path: '/mnt/data/plot.png', type: 'image', purpose: 'chart' }],
      metadata: { analysis_type: 'trend' },
    });
  });

  it('should extract manifest from direct JSON format', () => {
    const messages = [
      {
        id: 'msg_1',
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: {
              value:
                'Analysis complete.\n{"insight":"Revenue trends show growth","files":[{"path":"/mnt/data/plot.png","type":"image","purpose":"chart"}],"metadata":{"analysis_type":"trend"}}',
            },
          },
        ],
      },
    ];

    const result = extractManifest(messages);

    expect(result).toEqual({
      insight: 'Revenue trends show growth',
      files: [{ path: '/mnt/data/plot.png', type: 'image', purpose: 'chart' }],
      metadata: { analysis_type: 'trend' },
    });
  });

  it('should create fallback manifest for invalid JSON', () => {
    const messages = [
      {
        id: 'msg_1',
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: {
              value:
                'Analysis complete.\nRevenue trends show 15% growth over the quarter.\nThis is not valid JSON.',
            },
          },
        ],
      },
    ];

    const result = extractManifest(messages);

    expect(result).toEqual({
      insight: 'Analysis complete.',
      files: [],
      metadata: {
        analysis_type: 'unknown',
        fallback: true,
        parse_error: expect.any(String),
      },
    });
  });

  it('should return null for no assistant messages', () => {
    const messages = [
      {
        id: 'msg_1',
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: { value: 'Hello' },
          },
        ],
      },
    ];

    const result = extractManifest(messages);

    expect(result).toBeNull();
  });

  it('should return null for empty content', () => {
    const messages = [
      {
        id: 'msg_1',
        role: 'assistant' as const,
        content: [],
      },
    ];

    const result = extractManifest(messages);

    expect(result).toBeNull();
  });
});
