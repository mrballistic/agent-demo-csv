import OpenAI from 'openai';

// Initialize OpenAI client
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Assistant configuration with system prompt
export const ASSISTANT_CONFIG = {
  name: 'Analyst-in-a-Box',
  model: 'gpt-4o',
  tools: [{ type: 'code_interpreter' as const }],
  temperature: 0.2,
  instructions: `You are "Analyst-in-a-Box", a careful data analyst.

Contract:
1) When a CSV is provided, first PROFILE the dataset:
   - rows, columns, dtypes, missing %, 5 sample rows (as a markdown table).
   - Detect likely PII columns (email/phone) and set pii=true/false per column.

2) Then PROPOSE 3–5 concrete analyses tailored to available columns.
   - Mark each suggestion with required columns.

3) When the user picks one, RUN exactly one analysis and produce:
   - A 2–3 line plain-English INSIGHT.
   - A single matplotlib PNG chart saved as /mnt/data/plot.png (readable axes, title, units).
   - If you transform data, save /mnt/data/cleaned.csv.

4) Always print a SINGLE LINE of JSON to stdout as the last line:
   {"manifest":{
      "insight":"...",
      "files":[
        {"path":"/mnt/data/plot.png","type":"image","purpose":"chart"},
        {"path":"/mnt/data/cleaned.csv","type":"file","purpose":"data"}
      ],
      "metadata":{"analysis_type":"trend|top-sku|profile|channel-mix","columns_used":["..."]}
   }}

Rules:
- If the request exceeds MVP scope (multi-segmentation), pick the first segment and state the limitation.
- If required columns are missing, STOP and ask for column mapping.
- Use safe defaults: ISO date parsing, currency formatting, thousands separators.
- Never display raw PII values; aggregate or redact.`,
} as const;

// Types for manifest parsing
export interface ManifestFile {
  path: string;
  type: 'image' | 'file';
  purpose: string;
}

export interface AnalysisManifest {
  insight: string;
  files: ManifestFile[];
  metadata?: {
    analysis_type?: string;
    columns_used?: string[];
    pii_columns?: string[];
    [key: string]: any;
  };
}

export interface RunResult {
  runId: string;
  threadId: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  manifest?: AnalysisManifest;
  messages?: OpenAI.Beta.Threads.Messages.Message[];
  error?: string;
}

// Assistant Manager class
export class AssistantManager {
  private assistantId: string | null = null;

  constructor(private client: OpenAI = openai) {}

