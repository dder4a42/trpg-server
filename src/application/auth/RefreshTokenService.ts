// Application: Refresh Token Service
// Handles refresh token generation, validation, and rotation

import { v4 as uuidv4 } from 'uuid';
import type { User } from '@/domain/user/types.js';
import type { ITokenService, IUserRepository } from '@/domain/user/repository.js';
import { authLogger, authMetrics, AUTH_METRICS } from '@/utils/auth-logger.js';

export interface RefreshToken {
  token: string;          // Opaque token (UUID)
  userId: string;
  familyId: string;       // Token family for rotation detection
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;       // If revoked
  replacedBy?: string;    // New token that replaced this one
}

export interface RefreshTokenPair {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
}

export interface RefreshTokenServiceConfig {
  refreshTokenTtlHours: number;      // Refresh token TTL (default: 24 hours)
  rememberMeTtlDays: number;          // Remember-me TTL (default: 7 days)
  maxTokensPerFamily: number;         // Max tokens in a family (default: 10)
  maxTotalTokens: number;             // Global max tokens across all users (default: 10000)
}

/**
 * RefreshTokenService - Handles refresh token lifecycle and rotation
 *
 * Security features:
 * - Token rotation: Old token invalidated when new one issued
 * - Token families: Detects token theft attempts
 * - Compromise detection: If old token from family is used, family is flagged
 * - Global token limit: Prevents unbounded memory growth
 *
 * DEVELOPMENT NOTE: Tokens stored in-memory (Map). Lost on server restart.
 * For production, migrate to database-backed storage in UserSession table.
 */
export class RefreshTokenService {
  // In-memory storage for refresh tokens (in production, use database)
  private tokens: Map<string, RefreshToken> = new Map();
  private families: Map<string, Set<string>> = new Map(); // familyId -> set of token IDs
  private compromisedFamilies: Set<string> = new Set();

  constructor(
    private tokenService: ITokenService,
    private userRepo: IUserRepository,
    private config: RefreshTokenServiceConfig
  ) {}

  /**
   * Create a new refresh token for a user
   * Returns the opaque token string
   * @throws {Error} If global token limit exceeded
   */
  async create(userId: string, rememberMe = false): Promise<string> {
    const now = new Date();
    const ttlMs = rememberMe
      ? this.config.rememberMeTtlDays * 24 * 60 * 60 * 1000
      : this.config.refreshTokenTtlHours * 60 * 60 * 1000;

    // Enforce global token limit to prevent memory exhaustion
    if (this.tokens.size >= this.config.maxTotalTokens) {
      // Try cleanup first
      await this.cleanup();
      if (this.tokens.size >= this.config.maxTotalTokens) {
        authLogger.warn('Refresh token limit exceeded', {
          currentSize: this.tokens.size,
          maxTokens: this.config.maxTotalTokens,
        });
        throw new Error(
          'Too many active refresh tokens. Please try again later or contact support.'
        );
      }
    }

    const token: RefreshToken = {
      token: uuidv4(),
      userId,
      familyId: uuidv4(), // New family for first token
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
    };

    // Store token
    this.tokens.set(token.token, token);

    // Add to family
    let family = this.families.get(token.familyId);
    if (!family) {
      family = new Set();
      this.families.set(token.familyId, family);
    }
    family.add(token.token);

    authLogger.debug('Refresh token created', {
      userId,
      tokenId: token.token,
      familyId: token.familyId,
      expiresAt: token.expiresAt.toISOString(),
      totalTokens: this.tokens.size,
    });

    return token.token;
  }

