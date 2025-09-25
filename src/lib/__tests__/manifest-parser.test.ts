import { describe, it, expect, vi } from 'vitest';

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

import { extractManifest } from '../openai';

describe('Manifest Parser', () => {
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

      const result = extractManifest(messages as any);

      expect(result).toEqual({
        insight: 'Revenue trends show growth',
        files: [
          { path: '/mnt/data/plot.png', type: 'image', purpose: 'chart' },
        ],
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

      const result = extractManifest(messages as any);

      expect(result).toEqual({
        insight: 'Revenue trends show growth',
        files: [
          { path: '/mnt/data/plot.png', type: 'image', purpose: 'chart' },
        ],
        metadata: { analysis_type: 'trend' },
      });
    });

    it('should handle multiple files in manifest', () => {
      const messages = [
        {
          id: 'msg_1',
          role: 'assistant' as const,
          content: [
            {
              type: 'text' as const,
              text: {
                value:
                  'Analysis complete.\n{"manifest":{"insight":"Complete analysis with chart and data","files":[{"path":"/mnt/data/chart.png","type":"image","purpose":"chart"},{"path":"/mnt/data/cleaned.csv","type":"file","purpose":"data"}],"metadata":{"analysis_type":"profile","columns_used":["revenue","date"]}}}',
              },
            },
          ],
        },
      ];

      const result = extractManifest(messages as any);

      expect(result).toEqual({
        insight: 'Complete analysis with chart and data',
        files: [
          { path: '/mnt/data/chart.png', type: 'image', purpose: 'chart' },
          { path: '/mnt/data/cleaned.csv', type: 'file', purpose: 'data' },
        ],
        metadata: {
          analysis_type: 'profile',
          columns_used: ['revenue', 'date'],
        },
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

      const result = extractManifest(messages as any);

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

    it('should handle malformed JSON gracefully', () => {
      const messages = [
        {
          id: 'msg_1',
          role: 'assistant' as const,
          content: [
            {
              type: 'text' as const,
              text: {
                value:
                  'Analysis complete.\n{"manifest":{"insight":"Test","files":[{"path":"/mnt/data/test.png","type":"image"}]}} // malformed',
              },
            },
          ],
        },
      ];

      const result = extractManifest(messages as any);

      expect(result).toEqual({
        insight: 'Analysis complete.',
        files: [],
        metadata: {
          analysis_type: 'unknown',
          fallback: true,
          parse_error: expect.stringContaining('JSON'),
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

      const result = extractManifest(messages as any);

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

      const result = extractManifest(messages as any);

      expect(result).toBeNull();
    });

    it('should handle nested JSON in text content', () => {
      const messages = [
        {
          id: 'msg_1',
          role: 'assistant' as const,
          content: [
            {
              type: 'text' as const,
              text: {
                value:
                  'Here is the analysis:\n\n```python\nprint("Analysis complete")\n```\n\n{"manifest":{"insight":"Nested JSON test","files":[],"metadata":{"analysis_type":"test"}}}',
              },
            },
          ],
        },
      ];

      const result = extractManifest(messages as any);

      expect(result).toEqual({
        insight: 'Nested JSON test',
        files: [],
        metadata: { analysis_type: 'test' },
      });
    });

    it('should extract insight from first line when no manifest', () => {
      const messages = [
        {
          id: 'msg_1',
          role: 'assistant' as const,
          content: [
            {
              type: 'text' as const,
              text: {
                value:
                  'Revenue analysis shows strong growth.\nDetailed breakdown follows.\nNo manifest here.',
              },
            },
          ],
        },
      ];

      const result = extractManifest(messages as any);

      expect(result).toEqual({
        insight: 'Revenue analysis shows strong growth.',
        files: [],
        metadata: {
          analysis_type: 'unknown',
          fallback: true,
          parse_error: expect.any(String),
        },
      });
    });

    it('should handle empty manifest object', () => {
      const messages = [
        {
          id: 'msg_1',
          role: 'assistant' as const,
          content: [
            {
              type: 'text' as const,
              text: {
                value: 'Analysis complete.\n{"manifest":{}}',
              },
            },
          ],
        },
      ];

      const result = extractManifest(messages as any);

      expect(result).toEqual({
        insight: '',
        files: [],
        metadata: {},
      });
    });
  });
});