  /**
   * Create or retrieve the assistant
   */
  async createAssistant(): Promise<{ id: string }> {
    if (this.assistantId) {
      return { id: this.assistantId };
    }

    try {
      const assistant =
        await this.client.beta.assistants.create(ASSISTANT_CONFIG);
      this.assistantId = assistant.id;
      return { id: assistant.id };
    } catch (error) {
      throw new Error(
        `Failed to create assistant: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create a new thread for conversation
   */
  async createThread(): Promise<{ id: string }> {
    try {
      const thread = await this.client.beta.threads.create();
      return { id: thread.id };
    } catch (error) {
      throw new Error(
        `Failed to create thread: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create a message in a thread, optionally with file attachment
   */
  async createMessage(
    threadId: string,
    content: string,
    fileId?: string
  ): Promise<OpenAI.Beta.Threads.Messages.Message> {
    try {
      const messageParams: OpenAI.Beta.Threads.Messages.MessageCreateParams = {
        role: 'user',
        content,
      };

      if (fileId) {
        messageParams.attachments = [
          {
            file_id: fileId,
            tools: [{ type: 'code_interpreter' }],
          },
        ];
      }

      const message = await this.client.beta.threads.messages.create(
        threadId,
        messageParams
      );
      return message;
    } catch (error) {
      throw new Error(
        `Failed to create message: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create and execute a run
   */
  async createRun(
    threadId: string,
    assistantId?: string,
    stream: boolean = false
  ): Promise<OpenAI.Beta.Threads.Runs.Run> {
    try {
      const runAssistantId = assistantId || this.assistantId;
      if (!runAssistantId) {
        throw new Error(
          'No assistant ID available. Call createAssistant() first.'
        );
      }

      const runParams: OpenAI.Beta.Threads.Runs.RunCreateParams = {
        assistant_id: runAssistantId,
        max_prompt_tokens: 1000,
        max_completion_tokens: 1000,
        temperature: 0.2,
      };

      if (stream) {
        runParams.stream = true;
      }

      const run = await this.client.beta.threads.runs.create(
        threadId,
        runParams
      );
      return run;
    } catch (error) {
      throw new Error(
        `Failed to create run: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create and stream a run with real-time updates
   */
  async *streamRun(
    threadId: string,
    assistantId?: string
  ): AsyncGenerator<
    OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput | any,
    void,
    unknown
  > {
    try {
      const runAssistantId = assistantId || this.assistantId;
      if (!runAssistantId) {
        throw new Error(
          'No assistant ID available. Call createAssistant() first.'
        );
      }

      const stream = await this.client.beta.threads.runs.create(threadId, {
        assistant_id: runAssistantId,
        stream: true,
        max_prompt_tokens: 1000,
        max_completion_tokens: 1000,
        temperature: 0.2,
      });

      for await (const event of stream) {
        yield event;
      }
    } catch (error) {
      throw new Error(
        `Failed to stream run: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Cancel a running analysis
   */
  async cancelRun(
    threadId: string,
    runId: string
  ): Promise<OpenAI.Beta.Threads.Runs.Run> {
    try {
      const cancelledRun = await this.client.beta.threads.runs.cancel(
        threadId,
        runId
      );
      return cancelledRun;
    } catch (error) {
      throw new Error(
        `Failed to cancel run: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get messages from a thread
   */
  async getMessages(
    threadId: string,
    limit: number = 10
  ): Promise<OpenAI.Beta.Threads.Messages.Message[]> {
    try {
      const messages = await this.client.beta.threads.messages.list(threadId, {
        order: 'desc',
        limit,
      });
      return messages.data;
    } catch (error) {
      throw new Error(
        `Failed to get messages: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get a specific run status
   */
  async getRun(
    threadId: string,
    runId: string
  ): Promise<OpenAI.Beta.Threads.Runs.Run> {
    try {
      const run = await this.client.beta.threads.runs.retrieve(threadId, runId);
      return run;
    } catch (error) {
      throw new Error(
        `Failed to get run: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Download a file from OpenAI
   */
  async downloadFile(fileId: string): Promise<Buffer> {
    try {
      const response = await this.client.files.content(fileId);
      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer;
    } catch (error) {
      throw new Error(
        `Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Extract manifest from assistant output
 * Parses the last line JSON with fallback to message content
 */
export function extractManifest(
  messages: OpenAI.Beta.Threads.Messages.Message[]
): AnalysisManifest | null {
  // Find the latest assistant message
  const latestAssistantMessage = messages.find(msg => msg.role === 'assistant');

  if (!latestAssistantMessage) {
    return null;
  }

  // Get the text content from the message
  const textContent = latestAssistantMessage.content
    .filter(content => content.type === 'text')
    .map(content => content.text.value)
    .join('\n');

  if (!textContent) {
    return null;
  }

  try {
    // Try to parse the last line as JSON manifest
    const lines = textContent.trim().split(/\r?\n/);
    const lastLine = lines[lines.length - 1];

    // Try to parse as JSON
    const parsed = JSON.parse(lastLine);

    if (parsed?.manifest) {
      return parsed.manifest as AnalysisManifest;
    }

    // If no manifest property, check if the whole line is a manifest
    if (parsed?.insight && parsed?.files) {
      return parsed as AnalysisManifest;
    }

    // Fallback: create a basic manifest from message content
    return {
      insight: textContent.split('\n')[0] || 'Analysis completed',
      files: [],
      metadata: {
        analysis_type: 'unknown',
        fallback: true,
      },
    };
  } catch (error) {
    // JSON parsing failed, create fallback manifest
    return {
      insight: textContent.split('\n')[0] || 'Analysis completed',
      files: [],
      metadata: {
        analysis_type: 'unknown',
        fallback: true,
        parse_error:
          error instanceof Error ? error.message : 'Unknown parsing error',
      },
    };
  }
}

// Create a singleton instance
export const assistantManager = new AssistantManager();

// Export types for use in other modules
export type { OpenAI } from 'openai';
