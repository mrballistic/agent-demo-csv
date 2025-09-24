import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionStore } from '../session-store';
import { FileStore } from '../file-store';
import { StorageManager } from '../storage-manager';
import fs from 'fs/promises';
import path from 'path';

// Mock fs for testing
vi.mock('fs/promises');
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
}));

describe('SessionStore', () => {
  let sessionStore: SessionStore;

  beforeEach(() => {
    sessionStore = new SessionStore();
  });

  afterEach(() => {
    sessionStore.destroy();
  });

  it('should create a new session with correct structure', () => {
    const threadId = 'thread-123';
    const session = sessionStore.createSession(threadId);

    expect(session).toMatchObject({
      id: expect.any(String),
      threadId,
      ttlExpiresAt: expect.any(Number),
      lastActivity: expect.any(Number),
      metrics: {
        uploadsCount: 0,
        analysesCount: 0,
        artifactsGenerated: 0,
        totalTokensUsed: 0,
      },
      messages: [],
      artifacts: [],
    });

    expect(session.ttlExpiresAt).toBeGreaterThan(Date.now());
  });

  it('should retrieve session by ID and update TTL', () => {
    vi.useFakeTimers();

    const threadId = 'thread-123';
    const session = sessionStore.createSession(threadId);
    const originalTTL = session.ttlExpiresAt;

    // Wait a bit to ensure time difference
    vi.advanceTimersByTime(100);

    const retrieved = sessionStore.getSession(session.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved!.ttlExpiresAt).toBeGreaterThan(originalTTL);

    vi.useRealTimers();
  });

  it('should return null for expired sessions', () => {
    const threadId = 'thread-123';
    const session = sessionStore.createSession(threadId);

    // Manually expire the session
    session.ttlExpiresAt = Date.now() - 1000;

    const retrieved = sessionStore.getSession(session.id);
    expect(retrieved).toBeNull();
  });

  it('should find session by thread ID', () => {
    const threadId = 'thread-123';
    const session = sessionStore.createSession(threadId);

    const found = sessionStore.getSessionByThreadId(threadId);
    expect(found).toEqual(session);
  });

  it('should update session data', () => {
    const threadId = 'thread-123';
    const session = sessionStore.createSession(threadId);

    const success = sessionStore.updateSession(session.id, {
      metrics: {
        uploadsCount: 1,
        analysesCount: 2,
        artifactsGenerated: 3,
        totalTokensUsed: 100,
      },
    });

    expect(success).toBe(true);

    const updated = sessionStore.getSession(session.id);
    expect(updated!.metrics.uploadsCount).toBe(1);
    expect(updated!.metrics.analysesCount).toBe(2);
  });
});

describe('FileStore', () => {
  let fileStore: FileStore;
  const testDir = '/tmp/test-analyst-demo';

  beforeEach(() => {
    fileStore = new FileStore(testDir);
    // Mock fs operations
    (fs.mkdir as any).mockResolvedValue(undefined);
    (fs.writeFile as any).mockResolvedValue(undefined);
    (fs.readFile as any).mockResolvedValue(Buffer.from('test content'));
    (fs.unlink as any).mockResolvedValue(undefined);
    (fs.rmdir as any).mockResolvedValue(undefined);
    (fs.readdir as any).mockResolvedValue([]);
  });

  afterEach(() => {
    fileStore.destroy();
    vi.clearAllMocks();
  });

  it('should store a file with correct metadata', async () => {
    const sessionId = 'session-123';
    const filename = 'test.csv';
    const content = Buffer.from('test,data\n1,2');
    const mimeType = 'text/csv';

    const metadata = await fileStore.storeFile(
      sessionId,
      filename,
      content,
      mimeType
    );

    expect(metadata).toMatchObject({
      id: expect.any(String),
      sessionId,
      originalName: filename,
      size: content.length,
      checksum: expect.any(String),
      mimeType,
      createdAt: expect.any(Number),
      expiresAt: expect.any(Number),
      filePath: expect.any(String),
    });

    expect(metadata.expiresAt).toBeGreaterThan(Date.now());
    expect(fs.mkdir).toHaveBeenCalledWith(path.join(testDir, sessionId), {
      recursive: true,
    });
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should store artifacts with versioned naming', async () => {
    const sessionId = 'session-123';
    const artifactType = 'chart';
    const content = Buffer.from('fake png data');
    const extension = 'png';

    const metadata = await fileStore.storeArtifact(
      sessionId,
      artifactType,
      content,
      extension
    );

    // Check that filename contains the artifact type and timestamp
    expect(metadata.filename).toContain('chart_');
    expect(metadata.filename).toContain('.png');
    expect(metadata.mimeType).toBe('image/png');
  });

  it('should retrieve file content by ID', async () => {
    const sessionId = 'session-123';
    const content = Buffer.from('test content');
    const metadata = await fileStore.storeFile(sessionId, 'test.txt', content);

    const retrieved = await fileStore.getFile(metadata.id);
    expect(retrieved).toEqual(content);
    expect(fs.readFile).toHaveBeenCalledWith(metadata.filePath);
  });

  it('should return null for non-existent files', async () => {
    const result = await fileStore.getFile('non-existent-id');
    expect(result).toBeNull();
  });

  it('should get session files', async () => {
    const sessionId = 'session-123';
    const content1 = Buffer.from('content1');
    const content2 = Buffer.from('content2');

    await fileStore.storeFile(sessionId, 'file1.txt', content1);
    await fileStore.storeFile(sessionId, 'file2.txt', content2);

    const sessionFiles = fileStore.getSessionFiles(sessionId);
    expect(sessionFiles).toHaveLength(2);
    expect(sessionFiles.every(f => f.sessionId === sessionId)).toBe(true);
  });

  it('should delete files', async () => {
    const sessionId = 'session-123';
    const content = Buffer.from('test content');
    const metadata = await fileStore.storeFile(sessionId, 'test.txt', content);

    const success = await fileStore.deleteFile(metadata.id);
    expect(success).toBe(true);
    expect(fs.unlink).toHaveBeenCalledWith(metadata.filePath);

    // Should return null after deletion
    const retrieved = await fileStore.getFile(metadata.id);
    expect(retrieved).toBeNull();
  });
});

