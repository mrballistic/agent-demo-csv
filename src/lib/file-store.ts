import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { existsSync } from 'fs';

export interface FileMetadata {
  id: string;
  sessionId: string;
  filename: string;
  originalName: string;
  size: number;
  checksum: string;
  mimeType: string;
  createdAt: number;
  expiresAt: number;
  filePath: string;
}

export class FileStore {
  private files = new Map<string, FileMetadata>();
  private readonly baseDir: string;
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours
  private cleanupInterval: NodeJS.Timeout;

  constructor(baseDir: string = '/tmp/analyst-demo') {
    this.baseDir = baseDir;

    // Ensure base directory exists
    this.ensureBaseDir();

    // Run cleanup every hour
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      60 * 60 * 1000
    );
  }

  /**
   * Store a file with automatic checksum calculation
   */
  async storeFile(
    sessionId: string,
    filename: string,
    content: Buffer,
    mimeType: string = 'application/octet-stream'
  ): Promise<FileMetadata> {
    const fileId = crypto.randomUUID();
    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    const now = Date.now();

    // Create session directory if it doesn't exist
    const sessionDir = path.join(this.baseDir, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    // Generate unique filename to avoid conflicts
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uniqueFilename = `${timestamp}_${filename}`;
    const filePath = path.join(sessionDir, uniqueFilename);

    // Write file to disk
    await fs.writeFile(filePath, content);

    const metadata: FileMetadata = {
      id: fileId,
      sessionId,
      filename: uniqueFilename,
      originalName: filename,
      size: content.length,
      checksum,
      mimeType,
      createdAt: now,
      expiresAt: now + this.TTL,
      filePath,
    };

    this.files.set(fileId, metadata);
    return metadata;
  }

  /**
   * Store an artifact with versioning
   */
  async storeArtifact(
    sessionId: string,
    artifactType: string,
    content: Buffer,
    extension: string = 'bin'
  ): Promise<FileMetadata> {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `${artifactType}_${timestamp}.${extension}`;

    return this.storeFile(
      sessionId,
      filename,
      content,
      this.getMimeType(extension)
    );
  }

  /**
   * Retrieve file content by ID
   */
  async getFile(fileId: string): Promise<Buffer | null> {
    const metadata = this.files.get(fileId);

    if (!metadata) {
      return null;
    }

    // Check if file has expired
    if (metadata.expiresAt < Date.now()) {
      await this.deleteFile(fileId);
      return null;
    }

    try {
      return await fs.readFile(metadata.filePath);
    } catch (error) {
      // File doesn't exist on disk, remove from memory
      this.files.delete(fileId);
      return null;
    }
  }

  /**
   * Get file metadata by ID
   */
  getFileMetadata(fileId: string): FileMetadata | null {
    const metadata = this.files.get(fileId);

    if (!metadata) {
      return null;
    }

    // Check if file has expired
    if (metadata.expiresAt < Date.now()) {
      this.deleteFile(fileId).catch(console.error);
      return null;
    }

    return metadata;
  }

  /**
   * Get all files for a session
   */
  getSessionFiles(sessionId: string): FileMetadata[] {
    const sessionFiles: FileMetadata[] = [];
    const now = Date.now();

    for (const metadata of this.files.values()) {
      if (metadata.sessionId === sessionId && metadata.expiresAt > now) {
        sessionFiles.push(metadata);
      }
    }

    return sessionFiles;
  }

  /**
   * Delete a specific file
   */
  async deleteFile(fileId: string): Promise<boolean> {
    const metadata = this.files.get(fileId);

    if (!metadata) {
      return false;
    }

    try {
      // Remove from disk
      await fs.unlink(metadata.filePath);
    } catch (error) {
      // File might already be deleted, continue with cleanup
      console.warn(`Failed to delete file ${metadata.filePath}:`, error);
    }

    // Remove from memory
    this.files.delete(fileId);
    return true;
  }

  /**
   * Delete all files for a session
   */
  async deleteSessionFiles(sessionId: string): Promise<number> {
    const sessionFiles = Array.from(this.files.values()).filter(
      f => f.sessionId === sessionId
    );

    let deletedCount = 0;

    for (const file of sessionFiles) {
      const success = await this.deleteFile(file.id);
      if (success) {
        deletedCount++;
      }
    }

    // Also try to remove the session directory if empty
    try {
      const sessionDir = path.join(this.baseDir, sessionId);
      if (existsSync(sessionDir)) {
        const files = await fs.readdir(sessionDir);
        if (files.length === 0) {
          await fs.rmdir(sessionDir);
        }
      }
    } catch (error) {
      // Directory might not be empty or might not exist, ignore
    }

    return deletedCount;
  }

  /**
   * Verify file integrity using checksum
   */
  async verifyFileIntegrity(fileId: string): Promise<boolean> {
    const metadata = this.getFileMetadata(fileId);
    if (!metadata) {
      return false;
    }

    try {
      const content = await fs.readFile(metadata.filePath);
      const actualChecksum = crypto
        .createHash('sha256')
        .update(content)
        .digest('hex');
      return actualChecksum === metadata.checksum;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clean up expired files
   */
  private async cleanup(): Promise<void> {
    const now = Date.now();
    const expiredFiles: string[] = [];

    for (const [fileId, metadata] of this.files) {
      if (metadata.expiresAt < now) {
        expiredFiles.push(fileId);
      }
    }

    let cleanedCount = 0;
    for (const fileId of expiredFiles) {
      const success = await this.deleteFile(fileId);
      if (success) {
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired files`);
    }
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    totalFiles: number;
    totalSize: number;
    oldestFile: Date | null;
    newestFile: Date | null;
  } {
    const now = Date.now();
    let totalSize = 0;
    let oldestTime = Infinity;
    let newestTime = 0;
    let activeFiles = 0;

    for (const metadata of this.files.values()) {
      if (metadata.expiresAt > now) {
        activeFiles++;
        totalSize += metadata.size;
        oldestTime = Math.min(oldestTime, metadata.createdAt);
        newestTime = Math.max(newestTime, metadata.createdAt);
      }
    }

    return {
      totalFiles: activeFiles,
      totalSize,
      oldestFile: oldestTime === Infinity ? null : new Date(oldestTime),
      newestFile: newestTime === 0 ? null : new Date(newestTime),
    };
  }

  /**
   * Ensure base directory exists
   */
  private async ensureBaseDir(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create base directory:', error);
    }
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      csv: 'text/csv',
      txt: 'text/plain',
      md: 'text/markdown',
      json: 'application/json',
      pdf: 'application/pdf',
      zip: 'application/zip',
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Destroy the store and cleanup intervals
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.files.clear();
  }
}

// Singleton instance
export const fileStore = new FileStore();
