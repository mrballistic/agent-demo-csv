import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sessionStore } from '../session-store';
import { fileStore } from '../file-store';
import { assistantManager } from '../openai';

// Mock OpenAI
vi.mock('openai', () => ({
  default: vi.fn(() => ({
    beta: {
      assistants: {
        create: vi.fn(() => Promise.resolve({ id: 'asst_test123' })),
      },
      threads: {
        create: vi.fn(() => Promise.resolve({ id: 'thread_test123' })),
        messages: {
          create: vi.fn(() => Promise.resolve({ id: 'msg_test123' })),
          list: vi.fn(() =>
            Promise.resolve({
              data: [
                {
                  id: 'msg_test123',
                  role: 'assistant',
                  content: [
                    {
                      type: 'text',
                      text: {
                        value:
                          'Profile analysis complete.\n{"manifest":{"insight":"Data profiled successfully","files":[{"path":"/mnt/data/summary.md","type":"file","purpose":"profile"}],"metadata":{"analysis_type":"profile"}}}',
                      },
                    },
                  ],
                },
              ],
            })
          ),
        },
        runs: {
          create: vi.fn(() =>
            Promise.resolve({
              id: 'run_test123',
              status: 'queued',
              thread_id: 'thread_test123',
            })
          ),
        },
      },
    },
  })),
}));

describe('Profiling Workflow', () => {
  beforeEach(() => {
    // Clear any existing sessions and files
    sessionStore.destroy();
    fileStore.destroy();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create a session and thread for profiling', async () => {
    // Create assistant and thread
    const assistant = await assistantManager.createAssistant();
    expect(assistant.id).toBe('asst_test123');

    const thread = await assistantManager.createThread();
    expect(thread.id).toBe('thread_test123');

    // Create session
    const session = sessionStore.createSession(thread.id);
    expect(session.threadId).toBe(thread.id);
    expect(session.metrics.analysesCount).toBe(0);
  });

  it('should create message with file attachment', async () => {
    const thread = await assistantManager.createThread();
    const session = sessionStore.createSession(thread.id);

    // Create message with file
    const message = await assistantManager.createMessage(
      session.threadId,
      'Profile the file and suggest questions.',
      'file-test123'
    );

    expect(message.id).toBe('msg_test123');
  });

  it('should create and track analysis run', async () => {
    const thread = await assistantManager.createThread();
    const session = sessionStore.createSession(thread.id);

    // Create run
    const run = await assistantManager.createRun(session.threadId);
    expect(run.id).toBe('run_test123');
    expect(run.status).toBe('queued');

    // Update session metrics
    sessionStore.updateSession(session.id, {
      metrics: {
        ...session.metrics,
        analysesCount: session.metrics.analysesCount + 1,
      },
    });

    const updatedSession = sessionStore.getSession(session.id);
    expect(updatedSession?.metrics.analysesCount).toBe(1);
  });

  it('should extract manifest from assistant messages', async () => {
    const thread = await assistantManager.createThread();

    // Get messages (mocked to return manifest)
    const messages = await assistantManager.getMessages(thread.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
  });

  it('should store artifacts from profiling', async () => {
    const sessionId = 'test-session-123';

    // Store a profile summary artifact
    const summaryContent = `# Data Profile Summary
    
## Dataset Overview
- Rows: 1,000
- Columns: 5
- Quality: Good

## Analysis Complete
Profile generated successfully.`;

    const artifact = await fileStore.storeArtifact(
      sessionId,
      'profile_summary',
      Buffer.from(summaryContent, 'utf-8'),
      'md'
    );

    expect(artifact.id).toBeDefined();
    expect(artifact.originalName).toMatch(/profile_summary_.*\.md/);
    expect(artifact.size).toBe(summaryContent.length);

    // Verify we can retrieve the artifact
    const retrievedContent = await fileStore.getFile(artifact.id);
    expect(retrievedContent?.toString('utf-8')).toBe(summaryContent);
  });

  it('should handle session cleanup after TTL expiry', async () => {
    const thread = await assistantManager.createThread();
    const session = sessionStore.createSession(thread.id);

    // Verify session exists
    expect(sessionStore.getSession(session.id)).toBeTruthy();

    // Manually expire the session for testing
    const expiredSession = sessionStore.getSession(session.id);
    if (expiredSession) {
      expiredSession.ttlExpiresAt = Date.now() - 1000; // 1 second ago
    }

    // Try to get expired session
    const retrievedSession = sessionStore.getSession(session.id);
    expect(retrievedSession).toBeNull();
  });

  it('should verify file integrity with checksums', async () => {
    const sessionId = 'test-session-456';
    const content = Buffer.from('Test file content for integrity check');

    const artifact = await fileStore.storeArtifact(
      sessionId,
      'test_file',
      content,
      'txt'
    );

    // Verify integrity
    const isValid = await fileStore.verifyFileIntegrity(artifact.id);
    expect(isValid).toBe(true);

    // Verify metadata
    const metadata = fileStore.getFileMetadata(artifact.id);
    expect(metadata?.checksum).toBeDefined();
    expect(metadata?.size).toBe(content.length);
  });
});
