// Application: Token Service
// Handles JWT access token generation and validation

import type { User } from '@/domain/user/types.js';
import type { ITokenService, TokenPayload } from '@/domain/user/repository.js';
import { authLogger } from '@/utils/auth-logger.js';
import { isTokenRevoked } from '@/utils/tokenRevocationList.js';

export type { TokenPayload };

export interface TokenPair {
  accessToken: string;
  expiresIn: number;  // seconds
}

export interface TokenServiceConfig {
  secret: string;           // JWT secret key (required)
  accessTokenTtlMinutes: number;  // Access token TTL (default: 15 minutes)
  issuer?: string;          // JWT issuer (default: 'trpg-server')
  audience?: string;        // JWT audience (optional)
}

/**
 * TokenService - JWT access token management
 *
 * Uses native Web Crypto API for JWT signing/verification
 * No external dependencies required
 */
export class TokenService implements ITokenService {
  private readonly config: TokenServiceConfig;

  constructor(config: TokenServiceConfig) {
    if (!config.secret) {
      throw new Error('JWT secret is required');
    }
    this.config = {
      accessTokenTtlMinutes: 15,
      issuer: 'trpg-server',
      ...config,
    };
  }

  /**
   * Generate a JWT access token for a user
   * Returns the token string and expiration time in seconds
   */
  async sign(user: User): Promise<TokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.config.accessTokenTtlMinutes * 60;
    const exp = now + expiresIn;
    const jti = crypto.randomUUID();

    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      isAdmin: !!user.isAdmin,
      iat: now,
      exp,
      jti,
    };

    // Encode header and payload
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));

    // Create signature
    const data = `${encodedHeader}.${encodedPayload}`;
    const signature = await this.signHmacSha256(data, this.config.secret);
    const encodedSignature = this.base64UrlEncode(signature);

    const accessToken = `${data}.${encodedSignature}`;

    return {
      accessToken,
      expiresIn,
    };
  }

  /**
   * Verify and decode a JWT access token
   * Returns the payload if valid, null otherwise
   */
  async verify(token: string): Promise<TokenPayload | null> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        authLogger.debug('Token verification failed: invalid format', {
          tokenPrefix: token.substring(0, 20) + '...',
        });
        return null;
      }

      const [encodedHeader, encodedPayload, encodedSignature] = parts;

      // Verify signature
      const data = `${encodedHeader}.${encodedPayload}`;
      const expectedSignature = await this.signHmacSha256(data, this.config.secret);
      const expectedEncodedSignature = this.base64UrlEncode(expectedSignature);

      if (encodedSignature !== expectedEncodedSignature) {
        authLogger.warn('Token verification failed: invalid signature', {
          tokenPrefix: token.substring(0, 10) + '...',
        });
        return null;
      }

      // Decode payload
      const payload: TokenPayload = JSON.parse(this.base64UrlDecode(encodedPayload));

      // Check if token has been revoked
      if (payload.jti && isTokenRevoked(payload.jti)) {
        authLogger.warn('Token verification failed: token revoked', {
          jti: payload.jti,
          userId: payload.userId,
        });
        return null;
      }

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        authLogger.debug('Token verification failed: expired', {
          jti: payload.jti,
          userId: payload.userId,
          expiredAt: new Date(payload.exp * 1000).toISOString(),
        });
        return null;
      }

      return payload;
    } catch (error) {
      authLogger.warn('Token verification error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Extract JWT ID (jti) from token without verifying signature
   * Useful for token revocation lists
   */
  getJti(token: string): string | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload: TokenPayload = JSON.parse(this.base64UrlDecode(parts[1]));
      return payload.jti || null;
    } catch {
      return null;
    }
  }

  /**
   * Decode JWT payload without verifying signature
   * Useful for extracting metadata (like expiration) for revocation
   * WARNING: Do not use for authentication - only for metadata extraction
   */
  decodeUnsafe(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      return JSON.parse(this.base64UrlDecode(parts[1]));
    } catch {
      return null;
    }
  }

  // ==================== Private Helper Methods ====================

  /**
   * Sign data using HMAC-SHA256 (Web Crypto API)
   */
  private async signHmacSha256(data: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(data);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

    return this.arrayBufferToHex(signature);
  }

  /**
   * Convert ArrayBuffer to hex string
   */
  private arrayBufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Base64URL encode (URL-safe base64)
   */
  private base64UrlEncode(str: string): string {
    const base64 = btoa(str);
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Base64URL decode
   */
  private base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return atob(base64);
  }
}

/**
 * Create TokenService from environment configuration
 */
export function createTokenService(): TokenService {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;

  // Validate secret: must exist, not be empty, and have minimum length
  const MIN_SECRET_LENGTH = 32;

  // Check raw secret length BEFORE trim
  if (!secret || typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET or AUTH_SECRET environment variable is required (minimum ${MIN_SECRET_LENGTH} characters)`
    );
  }

  // Warn if secret is weak (all same character, common words, etc.)
  const trimmedSecret = secret.trim();
  if (/^([a-zA-Z0-9])\1+$/.test(trimmedSecret)) {
    console.warn(
      '[TokenService] WARNING: JWT_SECRET appears to be weak (repeated character). ' +
      'Use a strong, random secret key.'
    );
  }

  return new TokenService({
    secret: trimmedSecret,
    accessTokenTtlMinutes: parseInt(process.env.AUTH_ACCESS_TOKEN_TTL_MINUTES || '15', 10),
    issuer: process.env.AUTH_ISSUER || 'trpg-server',
  });
}
