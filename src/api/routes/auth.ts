// API layer: Authentication routes
// Handles user registration, login, logout

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/api/middleware/errorHandler.js';
import { createRateLimitMiddleware, RateLimitPresets } from '@/api/middleware/rateLimiter.js';
import type { AuthService } from '@/application/auth/AuthService.js';
import type { TokenService } from '@/application/auth/TokenService.js';
import type { LoginCredentials, RegistrationData } from '@/domain/user/types.js';
import { revokeToken } from '@/utils/tokenRevocationList.js';
import { authMetrics } from '@/utils/auth-logger.js';

// Helper function to extract Bearer token from Authorization header
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  if (!token) {
    return null; // Empty token after "Bearer "
  }
  return token;
}

// Helper function to get session ID from cookie or Bearer token
function getSessionId(req: Request): string | null {
  // Check cookie first
  if (req.cookies?.sessionId) {
    return req.cookies.sessionId;
  }
  // Fall back to Authorization header
  return extractBearerToken(req.headers.authorization);
}

// Request/Response schemas
const RegisterSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(8),
}) as unknown as z.ZodType<RegistrationData>;

const LoginSchema = z.object({
  usernameOrEmail: z.string().min(1),
  password: z.string().min(1),
}) as unknown as z.ZodType<LoginCredentials>;

const ChangePasswordSchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string().min(8),
});

