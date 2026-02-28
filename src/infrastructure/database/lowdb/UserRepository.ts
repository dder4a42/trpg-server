// User Repository - LowDB implementation
// Handles user CRUD and authentication with JSON file storage

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseConnection } from './connection.js';
import type {
  User,
  RegistrationData,
} from '@/domain/user/types.js';
import type { IUserRepository } from '@/domain/user/repository.js';

export { type User, type RegistrationData };

export class UserRepository implements IUserRepository {
  constructor(private db: DatabaseConnection) {}

  /**
   * Create a new user
   */
  async create(data: RegistrationData & { passwordHash: string }): Promise<User> {
    const id = uuidv4();

    const newUser = {
      id,
      username: data.username,
      password_hash: data.passwordHash,
      email: data.email ?? null,
      created_at: new Date().toISOString(),
      last_login: null,
      is_active: 1,
      // Security fields
      failed_login_attempts: 0,
      locked_until: null,
    };

    this.db.getData().users.push(newUser);
    await this.db.write();

    return this.rowToUser(newUser);
  }

  /**
   * Get user by ID
   */
  async findById(id: string): Promise<User | null> {
    const user = this.db.getData().users.find((u) => u.id === id);
    return user ? this.rowToUser(user) : null;
  }

  /**
   * Get user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    const user = this.db.getData().users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
    return user ? this.rowToUser(user) : null;
  }

  /**
   * Get user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const user = this.db.getData().users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    return user ? this.rowToUser(user) : null;
  }

  /**
   * Find by username OR email
   */
  async findByUsernameOrEmail(usernameOrEmail: string): Promise<User | null> {
    // Check if it looks like an email
    if (usernameOrEmail.includes('@')) {
      return this.findByEmail(usernameOrEmail);
    }
    return this.findByUsername(usernameOrEmail);
  }

  /**
   * Update user
   */
  async update(
    id: string,
    updates: Partial<Omit<User, 'id' | 'createdAt'>>
  ): Promise<boolean> {
    const data = this.db.getData();
    const user = data.users.find((u) => u.id === id);
    if (!user) return false;

    if (updates.email !== undefined) {
      user.email = updates.email ?? null;
    }
    if (updates.passwordHash !== undefined) {
      user.password_hash = updates.passwordHash;
    }
    if (updates.isActive !== undefined) {
      user.is_active = updates.isActive ? 1 : 0;
    }
    if (updates.failedLoginAttempts !== undefined) {
      user.failed_login_attempts = updates.failedLoginAttempts;
    }
    if (updates.lockedUntil !== undefined) {
      user.locked_until = updates.lockedUntil ? updates.lockedUntil.toISOString() : null;
    }

    await this.db.write();
    return true;
  }

  /**
   * Delete user
   */
  async delete(id: string): Promise<boolean> {
    const data = this.db.getData();
    const idx = data.users.findIndex((u) => u.id === id);
    if (idx === -1) return false;

    data.users.splice(idx, 1);
    await this.db.write();
    return true;
  }

  /**
   * Activate user account
   */
  async activate(id: string): Promise<boolean> {
    return this.update(id, { isActive: true });
  }

  /**
   * Deactivate user account
   */
  async deactivate(id: string): Promise<boolean> {
    return this.update(id, { isActive: false });
  }

  /**
   * Count total users
   */
  async count(): Promise<number> {
    return this.db.getData().users.length;
  }

  /**
   * Count active users
   */
  async countActive(): Promise<number> {
    return this.db.getData().users.filter((u) => u.is_active === 1).length;
  }

  /**
   * List all users (for admin dashboard)
   */
  async listAll(): Promise<User[]> {
    const data = this.db.getData();
    return data.users.map((u) => this.rowToUser(u));
  }

