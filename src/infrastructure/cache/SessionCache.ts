// Infrastructure: Session Cache
// Write-through LRU cache for session validation
// Reduces disk I/O for frequent session validations while maintaining database consistency

import type { User, UserSession } from '@/domain/user/types.js';
import type { IUserSessionRepository, IUserRepository } from '@/domain/user/repository.js';
import { authLogger } from '@/utils/auth-logger.js';

export interface SessionCacheConfig {
  maxSize: number;           // Max cached sessions (default: 1000)
  ttlMs: number;             // Cache entry TTL (default: 5 minutes)
  cleanupIntervalMs: number; // Cleanup interval (default: 1 minute)
  enabled: boolean;          // Whether caching is enabled
}

interface CachedSession {
  session: UserSession;
  user: User;                // Denormalized for fast access
  cachedAt: number;          // Timestamp for TTL
  accessCount: number;       // For LRU eviction
}

/**
 * SessionCache - Write-through LRU cache for session validation
 *
 * Goals:
 * - Reduce disk I/O for frequent session validations
 * - Maintain consistency with database (write-through pattern)
 * - Auto-evict expired sessions based on TTL
 */
export class SessionCache {
  private cache: Map<string, CachedSession> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private sessionRepo: IUserSessionRepository,
    private userRepo: IUserRepository,
    private config: SessionCacheConfig
  ) {
    if (this.config.enabled) {
      // Start periodic cleanup
      this.startCleanup();
    }
  }

  /**
   * Get session from cache (with fallback to database)
   * Returns null if session not found or expired
   */
  async get(sessionId: string): Promise<{ session: UserSession; user: User } | null> {
    if (!this.config.enabled) {
      return this.getFromDatabase(sessionId);
    }

    // Check cache first
    const cached = this.cache.get(sessionId);
    const now = Date.now();

    if (cached) {
      // Check if cache entry is still valid (TTL)
      if (now - cached.cachedAt <= this.config.ttlMs) {
        // CRITICAL: Also verify the underlying session hasn't expired
        // Cache TTL is just a performance optimization - session expiration is the source of truth
        const sessionExpiresAt = new Date(cached.session.expiresAt).getTime();
        if (sessionExpiresAt <= now) {
          // Session itself has expired; remove from cache and treat as miss
          this.cache.delete(sessionId);
          authLogger.debug('Cached session expired', { sessionId, sessionExpiresAt });
        } else {
          // Session is still valid - cache hit
          cached.accessCount++;
          authLogger.debug('Cache hit', { sessionId, accessCount: cached.accessCount });
          return { session: cached.session, user: cached.user };
        }
      } else {
        // Cache entry expired (TTL), remove it
        this.cache.delete(sessionId);
        authLogger.debug('Cache entry expired', { sessionId, age: now - cached.cachedAt });
      }
    }

    // Cache miss or expired - fetch from database
    authLogger.debug('Cache miss', { sessionId });
    return this.getFromDatabase(sessionId);
  }

  /**
   * Add session to cache (write-through to database)
   * Session should already exist in database (created via sessionRepo.create)
   */
  async set(session: UserSession, user: User): Promise<void> {
    if (!this.config.enabled) {
      return; // Cache disabled, skip
    }

    // Check cache size before adding (LRU eviction)
    if (this.cache.size >= this.config.maxSize && !this.cache.has(session.id)) {
      this.evictLRU();
    }

    // Add to cache
    this.cache.set(session.id, {
      session,
      user,
      cachedAt: Date.now(),
      accessCount: 1,
    });

    authLogger.debug('Cached session', {
      sessionId: session.id,
      userId: user.id,
      cacheSize: this.cache.size,
    });
  }

  /**
   * Remove session from cache (and database)
   * Call this when session is deleted/expired
   */
  async delete(sessionId: string): Promise<void> {
    // Remove from cache
    this.cache.delete(sessionId);

    // Delete from database (write-through)
    await this.sessionRepo.delete(sessionId);

    authLogger.debug('Deleted session from cache', { sessionId });
  }

  /**
   * Update session in cache (and database)
   * Call this when session is modified (e.g., sliding expiration)
   */
  async update(session: UserSession, user?: User): Promise<void> {
    if (!this.config.enabled) {
      // Write to database only
      await this.sessionRepo.update(session);
      return;
    }

    const cached = this.cache.get(session.id);
    if (cached) {
      // Update cache
      cached.session = session;
      cached.cachedAt = Date.now();
      if (user) {
        cached.user = user;
      }
    }

    // Write to database (write-through)
    await this.sessionRepo.update(session);

    authLogger.debug('Updated session in cache', { sessionId: session.id });
  }

  /**
   * Clear all cached sessions
   */
  clear(): void {
    this.cache.clear();
    authLogger.debug('Cleared all sessions from cache');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number; // Placeholder - would need tracking
  } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: 0, // Would need request tracking for accurate hit rate
    };
  }

  /**
   * Stop the cleanup timer
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ==================== Private Methods ====================

  /**
   * Fetch session from database (cache miss fallback)
   */
  private async getFromDatabase(
    sessionId: string
  ): Promise<{ session: UserSession; user: User } | null> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      return null;
    }

    const user = await this.userRepo.findById(session.userId);
    if (!user || !user.isActive) {
      return null;
    }

    // Cache the result for next time
    await this.set(session, user);

    return { session, user };
  }

  /**
   * Evict least recently used session from cache
   * LRU based on accessCount (lowest count = least used)
   */
  private evictLRU(): void {
    let minAccess = Infinity;
    let evictKey: string | null = null;

    for (const [key, value] of this.cache.entries()) {
      if (value.accessCount < minAccess) {
        minAccess = value.accessCount;
        evictKey = key;
      }
    }

    if (evictKey) {
      this.cache.delete(evictKey);
      authLogger.debug('Evicted LRU session', { sessionId: evictKey, accessCount: minAccess });
    }
  }

  /**
   * Start periodic cleanup of expired cache entries
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    authLogger.debug('Started cache cleanup', {
      intervalMs: this.config.cleanupIntervalMs,
    });
  }

  /**
   * Remove expired entries from cache
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.cachedAt > this.config.ttlMs) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      authLogger.debug('Cleaned expired cache entries', { count: cleaned });
    }
  }
}

/**
 * Default configuration for session cache
 */
export function defaultSessionCacheConfig(): SessionCacheConfig {
  return {
    maxSize: 1000,
    ttlMs: 5 * 60 * 1000,  // 5 minutes
    cleanupIntervalMs: 1 * 60 * 1000,  // 1 minute
    enabled: true,
  };
}
