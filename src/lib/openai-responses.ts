import OpenAI from 'openai';
import { fileStore } from './file-store';

// Initialize OpenAI client
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'demo-key-placeholder',
});

// JSON Schema for structured analysis output
const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    insight: {
      type: 'string',
      description: 'A 2-3 line plain-English insight from the analysis',
    },
    files: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string' },
          type: { type: 'string', enum: ['image', 'file'] },
          purpose: { type: 'string', enum: ['chart', 'data', 'visualization'] },
        },
        required: ['path', 'type', 'purpose'],
      },
    },
    metadata: {
      type: 'object',
      additionalProperties: false,
      properties: {
        analysis_type: {
          type: 'string',
          enum: ['trend', 'top-sku', 'profile', 'channel-mix', 'custom'],
        },
        columns_used: {
          type: 'array',
          items: { type: 'string' },
        },
        pii_columns: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['analysis_type', 'columns_used', 'pii_columns'],
    },
  },
  required: ['insight', 'files', 'metadata'],
} as const;

// Types for our structured output
export interface AnalysisResponse {
  insight: string;
  files: Array<{
    path: string;
    type: 'image' | 'file';
    purpose: 'chart' | 'data' | 'visualization';
  }>;
  metadata: {
    analysis_type: 'trend' | 'top-sku' | 'profile' | 'channel-mix' | 'custom';
    columns_used: string[];
    pii_columns: string[];
  };
}

// System prompt for the analyst
const SYSTEM_PROMPT = `You are "Analyst-in-a-Box", a careful data analyst.

Contract:
1) When a CSV is provided with a SPECIFIC analysis request:
   - Perform the requested analysis immediately
   - Provide a 2-3 line plain-English INSIGHT
   - Create a matplotlib PNG chart saved as /tmp/plot.png (readable axes, title, units)
   - If you transform data, save /tmp/cleaned.csv
   - Return structured output with insight, files, and metadata

2) When a CSV is provided with a GENERAL request (like "profile" or "analyze"):
   - First PROFILE the dataset: rows, columns, dtypes, missing %, 5 sample rows (markdown table)
   - Detect likely PII columns (email/phone) and set pii=true/false per column
   - Then PROPOSE 3–5 concrete analyses tailored to available columns
   - Mark each suggestion with required columns

3) Analysis types and their triggers:
   - "customer behavior", "customer value", "customer segmentation" → Customer Value Segmentation
   - "trends", "time", "temporal", "over time" → Trend Analysis  
   - "top products", "best selling", "top performers" → Top Product Analysis
   - "channel", "sales channel", "channel performance" → Channel Analysis
   - "profile", "overview", "summary" → Data Profiling only

4) Always provide structured output with your analysis results.

PII PROTECTION RULES (CRITICAL):
- NEVER display raw PII values (names, emails, phone numbers, addresses, SSNs, etc.)
- In sample data tables: Replace PII with placeholders like "[EMAIL]", "[PHONE]", "[NAME]", "[ADDRESS]"
- In charts/visualizations: Use aggregated data only (counts, percentages, segments)
- In analysis: Reference customers by ID or segment, never by name or contact info
- Examples of safe vs unsafe outputs:
  ✅ SAFE: "Customer CUST-012345", "john****@example.com", "555-***-1234", "[REDACTED NAME]"
  ❌ UNSAFE: "John Smith", "john.smith@gmail.com", "555-123-4567", "123 Main St"

Rules:
- If the request exceeds MVP scope (multi-segmentation), pick the first segment and state the limitation.
- If required columns are missing, STOP and ask for column mapping.
- Use safe defaults: ISO date parsing, currency formatting, thousands separators.
- Never display raw PII values; aggregate or redact.
- For customer analysis, calculate metrics like: total spend, frequency, recency, value segments.

Important: You must provide a structured response with insight, files, and metadata.`;

// Conversation message type
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

