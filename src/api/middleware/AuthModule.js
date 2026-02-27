// API Middleware: Authentication Module
// Centralized authentication logic for both API and web routes
import { createError } from './errorHandler.js';
/**
 * Extract session ID from request (cookie or Authorization header)
 */
export function extractSessionId(req) {
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
    authService;
    options;
    constructor(authService, options = {}) {
        this.authService = authService;
        this.options = options;
    }
    /**
     * Validate session and return user (internal method)
     */
    async validateSessionAndGetUser(sessionId) {
        const user = await this.authService.validateSession(sessionId);
        if (!user) {
            throw createError('Invalid or expired session', 401, 'INVALID_SESSION');
        }
        if (!user.isActive) {
            throw createError('Account is deactivated', 403, 'ACCOUNT_DEACTIVATED');
        }
        return user;
    }
    /**
     * Attach user to request (internal method)
     */
    attachUserToRequest(req, user, sessionId) {
        req.user = user;
        req.sessionId = sessionId;
    }
    // ==================== API Middleware ====================
    /**
     * API middleware: Validate session and return JSON error on failure
     * Use this for REST API endpoints
     */
    validateSession = async (req, res, next) => {
        try {
            const sessionId = extractSessionId(req);
            if (!sessionId) {
                throw createError('Authentication required', 401, 'AUTH_REQUIRED');
            }
            const user = await this.validateSessionAndGetUser(sessionId);
            this.attachUserToRequest(req, user, sessionId);
            next();
        }
        catch (error) {
            next(error);
        }
    };
    /**
     * Optional authentication - sets user if logged in, but doesn't require it
     * Use this for endpoints that work for both authenticated and anonymous users
     */
    optionalAuth = async (req, res, next) => {
        try {
            const sessionId = extractSessionId(req);
            if (sessionId) {
                const user = await this.authService.validateSession(sessionId);
                if (user && user.isActive) {
                    this.attachUserToRequest(req, user, sessionId);
                }
            }
            next();
        }
        catch {
            // Don't fail on optional auth errors
            next();
        }
    };
    // ==================== Web Route Middleware ====================
    /**
     * Web middleware: Validate session and redirect on failure
     * Use this for HTML page routes
     */
    requireAuth = async (req, res, next) => {
        const sessionId = extractSessionId(req);
        if (!sessionId) {
            return res.redirect(this.options.webLoginPath ?? '/login');
        }
        try {
            const user = await this.validateSessionAndGetUser(sessionId);
            this.attachUserToRequest(req, user, sessionId);
            next();
        }
        catch {
            // Clear invalid session cookie and redirect
            res.clearCookie('sessionId');
            res.redirect(this.options.webLoginPath ?? '/login');
        }
    };
    // ==================== Utilities ====================
    /**
     * Check if a user is admin (based on ADMIN_USERNAME environment variable)
     */
    isAdmin(user) {
        const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
        return !!user && !!ADMIN_USERNAME && user.username === ADMIN_USERNAME;
    }
    /**
     * Admin-only middleware (for both API and web routes)
     * Must be used AFTER validateSession or requireAuth
     */
    adminOnly = (req, res, next) => {
        const user = req.user;
        if (!user) {
            if (req.headers.accept?.includes('application/json')) {
                next(createError('Authentication required', 401, 'AUTH_REQUIRED'));
            }
            else {
                res.redirect(this.options.webLoginPath ?? '/login');
            }
            return;
        }
        if (!this.isAdmin(user)) {
            if (req.headers.accept?.includes('application/json')) {
                next(createError('Admin access required', 403, 'ADMIN_REQUIRED'));
            }
            else {
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
export function createAuthModule(authService, options) {
    return new AuthModule(authService, options);
}