// Create router factory (needs AuthService and TokenService instances)
export function createAuthRouter(authService: AuthService, tokenService?: TokenService): Router {
  const router = Router();

  /**
   * POST /auth/register
   * Register a new user
   */
  router.post(
    '/register',
    createRateLimitMiddleware(RateLimitPresets.register),
    asyncHandler(async (req: Request, res: Response) => {
      const data = RegisterSchema.parse(req.body);

      const { user, session } = await authService.register(data);

      // Set session cookie
      res.cookie('sessionId', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      res.status(201).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          createdAt: user.createdAt,
        },
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
        },
      });
    })
  );

  /**
   * POST /auth/login
   * Login existing user
   */
  router.post(
    '/login',
    createRateLimitMiddleware(RateLimitPresets.login),
    asyncHandler(async (req: Request, res: Response) => {
      const data = LoginSchema.parse(req.body);

      const { user, session } = await authService.login(data, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // Set session cookie
      res.cookie('sessionId', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          createdAt: user.createdAt,
        },
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
        },
      });
    })
  );

  /**
   * POST /auth/logout
   * Logout current user
   */
  router.post(
    '/logout',
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = getSessionId(req);

      if (sessionId) {
        await authService.logout(sessionId);
      }

      // Revoke JWT access token if using Bearer token
      const bearerToken = extractBearerToken(req.headers.authorization);
      if (bearerToken && tokenService) {
        const jti = tokenService.getJti(bearerToken);
        if (jti) {
          // Decode without verification to get expiration for revocation list
          // This avoids race condition where token expires between verify() and revokeToken()
          const payload = tokenService.decodeUnsafe(bearerToken);
          if (payload?.exp) {
            const expiresAt = new Date(payload.exp * 1000);
            revokeToken(jti, expiresAt, 'logout');
          }
        }
      }

      // Clear cookies
      res.clearCookie('sessionId');
      res.clearCookie('refreshToken');

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    })
  );

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token from cookie
   */
  router.post(
    '/refresh',
    createRateLimitMiddleware(RateLimitPresets.refresh),
    asyncHandler(async (req: Request, res: Response) => {
      const refreshToken = req.cookies?.refreshToken;

      if (!refreshToken) {
        throw createError('Refresh token not found', 401, 'REFRESH_TOKEN_MISSING');
      }

      const result = await authService.refreshTokens(refreshToken);

      if (!result) {
        res.clearCookie('refreshToken');
        throw createError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
      }

      // Set new refresh token cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: result.refreshExpiresIn * 1000,
        path: '/',
      });

      res.json({
        success: true,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
        },
      });
    })
  );

  /**
   * POST /auth/logout-all
   * Logout from all devices (requires authentication)
   */
  router.post(
    '/logout-all',
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = getSessionId(req);

      if (!sessionId) {
        throw createError('Not authenticated', 401, 'AUTH_REQUIRED');
      }

      const user = await authService.validateSession(sessionId);

      if (!user) {
        res.clearCookie('sessionId');
        throw createError('Invalid or expired session', 401, 'INVALID_SESSION');
      }

      // Logout from session-based auth
      await authService.logout(sessionId);

      // Logout from all token-based sessions
      if ('logoutAllWithTokens' in authService) {
        await (authService as any).logoutAllWithTokens(user.id);
      }

      // Revoke current JWT access token if using Bearer token
      const bearerToken = extractBearerToken(req.headers.authorization);
      if (bearerToken && tokenService) {
        const jti = tokenService.getJti(bearerToken);
        if (jti) {
          // Decode without verification to get expiration for revocation list
          const payload = tokenService.decodeUnsafe(bearerToken);
          if (payload?.exp) {
            const expiresAt = new Date(payload.exp * 1000);
            revokeToken(jti, expiresAt, 'logout_all');
          }
        }
      }

      // Clear cookies
      res.clearCookie('sessionId');
      res.clearCookie('refreshToken');

      res.json({
        success: true,
        message: 'Logged out from all devices',
      });
    })
  );

  /**
   * GET /auth/sessions
   * List user's active sessions
   */
  router.get(
    '/sessions',
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = getSessionId(req);

      if (!sessionId) {
        throw createError('Not authenticated', 401, 'AUTH_REQUIRED');
      }

      const user = await authService.validateSession(sessionId);

      if (!user) {
        res.clearCookie('sessionId');
        throw createError('Invalid or expired session', 401, 'INVALID_SESSION');
      }

      // Get user's sessions from repository
      const sessions = await authService.getUserSessions?.(user.id) || [];

      // Mark current session
      const sessionsWithCurrent = sessions.map(s => ({
        ...s,
        isCurrent: s.id === sessionId,
      }));

      res.json({
        success: true,
        sessions: sessionsWithCurrent,
      });
    })
  );

  /**
   * DELETE /auth/sessions/:sessionId
   * Revoke a specific session
   */
  router.delete(
    '/sessions/:sessionId',
    asyncHandler(async (req: Request, res: Response) => {
      const currentSessionId = getSessionId(req);

      if (!currentSessionId) {
        throw createError('Not authenticated', 401, 'AUTH_REQUIRED');
      }

      const user = await authService.validateSession(currentSessionId);

      if (!user) {
        res.clearCookie('sessionId');
        throw createError('Invalid or expired session', 401, 'INVALID_SESSION');
      }

      const { sessionId } = req.params;

      // Don't allow deleting current session
      if (sessionId === currentSessionId) {
        throw createError('Cannot delete current session. Use logout instead.', 400, 'CANNOT_DELETE_CURRENT_SESSION');
      }

      // Verify the session belongs to the user
      const sessionUser = await authService.validateSession(sessionId);
      if (!sessionUser || sessionUser.id !== user.id) {
        throw createError('Session not found', 404, 'SESSION_NOT_FOUND');
      }

      // Delete the session
      const success = await authService.logout(sessionId);

      if (!success) {
        throw createError('Failed to revoke session', 500, 'SESSION_REVOKE_FAILED');
      }

      res.json({
        success: true,
        message: 'Session revoked successfully',
      });
    })
  );

  /**
   * GET /auth/me
   * Get current user info
   */
  router.get(
    '/me',
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = getSessionId(req);

      if (!sessionId) {
        throw createError('Not authenticated', 401, 'AUTH_REQUIRED');
      }

      const user = await authService.validateSession(sessionId);

      if (!user) {
        res.clearCookie('sessionId');
        throw createError('Invalid or expired session', 401, 'INVALID_SESSION');
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          createdAt: user.createdAt,
        },
      });
    })
  );

  /**
   * POST /auth/change-password
   * Change password (authenticated)
   */
  router.post(
    '/change-password',
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = getSessionId(req);

      if (!sessionId) {
        throw createError('Not authenticated', 401, 'AUTH_REQUIRED');
      }

      const user = await authService.validateSession(sessionId);

      if (!user) {
        res.clearCookie('sessionId');
        throw createError('Invalid or expired session', 401, 'INVALID_SESSION');
      }

      const { oldPassword, newPassword } = ChangePasswordSchema.parse(req.body);

      const success = await authService.changePassword(
        user.id,
        oldPassword,
        newPassword
      );

      if (!success) {
        throw createError('Failed to change password', 500, 'PASSWORD_CHANGE_FAILED');
      }

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    })
  );

  /**
   * GET /auth/metrics
   * Get authentication and session metrics (admin only)
   */
  router.get(
    '/metrics',
    createRateLimitMiddleware(RateLimitPresets.metrics),
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = getSessionId(req);

      if (!sessionId) {
        throw createError('Not authenticated', 401, 'AUTH_REQUIRED');
      }

      const user = await authService.validateSession(sessionId);

      if (!user) {
        res.clearCookie('sessionId');
        throw createError('Invalid or expired session', 401, 'INVALID_SESSION');
      }

      // Check if user is admin
      const isAdmin = user.username === (process.env.ADMIN_USERNAME || 'admin');
      if (!isAdmin) {
        throw createError('Admin access required', 403, 'ADMIN_REQUIRED');
      }

      // Get metrics
      const metrics = authMetrics.getAll();
      const activeSessions = metrics.gauges['auth.sessions.active'] || 0;

      // Calculate derived metrics
      const totalLogins = (metrics.counters['auth.login.success'] || 0) +
                          (metrics.counters['auth.login.failure'] || 0);
      const successRate = totalLogins > 0
        ? ((metrics.counters['auth.login.success'] || 0) / totalLogins * 100).toFixed(2)
        : '0.00';

      const totalRegistrations = (metrics.counters['auth.register.success'] || 0) +
                                 (metrics.counters['auth.register.failure'] || 0);
      const registrationSuccessRate = totalRegistrations > 0
        ? ((metrics.counters['auth.register.success'] || 0) / totalRegistrations * 100).toFixed(2)
        : '0.00';

      res.json({
        success: true,
        metrics: {
          // Sessions
          activeSessions,
          sessionsCreated: metrics.counters['auth.session.created'] || 0,
          sessionsValidated: metrics.counters['auth.session.validated'] || 0,
          sessionsExpired: metrics.counters['auth.session.expired'] || 0,
          sessionsRefreshed: metrics.counters['auth.session.refreshed'] || 0,
          sessionsDeleted: metrics.counters['auth.session.deleted'] || 0,

          // Authentication
          loginSuccess: metrics.counters['auth.login.success'] || 0,
          loginFailure: metrics.counters['auth.login.failure'] || 0,
          loginSuccessRate: `${successRate}%`,
          registerSuccess: metrics.counters['auth.register.success'] || 0,
          registerFailure: metrics.counters['auth.register.failure'] || 0,
          registerSuccessRate: `${registrationSuccessRate}%`,
          logouts: metrics.counters['auth.logout'] || 0,

          // Cleanup
          cleanupRuns: metrics.counters['auth.cleanup.run'] || 0,
          sessionsCleaned: metrics.counters['auth.cleanup.sessions_removed'] || 0,

          // Timestamps
          timestamp: new Date().toISOString(),
        },
      });
    })
  );

  return router;
}

export default createAuthRouter;