// Token estimation utility
function estimateTokens(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters for English text
  // For CSV data, this is conservative but safe
  return Math.ceil(text.length / 4);
}

// Session-based conversation manager
export class ConversationManager {
  private conversations = new Map<string, ChatMessage[]>();
  private readonly MAX_CONTEXT_TOKENS = 100000; // Leave buffer below 128K limit
  private readonly MAX_MESSAGE_TOKENS = 50000; // Max tokens per message

  constructor(private client: OpenAI = openai) {}

  /**
   * Initialize a conversation with system prompt
   */
  initializeConversation(sessionId: string): void {
    this.conversations.set(sessionId, [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
        timestamp: Date.now(),
      },
    ]);
  }

  /**
   * Add a user message to conversation with token management
   */
  addUserMessage(
    sessionId: string,
    content: string,
    csvContent?: string
  ): void {
    const conversation = this.conversations.get(sessionId) || [];

    let messageContent = content;

    // Handle CSV content separately to avoid token overflow
    if (csvContent) {
      const csvTokens = estimateTokens(csvContent);

      if (csvTokens > this.MAX_MESSAGE_TOKENS) {
        // Sample the CSV if it's too large
        const sampledCsv = this.sampleCSVForTokens(
          csvContent,
          this.MAX_MESSAGE_TOKENS
        );
        messageContent += `\n\nHere's a representative sample of the CSV data (original was ${csvTokens.toLocaleString()} tokens, sampled to fit context):\n\`\`\`csv\n${sampledCsv}\n\`\`\``;
      } else {
        messageContent += `\n\nHere's the CSV data:\n\`\`\`csv\n${csvContent}\n\`\`\``;
      }
    }

    const newMessage: ChatMessage = {
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
    };

    conversation.push(newMessage);

    // Trim conversation if it's getting too large
    const trimmedConversation = this.trimConversationForTokens(conversation);
    this.conversations.set(sessionId, trimmedConversation);
  }

  /**
   * Sample CSV content to fit within token limits
   */
  private sampleCSVForTokens(csvContent: string, maxTokens: number): string {
    const lines = csvContent.split('\n');

    if (lines.length <= 1) {
      return csvContent;
    }

    // Always include header
    const header = lines[0] || '';
    const dataLines = lines.slice(1).filter(line => line.trim());

    if (dataLines.length === 0) {
      return header;
    }

    // Estimate how many lines we can include
    const avgLineTokens = estimateTokens(csvContent) / lines.length;
    const headerTokens = estimateTokens(header);
    const maxDataTokens = maxTokens - headerTokens - 100; // Buffer for formatting
    const maxDataLines = Math.floor(maxDataTokens / avgLineTokens);

    if (dataLines.length <= maxDataLines) {
      return csvContent;
    }

    // Sample evenly distributed rows
    const sampleStep = Math.floor(dataLines.length / maxDataLines);
    const sampledLines = [];

    for (let i = 0; i < dataLines.length; i += sampleStep) {
      sampledLines.push(dataLines[i]);
      if (sampledLines.length >= maxDataLines) break;
    }

    return [header, ...sampledLines].join('\n');
  }

  /**
   * Trim conversation to fit within token limits
   */
  private trimConversationForTokens(
    conversation: ChatMessage[]
  ): ChatMessage[] {
    if (conversation.length === 0) {
      return conversation;
    }

    // Always keep system message
    const systemMessage = conversation.find(msg => msg.role === 'system');
    const messages = conversation.filter(msg => msg.role !== 'system');

    // Calculate total tokens
    let totalTokens = systemMessage ? estimateTokens(systemMessage.content) : 0;

    // Add messages from most recent, keeping track of tokens
    const keptMessages: ChatMessage[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message) continue;

      const messageTokens = estimateTokens(message.content);

      if (totalTokens + messageTokens > this.MAX_CONTEXT_TOKENS) {
        // If this is a user message with CSV data, try to create a summary instead
        if (message.role === 'user' && message.content.includes('```csv')) {
          const summaryMessage: ChatMessage = {
            role: 'user',
            content: 'Previous analysis was performed on uploaded CSV data.',
            timestamp: message.timestamp || Date.now(),
          };
          const summaryTokens = estimateTokens(summaryMessage.content);

          if (totalTokens + summaryTokens <= this.MAX_CONTEXT_TOKENS) {
            keptMessages.unshift(summaryMessage);
            totalTokens += summaryTokens;
          }
        }
        break;
      }

      keptMessages.unshift(message);
      totalTokens += messageTokens;
    }

    // Reconstruct conversation with system message first
    const result = systemMessage
      ? [systemMessage, ...keptMessages]
      : keptMessages;

    console.log(
      `Trimmed conversation: ${conversation.length} → ${result.length} messages, ~${totalTokens.toLocaleString()} tokens`
    );

    return result;
  }

  /**
   * Add an assistant response to conversation
   */
  addAssistantMessage(sessionId: string, content: string): void {
    const conversation = this.conversations.get(sessionId) || [];
    conversation.push({
      role: 'assistant',
      content,
      timestamp: Date.now(),
    });
    this.conversations.set(sessionId, conversation);
  }

  /**
   * Get conversation history
   */
  getConversation(sessionId: string): ChatMessage[] {
    return this.conversations.get(sessionId) || [];
  }

  /**
   * Clear conversation history
   */
  clearConversation(sessionId: string): void {
    this.conversations.delete(sessionId);
  }

  /**
   * Stream analysis using new Chat Completions API with structured output
   * This method handles CSV analysis separately from conversation history
   */
  async *streamAnalysis(
    sessionId: string,
    userMessage: string,
    csvContent?: string
  ): AsyncGenerator<{
    type: 'content' | 'structured_output' | 'error' | 'done';
    data: any;
  }> {
    try {
      console.log('ConversationManager.streamAnalysis called:', {
        sessionId,
        userMessage: userMessage.substring(0, 100) + '...',
        csvContentLength: csvContent?.length || 0,
      });

      // Initialize conversation if it doesn't exist
      if (!this.conversations.has(sessionId)) {
        this.initializeConversation(sessionId);
      }

      // For CSV analysis, create a temporary message without storing the CSV in conversation
      let analysisMessages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
      }>;

      if (csvContent) {
        // Estimate CSV size and sample if needed
        const csvTokens = estimateTokens(csvContent);
        let finalCsvContent = csvContent;

        if (csvTokens > this.MAX_MESSAGE_TOKENS) {
          finalCsvContent = this.sampleCSVForTokens(
            csvContent,
            this.MAX_MESSAGE_TOKENS
          );
          console.log(
            `CSV sampled for analysis: ${csvTokens.toLocaleString()} → ${estimateTokens(finalCsvContent).toLocaleString()} tokens`
          );
        }

        // Create temporary messages for analysis without storing in conversation
        analysisMessages = [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: `${userMessage}\n\nHere's the CSV data:\n\`\`\`csv\n${finalCsvContent}\n\`\`\``,
          },
        ];

        // Only add a summary to the conversation history (no CSV content)
        this.addUserMessage(
          sessionId,
          `${userMessage} (CSV analysis completed)`
        );
      } else {
        // Regular conversation - get history and add message
        this.addUserMessage(sessionId, userMessage);
        const conversation = this.getConversation(sessionId);
        analysisMessages = conversation.map(msg => ({
          role: msg.role,
          content: msg.content,
        }));
      }

      // Create streaming chat completion with structured output
      console.log('Creating OpenAI chat completion with messages:', {
        messageCount: analysisMessages.length,
        totalTokensEstimate: analysisMessages.reduce(
          (sum, msg) => sum + estimateTokens(msg.content),
          0
        ),
      });

      const stream = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: analysisMessages,
        temperature: 0.2,
        max_tokens: 2000,
        stream: true,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'analysis_response',
            strict: true,
            schema: ANALYSIS_RESPONSE_SCHEMA,
          },
        },
      });

      console.log('OpenAI stream created successfully');
      let accumulatedContent = '';
      let chunkCount = 0;

      // Process streaming chunks
      for await (const chunk of stream) {
        chunkCount++;
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          accumulatedContent += delta.content;
          console.log(
            `Chunk ${chunkCount}: received ${delta.content.length} chars`
          );
          yield {
            type: 'content',
            data: {
              delta: delta.content,
              content: accumulatedContent,
            },
          };
        }
      }

      console.log(
        `OpenAI stream completed. Total chunks: ${chunkCount}, content length: ${accumulatedContent.length}`
      );

      // Parse the final structured response
      try {
        const structuredResponse: AnalysisResponse =
          JSON.parse(accumulatedContent);

        // Add just the insight to conversation history (not the full JSON)
        this.addAssistantMessage(sessionId, structuredResponse.insight);

        yield {
          type: 'structured_output',
          data: structuredResponse,
        };
      } catch (parseError) {
        console.error('Failed to parse structured output:', parseError);
        yield {
          type: 'error',
          data: {
            error: 'Failed to parse structured response',
            content: accumulatedContent,
          },
        };
      }

      yield {
        type: 'done',
        data: { success: true },
      };
    } catch (error) {
      console.error('Analysis streaming failed:', error);
      yield {
        type: 'error',
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
          details: error,
        },
      };
    }
  }

  /**
   * Stream regular conversation (for follow-up questions)
   */
  async *streamConversation(
    sessionId: string,
    userMessage: string,
    fileId?: string
  ): AsyncGenerator<{
    type: 'content' | 'error' | 'done';
    data: any;
  }> {
    try {
      // Initialize conversation if it doesn't exist
      if (!this.conversations.has(sessionId)) {
        this.initializeConversation(sessionId);
      }

      // Get CSV content if fileId is provided
      let csvContent: string | undefined;
      if (fileId) {
        try {
          const fileBuffer = await fileStore.getFile(fileId);
          if (fileBuffer) {
            csvContent = fileBuffer.toString('utf-8');
          }
        } catch (error) {
          console.warn(
            `Could not load CSV content for fileId ${fileId}:`,
            error
          );
        }
      }

      // Add user message to conversation with CSV content
      this.addUserMessage(sessionId, userMessage, csvContent);

      // Get conversation history
      const messages = this.getConversation(sessionId);

      // Create streaming chat completion without structured output
      const stream = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: 0.2,
        max_tokens: 2000,
        stream: true,
      });

      let accumulatedContent = '';

      // Process streaming chunks
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          accumulatedContent += delta.content;
          yield {
            type: 'content',
            data: {
              delta: delta.content,
              content: accumulatedContent,
            },
          };
        }
      }

      // Add assistant response to conversation history
      this.addAssistantMessage(sessionId, accumulatedContent);

      yield {
        type: 'done',
        data: { success: true },
      };
    } catch (error) {
      console.error('Conversation streaming failed:', error);
      yield {
        type: 'error',
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
          details: error,
        },
      };
    }
  }

  /**
   * Non-streaming analysis for testing
   */
  async analyzeData(
    sessionId: string,
    userMessage: string,
    csvContent?: string
  ): Promise<AnalysisResponse> {
    // Add user message to conversation
    this.addUserMessage(sessionId, userMessage, csvContent);

    // Get conversation history
    const messages = this.getConversation(sessionId);

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: 0.2,
        max_tokens: 2000,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'analysis_response',
            strict: true,
            schema: ANALYSIS_RESPONSE_SCHEMA,
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content received');
      }

      // Add assistant response to conversation history
      this.addAssistantMessage(sessionId, content);

      // Parse and return structured response
      return JSON.parse(content) as AnalysisResponse;
    } catch (error) {
      console.error('Analysis failed:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const conversationManager = new ConversationManager();
