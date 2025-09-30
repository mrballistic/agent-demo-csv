/**
 * @fileoverview Storage Manager - Unified interface for session and file storage
 *
 * Provides a centralized API for managing sessions and files, coordinating between
 * the session store and file store to provide atomic operations and cleanup.
 */

import crypto from 'crypto';
import { sessionStore, SessionData } from './session-store';
import { fileStore, FileMetadata } from './file-store';

/**
 * Statistics about current storage usage
 */
export interface StorageStats {
  sessions: {
    active: number;
    total: number;
  };
  files: {
    totalFiles: number;
    totalSize: number;
    oldestFile: Date | null;
    newestFile: Date | null;
  };
}

/**
 * Unified storage interface for sessions and files
 *
 * Coordinates between session store and file store to provide:
 * - Session lifecycle management
 * - File upload and storage
 * - Storage statistics and cleanup
 * - Atomic operations across stores
 */
export class StorageManager {
  /**
   * Create a new session with thread ID
   */
  createSession(threadId: string): SessionData {
    return sessionStore.createSession(threadId);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SessionData | null {
    return sessionStore.getSession(sessionId);
  }

  /**
   * Get session by thread ID
   */
  getSessionByThreadId(threadId: string): SessionData | null {
    return sessionStore.getSessionByThreadId(threadId);
  }

  /**
   * Update session data
   */
  updateSession(sessionId: string, updates: Partial<SessionData>): boolean {
    return sessionStore.updateSession(sessionId, updates);
  }

  /**
   * Store a file and associate it with a session
   */
  async storeFile(
    sessionId: string,
    filename: string,
    content: Buffer,
    mimeType?: string
  ): Promise<FileMetadata> {
    const fileMetadata = await fileStore.storeFile(
      sessionId,
      filename,
      content,
      mimeType
    );

    // Update session with file reference
    const session = sessionStore.getSession(sessionId);
    if (session) {
      session.artifacts.push({
        id: fileMetadata.id,
        name: fileMetadata.originalName,
        type: this.getFileType(fileMetadata.mimeType),
        size: fileMetadata.size,
        checksum: fileMetadata.checksum,
        createdAt: fileMetadata.createdAt,
      });

      // Update metrics
      session.metrics.artifactsGenerated++;
    }

    return fileMetadata;
  }

  /**
   * Store an artifact with automatic naming
   */
  async storeArtifact(
    sessionId: string,
    artifactType: string,
    content: Buffer,
    extension: string = 'bin'
  ): Promise<FileMetadata> {
    const fileMetadata = await fileStore.storeArtifact(
      sessionId,
      artifactType,
      content,
      extension
    );

    // Update session with artifact reference
    const session = sessionStore.getSession(sessionId);
    if (session) {
      session.artifacts.push({
        id: fileMetadata.id,
        name: fileMetadata.filename,
        type: this.getFileType(fileMetadata.mimeType),
        size: fileMetadata.size,
        checksum: fileMetadata.checksum,
        createdAt: fileMetadata.createdAt,
      });

      // Update metrics
      session.metrics.artifactsGenerated++;
    }

    return fileMetadata;
  }

  /**
   * Get file content by ID
   */
  async getFile(fileId: string): Promise<Buffer | null> {
    return fileStore.getFile(fileId);
  }

  /**
   * Get file metadata by ID
   */
  getFileMetadata(fileId: string): FileMetadata | null {
    return fileStore.getFileMetadata(fileId);
  }

  /**
   * Get all files for a session
   */
  getSessionFiles(sessionId: string): FileMetadata[] {
    return fileStore.getSessionFiles(sessionId);
  }

  /**
   * Delete a session and all its associated files
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    // Delete all files associated with the session
    await fileStore.deleteSessionFiles(sessionId);

    // Delete the session itself
    return sessionStore.deleteSession(sessionId);
  }

  /**
   * Delete all user data (GDPR compliance)
   */
  async deleteAllUserData(sessionId: string): Promise<{
    sessionDeleted: boolean;
    filesDeleted: number;
  }> {
    const filesDeleted = await fileStore.deleteSessionFiles(sessionId);
    const sessionDeleted = sessionStore.deleteSession(sessionId);

    return {
      sessionDeleted,
      filesDeleted,
    };
  }

  /**
   * Verify file integrity
   */
  async verifyFileIntegrity(fileId: string): Promise<boolean> {
    return fileStore.verifyFileIntegrity(fileId);
  }

  /**
   * Get comprehensive storage statistics
   */
  getStorageStats(): StorageStats {
    const activeSessions = sessionStore.getActiveSessions();
    const fileStats = fileStore.getStats();

    return {
      sessions: {
        active: activeSessions.length,
        total: sessionStore.getSessionCount(),
      },
      files: fileStats,
    };
  }

  /**
   * Add a message to a session
   */
  addMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string
  ): boolean {
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return false;
    }

    session.messages.push({
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Update session metrics
   */
  updateMetrics(
    sessionId: string,
    updates: Partial<SessionData['metrics']>
  ): boolean {
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return false;
    }

    Object.assign(session.metrics, updates);
    return true;
  }

  /**
   * Set uploaded file for session
   */
  setUploadedFile(
    sessionId: string,
    fileInfo: {
      id: string;
      filename: string;
      size: number;
      checksum: string;
      openaiFileId?: string;
    }
  ): boolean {
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return false;
    }

    session.uploadedFile = fileInfo;
    session.metrics.uploadsCount++;

    return true;
  }

  /**
   * Get file type from MIME type
   */
  private getFileType(mimeType: string): 'file' | 'image' | 'data' {
    if (mimeType.startsWith('image/')) {
      return 'image';
    }
    if (mimeType === 'text/csv' || mimeType === 'application/json') {
      return 'data';
    }
    return 'file';
  }

  /**
   * Cleanup expired data manually
   */
  async cleanup(): Promise<{
    sessionsDeleted: number;
    filesDeleted: number;
  }> {
    // Get expired sessions before cleanup
    const allSessions = sessionStore.getActiveSessions();
    const expiredSessions = allSessions.filter(
      s => s.ttlExpiresAt < Date.now()
    );

    // Force cleanup on both stores
    const initialSessionCount = sessionStore.getSessionCount();
    const initialFileCount = fileStore.getStats().totalFiles;

    // Trigger cleanup cycles
    (sessionStore as any).cleanup();
    await (fileStore as any).cleanup();

    const finalSessionCount = sessionStore.getSessionCount();
    const finalFileCount = fileStore.getStats().totalFiles;

    return {
      sessionsDeleted: initialSessionCount - finalSessionCount,
      filesDeleted: initialFileCount - finalFileCount,
    };
  }

  /**
   * Destroy all stores and cleanup intervals
   */
  destroy(): void {
    sessionStore.destroy();
    fileStore.destroy();
  }
}

// Singleton instance
export const storageManager = new StorageManager();

// Export individual stores for direct access if needed
export { sessionStore, fileStore };
