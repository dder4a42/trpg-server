// API Middleware: Authentication Module
// Centralized authentication logic for both API and web routes

import type { Request, Response, NextFunction } from 'express';
import { createError } from './errorHandler.js';
import type { User } from '@/domain/user/types.js';
import type { AuthService } from '@/application/auth/AuthService.js';
import type { TokenService } from '@/application/auth/TokenService.js';

/**
 * Extract session ID from request (cookie or Authorization header)
 */
export function extractSessionId(req: Request): string | undefined {
  // Try Authorization header first (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Fall back to cookie
  return req.cookies?.sessionId;
}

/**
 * Authentication Module - provides both API and web auth helpers
 */
export class AuthModule {
  readonly authService: AuthService;
  readonly tokenService?: TokenService;

  constructor(
    authService: AuthService,
    tokenService?: TokenService,
    private readonly options: {
      webLoginPath?: string;
    } = {}
  ) {
    this.authService = authService;
    this.tokenService = tokenService;
  }

  /**
   * Validate session and return user (internal method)
   */
  private async validateSessionAndGetUser(sessionId: string): Promise<User> {
    const user = await this.authService.validateSession(sessionId);

    if (!user) {
      throw createError(
        'Invalid or expired session',
        401,
        'INVALID_SESSION'
      );
    }

    if (!user.isActive) {
      throw createError(
        'Account is deactivated',
        403,
        'ACCOUNT_DEACTIVATED'
      );
    }

    return user;
  }

  /**
   * Attach user to request (internal method)
   */
  private attachUserToRequest(req: Request, user: User, sessionId: string): void {
    req.user = user;
    req.sessionId = sessionId;
  }

  // ==================== API Middleware ====================

  /**
   * API middleware: Validate session and return JSON error on failure
   * Use this for REST API endpoints
   */
  validateSession = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const sessionId = extractSessionId(req);

      if (!sessionId) {
        throw createError(
          'Authentication required',
          401,
          'AUTH_REQUIRED'
        );
      }

      const user = await this.validateSessionAndGetUser(sessionId);
      this.attachUserToRequest(req, user, sessionId);

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Optional authentication - sets user if logged in, but doesn't require it
   * Use this for endpoints that work for both authenticated and anonymous users
   */
  optionalAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const sessionId = extractSessionId(req);

      if (sessionId) {
        const user = await this.authService.validateSession(sessionId);
        if (user && user.isActive) {
          this.attachUserToRequest(req, user, sessionId);
        }
      }

      next();
    } catch {
      // Don't fail on optional auth errors
      next();
    }
  };

  // ==================== Web Route Middleware ====================

  /**
   * Web middleware: Validate session and redirect on failure
   * Use this for HTML page routes
   */
  requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const sessionId = extractSessionId(req);

    if (!sessionId) {
      return res.redirect(this.options.webLoginPath ?? '/login');
    }

    try {
      const user = await this.validateSessionAndGetUser(sessionId);
      this.attachUserToRequest(req, user, sessionId);
      next();
    } catch {
      // Clear invalid session cookie and redirect
      res.clearCookie('sessionId');
      res.redirect(this.options.webLoginPath ?? '/login');
    }
  };

  // ==================== Utilities ====================

  /**
   * Check if a user is admin
   */
  isAdmin(user: User | undefined): boolean {
    return !!user && !!user.isAdmin;
  }

  /**
   * Admin-only middleware (for both API and web routes)
   * Must be used AFTER validateSession or requireAuth
   */
  adminOnly = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const user = req.user as User | undefined;

    if (!user) {
      if (req.headers.accept?.includes('application/json')) {
        next(createError('Authentication required', 401, 'AUTH_REQUIRED'));
      } else {
        res.redirect(this.options.webLoginPath ?? '/login');
      }
      return;
    }

    if (!this.isAdmin(user)) {
      if (req.headers.accept?.includes('application/json')) {
        next(createError('Admin access required', 403, 'ADMIN_REQUIRED'));
      } else {
        res.status(403).send('Admin access required');
      }
      return;
    }

    next();
  };
}

/**
 * Factory function to create AuthModule
 */
export function createAuthModule(
  authService: AuthService,
  tokenService?: TokenService,
  options?: { webLoginPath?: string }
): AuthModule {
  return new AuthModule(authService, tokenService, options);
}
