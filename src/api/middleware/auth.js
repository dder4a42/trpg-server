// API Middleware: Authentication
// Validates JWT/session tokens and protects routes
import { createError } from './errorHandler.js';
/**
 * Create authentication middleware
 */
export function createAuthMiddleware(config) {
    /**
     * Validate session token from header or cookie
     */
    async function validateSession(req, res, next) {
        try {
            // Get token from header or cookie
            const authHeader = req.headers.authorization;
            const sessionId = authHeader?.startsWith('Bearer ')
                ? authHeader.slice(7)
                : req.cookies?.sessionId;
            if (!sessionId) {
                throw createError('Authentication required', 401, 'AUTH_REQUIRED');
            }
            // Validate session and get user
            const user = await config.getUserBySession(sessionId);
            if (!user) {
                throw createError('Invalid or expired session', 401, 'INVALID_SESSION');
            }
            if (!user.isActive) {
                throw createError('Account is deactivated', 403, 'ACCOUNT_DEACTIVATED');
            }
            // Attach user to request
            req.user = user;
            req.sessionId = sessionId;
            next();
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * Optional authentication - sets user if logged in, but doesn't require it
     */
    async function optionalAuth(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            const sessionId = authHeader?.startsWith('Bearer ')
                ? authHeader.slice(7)
                : req.cookies?.sessionId;
            if (sessionId) {
                const user = await config.getUserBySession(sessionId);
                if (user && user.isActive) {
                    req.user = user;
                    req.sessionId = sessionId;
                }
            }
            next();
        }
        catch (error) {
            // Don't fail on optional auth errors
            next();
        }
    }
    return {
        validateSession,
        optionalAuth,
    };
}
/**
 * Check if a user is admin (based on ADMIN_USERNAME environment variable)
 */
export function isAdmin(user) {
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
    return !!user && !!ADMIN_USERNAME && user.username === ADMIN_USERNAME;
}
/**
 * Admin-only middleware
 */
export function adminOnly(req, res, next) {
    const user = req.user;
    if (!user) {
        next(createError('Authentication required', 401, 'AUTH_REQUIRED'));
        return;
    }
    if (!isAdmin(user)) {
        next(createError('Admin access required', 403, 'ADMIN_REQUIRED'));
        return;
    }
    next();
}