  /**
   * Get user statistics
   */
  getStats(): {
    totalUsers: number;
    activeUsers: number;
    newUsersThisWeek: number;
  } {
    const data = this.db.getData();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    let activeUsers = 0;
    let newUsersThisWeek = 0;

    for (const user of data.users) {
      if (user.is_active === 1) {
        activeUsers += 1;
      }

      const createdAt = Date.parse(user.created_at);
      if (!Number.isNaN(createdAt) && createdAt >= weekAgo) {
        newUsersThisWeek += 1;
      }
    }

    return {
      totalUsers: data.users.length,
      activeUsers,
      newUsersThisWeek,
    };
  }

  /**
   * Verify password
   */
  async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  /**
   * Change password
   */
  async changePassword(id: string, newPassword: string): Promise<boolean> {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    return this.update(id, { passwordHash });
  }

  /**
   * Check if username exists
   */
  async usernameExists(username: string): Promise<boolean> {
    return this.db
      .getData()
      .users.some((u) => u.username.toLowerCase() === username.toLowerCase());
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string): Promise<boolean> {
    return this.db
      .getData()
      .users.some((u) => u.email?.toLowerCase() === email.toLowerCase());
  }

  /**
   * Increment failed login attempts
   */
  async incrementFailedAttempts(userId: string): Promise<number> {
    const data = this.db.getData();
    const user = data.users.find((u) => u.id === userId);
    if (!user) return 0;

    user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;
    await this.db.write();

    return user.failed_login_attempts;
  }

  /**
   * Reset failed login attempts
   */
  async resetFailedAttempts(userId: string): Promise<void> {
    const data = this.db.getData();
    const user = data.users.find((u) => u.id === userId);
    if (!user) return;

    user.failed_login_attempts = 0;
    user.locked_until = null;
    await this.db.write();
  }

  /**
   * Lock user account until specified time
   */
  async lockAccount(userId: string, lockUntil: Date): Promise<void> {
    const data = this.db.getData();
    const user = data.users.find((u) => u.id === userId);
    if (!user) return;

    user.locked_until = lockUntil.toISOString();
    await this.db.write();
  }

  /**
   * Check if user account is locked
   */
  async isAccountLocked(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) return false;

    if (!user.lockedUntil) return false;
    return user.lockedUntil > new Date();
  }

  /**
   * Atomic increment failed login attempts with lockout check
   * Returns: { attempts: number, locked: boolean, lockedUntil?: Date }
   * This prevents race conditions where multiple requests can increment simultaneously
   */
  async incrementFailedAttemptsAtomic(
    userId: string,
    maxAttempts: number,
    lockoutDurationMinutes: number
  ): Promise<{ attempts: number; locked: boolean; lockedUntil?: Date }> {
    return this.db.atomicUpdate((data) => {
      const user = data.users.find((u) => u.id === userId);
      if (!user) {
        throw new Error('User not found');
      }

      const now = new Date();
      const lockedUntil = user.locked_until ? new Date(user.locked_until) : null;

      // Check if account is currently locked
      if (lockedUntil && lockedUntil > now) {
        return {
          attempts: user.failed_login_attempts || 0,
          locked: true,
          lockedUntil,
        };
      }

      // Increment failed attempts
      user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;

      // Check if we should lock the account
      if (user.failed_login_attempts >= maxAttempts) {
        const lockUntil = new Date(
          now.getTime() + lockoutDurationMinutes * 60 * 1000
        );
        user.locked_until = lockUntil.toISOString();

        return {
          attempts: user.failed_login_attempts,
          locked: true,
          lockedUntil,
        };
      }

      return {
        attempts: user.failed_login_attempts,
        locked: false,
      };
    });
  }

  private rowToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email ?? undefined,
      passwordHash: row.password_hash,
      createdAt: new Date(row.created_at),
      lastLoginAt: row.last_login ? new Date(row.last_login) : null,
      isActive: row.is_active === 1,
      failedLoginAttempts: row.failed_login_attempts || 0,
      lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
    };
  }
}
