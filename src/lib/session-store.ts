import crypto from 'crypto';

export interface SessionData {
  id: string;
  threadId: string;
  ttlExpiresAt: number;
  lastActivity: number;
  metrics: {
    uploadsCount: number;
    analysesCount: number;
    artifactsGenerated: number;
    totalTokensUsed: number;
  };
  uploadedFile?: {
    id: string;
    filename: string;
    size: number;
    checksum: string;
    openaiFileId?: string;
  };
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>;
  artifacts: Array<{
    id: string;
    name: string;
    type: 'file' | 'image' | 'data';
    size?: number;
    checksum: string;
    createdAt: number;
  }>;
}

export class SessionStore {
  private sessions = new Map<string, SessionData>();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private cleanupInterval: NodeJS.Timeout;
  private instanceId: string;

  constructor() {
    this.instanceId = `store_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`SessionStore instance created: ${this.instanceId}`);

    // Run cleanup every 30 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      30 * 60 * 1000
    );
  }

  /**
   * Create a new session with rolling 24h TTL
   */
  createSession(threadId: string): SessionData {
    const sessionId = crypto.randomUUID();
    const now = Date.now();

    const sessionData: SessionData = {
      id: sessionId,
      threadId,
      ttlExpiresAt: now + this.TTL,
      lastActivity: now,
      metrics: {
        uploadsCount: 0,
        analysesCount: 0,
        artifactsGenerated: 0,
        totalTokensUsed: 0,
      },
      messages: [],
      artifacts: [],
    };

    this.sessions.set(sessionId, sessionData);
    console.log(
      `Session created: ${sessionId} for threadId: ${threadId}. Total sessions: ${this.sessions.size}`
    );
    return sessionData;
  }

  /**
   * Get session by ID and update last activity (rolling TTL)
   */
  getSession(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    const now = Date.now();

    // Check if session has expired
    if (session.ttlExpiresAt < now) {
      this.sessions.delete(sessionId);
      return null;
    }

    // Update last activity and extend TTL (rolling 24h)
    session.lastActivity = now;
    session.ttlExpiresAt = now + this.TTL;

    return session;
  }

  /**
   * Update session data
   */
  updateSession(sessionId: string, updates: Partial<SessionData>): boolean {
    const session = this.getSession(sessionId);

    if (!session) {
      return false;
    }

    // Merge updates while preserving core fields
    Object.assign(session, updates, {
      id: session.id,
      lastActivity: Date.now(),
      ttlExpiresAt: Date.now() + this.TTL,
    });

    return true;
  }

  /**
   * Get session by thread ID
   */
  getSessionByThreadId(threadId: string): SessionData | null {
    console.log(
      `Looking for session with threadId: ${threadId}. Total sessions: ${this.sessions.size}`
    );

    for (const session of this.sessions.values()) {
      console.log(
        `Checking session ${session.id} with threadId: ${session.threadId}`
      );
      if (session.threadId === threadId && session.ttlExpiresAt > Date.now()) {
        // Update activity and return
        session.lastActivity = Date.now();
        session.ttlExpiresAt = Date.now() + this.TTL;
        console.log(`Found matching session: ${session.id}`);
        return session;
      }
    }
    console.log(`No session found for threadId: ${threadId}`);
    return null;
  }

  /**
   * Delete a specific session
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get all active sessions (for admin/debugging)
   */
  getActiveSessions(): SessionData[] {
    const now = Date.now();
    const activeSessions: SessionData[] = [];

    for (const session of this.sessions.values()) {
      if (session.ttlExpiresAt > now) {
        activeSessions.push(session);
      }
    }

    return activeSessions;
  }

  /**
   * Clean up expired sessions
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.ttlExpiresAt < now) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      this.sessions.delete(sessionId);
    }

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Get session count for monitoring
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Destroy the store and cleanup intervals
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessions.clear();
  }
}

// Singleton instance
// Global singleton to prevent multiple instances during hot reload
const globalForSessionStore = globalThis as unknown as {
  sessionStore: SessionStore | undefined;
};

export const sessionStore =
  globalForSessionStore.sessionStore ?? new SessionStore();

if (process.env.NODE_ENV !== 'production') {
  globalForSessionStore.sessionStore = sessionStore;
}
