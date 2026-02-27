// User Session Repository - LowDB implementation
// Handles user session persistence for authentication

import type { DatabaseConnection } from './connection.js';
import type { UserSession } from '@/domain/user/types.js';
import type { IUserSessionRepository } from '@/domain/user/repository.js';

export class UserSessionRepository implements IUserSessionRepository {
  constructor(private db: DatabaseConnection) {}

  /**
   * Create a new session
   */
  async create(
    session: Omit<UserSession, 'id'> & { id?: string }
  ): Promise<UserSession> {
    const newSession: UserSession = {
      ...session,
      id: session.id || crypto.randomUUID(),
    };

    const record = {
      id: newSession.id,
      user_id: newSession.userId,
      created_at: newSession.createdAt.toISOString(),
      expires_at: newSession.expiresAt.toISOString(),
      ip_address: newSession.ipAddress ?? null,
      user_agent: newSession.userAgent ?? null,
    };

    this.db.getData().userSessions.push(record);
    await this.db.write();

    return newSession;
  }

  /**
   * Find session by ID
   */
  async findById(sessionId: string): Promise<UserSession | null> {
    const record = this.db
      .getData()
      .userSessions.find((s) => s.id === sessionId);

    if (!record) return null;

    return this.rowToSession(record);
  }

  /**
   * Find all sessions for a user
   */
  async findByUserId(userId: string): Promise<UserSession[]> {
    const records = this.db
      .getData()
      .userSessions.filter((s) => s.user_id === userId);

    return records.map((r) => this.rowToSession(r));
  }

  /**
   * Delete a session
   */
  async delete(sessionId: string): Promise<boolean> {
    const data = this.db.getData();
    const idx = data.userSessions.findIndex((s) => s.id === sessionId);

    if (idx === -1) return false;

    data.userSessions.splice(idx, 1);
    await this.db.write();
    return true;
  }

  /**
   * Delete all sessions for a user
   */
  async deleteByUserId(userId: string): Promise<number> {
    const data = this.db.getData();
    const beforeCount = data.userSessions.length;

    data.userSessions = data.userSessions.filter(
      (s) => s.user_id !== userId
    );

    const deletedCount = beforeCount - data.userSessions.length;

    if (deletedCount > 0) {
      await this.db.write();
    }

    return deletedCount;
  }

  /**
   * Delete expired sessions
   */
  async deleteExpired(): Promise<number> {
    const now = new Date().toISOString();
    const data = this.db.getData();
    const beforeCount = data.userSessions.length;

    data.userSessions = data.userSessions.filter(
      (s) => s.expires_at > now
    );

    const deletedCount = beforeCount - data.userSessions.length;

    if (deletedCount > 0) {
      await this.db.write();
    }

    return deletedCount;
  }

  /**
   * Check if a session is valid (exists and not expired)
   */
  async isValid(sessionId: string): Promise<boolean> {
    const session = await this.findById(sessionId);
    if (!session) return false;

    return session.expiresAt > new Date();
  }

  private rowToSession(row: any): UserSession {
    return {
      id: row.id,
      userId: row.user_id,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      ipAddress: row.ip_address ?? undefined,
      userAgent: row.user_agent ?? undefined,
    };
  }
}

// ==================== Error Classes ====================

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