describe('StorageManager', () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    storageManager = new StorageManager();
    // Mock fs operations
    (fs.mkdir as any).mockResolvedValue(undefined);
    (fs.writeFile as any).mockResolvedValue(undefined);
    (fs.readFile as any).mockResolvedValue(Buffer.from('test content'));
  });

  afterEach(() => {
    storageManager.destroy();
    vi.clearAllMocks();
  });

  it('should create session and store files together', async () => {
    const threadId = 'thread-123';
    const session = storageManager.createSession(threadId);

    const content = Buffer.from('test,data\n1,2');
    const fileMetadata = await storageManager.storeFile(
      session.id,
      'test.csv',
      content,
      'text/csv'
    );

    expect(fileMetadata).toBeTruthy();

    const updatedSession = storageManager.getSession(session.id);
    expect(updatedSession!.artifacts).toHaveLength(1);
    expect(updatedSession!.metrics.artifactsGenerated).toBe(1);
  });

  it('should add messages to session', () => {
    const threadId = 'thread-123';
    const session = storageManager.createSession(threadId);

    const success = storageManager.addMessage(session.id, 'user', 'Hello');
    expect(success).toBe(true);

    const updatedSession = storageManager.getSession(session.id);
    expect(updatedSession!.messages).toHaveLength(1);
    expect(updatedSession!.messages[0]).toMatchObject({
      role: 'user',
      content: 'Hello',
      id: expect.any(String),
      timestamp: expect.any(Number),
    });
  });

  it('should update metrics', () => {
    const threadId = 'thread-123';
    const session = storageManager.createSession(threadId);

    const success = storageManager.updateMetrics(session.id, {
      totalTokensUsed: 150,
      analysesCount: 2,
    });

    expect(success).toBe(true);

    const updatedSession = storageManager.getSession(session.id);
    expect(updatedSession!.metrics.totalTokensUsed).toBe(150);
    expect(updatedSession!.metrics.analysesCount).toBe(2);
  });

  it('should delete all user data', async () => {
    const threadId = 'thread-123';
    const session = storageManager.createSession(threadId);

    // Store some files
    await storageManager.storeFile(
      session.id,
      'file1.txt',
      Buffer.from('content1')
    );
    await storageManager.storeFile(
      session.id,
      'file2.txt',
      Buffer.from('content2')
    );

    const result = await storageManager.deleteAllUserData(session.id);

    expect(result.sessionDeleted).toBe(true);
    expect(result.filesDeleted).toBe(2);

    // Session should be gone
    const deletedSession = storageManager.getSession(session.id);
    expect(deletedSession).toBeNull();
  });

  it('should get storage statistics', async () => {
    const threadId1 = 'thread-123';
    const threadId2 = 'thread-456';

    const session1 = storageManager.createSession(threadId1);
    const session2 = storageManager.createSession(threadId2);

    await storageManager.storeFile(
      session1.id,
      'file1.txt',
      Buffer.from('content1')
    );
    await storageManager.storeFile(
      session2.id,
      'file2.txt',
      Buffer.from('content2')
    );

    const stats = storageManager.getStorageStats();

    expect(stats.sessions.active).toBe(2);
    expect(stats.files.totalFiles).toBe(2);
  });
});