  /**
   * Validate a refresh token and create a new token pair (rotation)
   * Returns null if token is invalid, expired, or family is compromised
   */
  async rotate(refreshToken: string): Promise<RefreshTokenPair | null> {
    const oldToken = this.tokens.get(refreshToken);

    if (!oldToken) {
      authLogger.warn('Refresh token not found', { token: refreshToken });
      authMetrics.increment(AUTH_METRICS.LOGIN_FAILURE);
      return null;
    }

    // Check if expired
    if (oldToken.expiresAt < new Date()) {
      authLogger.warn('Refresh token expired', {
        token: refreshToken,
        userId: oldToken.userId,
        expiredAt: oldToken.expiresAt.toISOString(),
      });
      authMetrics.increment(AUTH_METRICS.SESSION_EXPIRED);
      return null;
    }

    // Check if family is compromised
    if (this.compromisedFamilies.has(oldToken.familyId)) {
      authLogger.warn('Refresh token family compromised', {
        familyId: oldToken.familyId,
        userId: oldToken.userId,
      });
      await this.revokeFamily(oldToken.familyId);
      return null;
    }

    // Check if this token was already replaced (rotation detection)
    if (oldToken.revokedAt) {
      authLogger.warn('Refresh token already revoked (possible theft)', {
        token: refreshToken,
        familyId: oldToken.familyId,
        userId: oldToken.userId,
      });
      // Mark family as compromised
      this.compromisedFamilies.add(oldToken.familyId);
      await this.revokeFamily(oldToken.familyId);
      return null;
    }

    // Get user
    const user = await this.getUserById(oldToken.userId);
    if (!user) {
      authLogger.warn('User not found for refresh token', {
        token: refreshToken,
        userId: oldToken.userId,
      });
      return null;
    }

    // Generate new access token
    const { accessToken, expiresIn } = await this.tokenService.sign(user);

    // Create new refresh token (same family)
    const now = new Date();
    const ttlMs = this.config.refreshTokenTtlHours * 60 * 60 * 1000;
    const newRefreshToken: RefreshToken = {
      token: uuidv4(),
      userId: oldToken.userId,
      familyId: oldToken.familyId, // Same family
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
    };

    // Revoke old token
    oldToken.revokedAt = now;
    oldToken.replacedBy = newRefreshToken.token;

    // Store new token
    this.tokens.set(newRefreshToken.token, newRefreshToken);
    this.families.get(newRefreshToken.familyId)!.add(newRefreshToken.token);

    // Clean up old tokens in family (keep only recent ones)
    await this.cleanupFamily(oldToken.familyId);

    authMetrics.increment(AUTH_METRICS.SESSION_REFRESHED);
    authLogger.info('Refresh token rotated', {
      userId: user.id,
      oldToken: refreshToken,
      newToken: newRefreshToken.token,
      familyId: oldToken.familyId,
    });

    return {
      accessToken,
      expiresIn,
      refreshToken: newRefreshToken.token,
      refreshExpiresIn: Math.floor(ttlMs / 1000),
    };
  }

  /**
   * Revoke a specific refresh token
   */
  async revoke(token: string): Promise<boolean> {
    const refreshToken = this.tokens.get(token);
    if (!refreshToken) {
      return false;
    }

    refreshToken.revokedAt = new Date();

    authMetrics.increment(AUTH_METRICS.SESSION_DELETED);
    authLogger.info('Refresh token revoked', {
      tokenId: token,
      userId: refreshToken.userId,
    });

    return true;
  }

  /**
   * Revoke all tokens in a family (called on compromise detection)
   */
  async revokeFamily(familyId: string): Promise<void> {
    const family = this.families.get(familyId);
    if (!family) {
      return;
    }

    const now = new Date();
    for (const tokenId of family) {
      const token = this.tokens.get(tokenId);
      if (token && !token.revokedAt) {
        token.revokedAt = now;
      }
    }

    authLogger.warn('Refresh token family revoked', {
      familyId,
      tokenCount: family.size,
    });
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllForUser(userId: string): Promise<number> {
    let revoked = 0;

    for (const [tokenId, token] of this.tokens.entries()) {
      if (token.userId === userId && !token.revokedAt) {
        token.revokedAt = new Date();
        revoked++;
      }
    }

    authLogger.info('All refresh tokens revoked for user', {
      userId,
      count: revoked,
    });

    return revoked;
  }

  /**
   * Get token info (for debugging/admin)
   */
  getTokenInfo(token: string): RefreshToken | null {
    return this.tokens.get(token) || null;
  }

  /**
   * Clean up expired and old tokens
   */
  async cleanup(): Promise<number> {
    const now = new Date();
    let cleaned = 0;

    for (const [tokenId, token] of this.tokens.entries()) {
      // Remove expired tokens
      if (token.expiresAt < now) {
        this.tokens.delete(tokenId);
        const family = this.families.get(token.familyId);
        if (family) {
          family.delete(tokenId);
        }
        cleaned++;
      }
    }

    if (cleaned > 0) {
      authLogger.debug('Cleaned up expired refresh tokens', { count: cleaned });
    }

    return cleaned;
  }

  // ==================== Private Methods ====================

  /**
   * Clean up old tokens in a family, keeping only the most recent ones
   */
  private async cleanupFamily(familyId: string): Promise<void> {
    const family = this.families.get(familyId);
    if (!family || family.size <= this.config.maxTokensPerFamily) {
      return;
    }

    // Get tokens sorted by creation date (newest first)
    const tokens = Array.from(family)
      .map(id => this.tokens.get(id))
      .filter((t): t is RefreshToken => t !== undefined)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Remove oldest tokens beyond the limit
    for (let i = this.config.maxTokensPerFamily; i < tokens.length; i++) {
      const token = tokens[i];
      if (token && !token.revokedAt) {
        this.tokens.delete(token.token);
        family.delete(token.token);
      }
    }
  }

  /**
   * Get user by ID (placeholder - would use UserRepository)
   */
  private async getUserById(userId: string): Promise<User | null> {
    return this.userRepo.findById(userId);
  }
}

/**
 * Default configuration for refresh token service
 */
export function defaultRefreshTokenConfig(): RefreshTokenServiceConfig {
  return {
    refreshTokenTtlHours: 24,
    rememberMeTtlDays: 7,
    maxTokensPerFamily: 10,
    maxTotalTokens: 10000, // Global limit across all users
  };
}
