// API layer: Authentication routes
// Handles user registration, login, logout
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/api/middleware/errorHandler.js';
// Request/Response schemas
const RegisterSchema = z.object({
    username: z.string().min(3).max(30),
    email: z.string().email(),
    password: z.string().min(8),
});
const LoginSchema = z.object({
    usernameOrEmail: z.string().min(1),
    password: z.string().min(1),
});
const ChangePasswordSchema = z.object({
    oldPassword: z.string(),
    newPassword: z.string().min(8),
});
// Create router factory (needs AuthService instance)
export function createAuthRouter(authService) {
    const router = Router();
    /**
     * POST /auth/register
     * Register a new user
     */
    router.post('/register', asyncHandler(async (req, res) => {
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
    }));
    /**
     * POST /auth/login
     * Login existing user
     */
    router.post('/login', asyncHandler(async (req, res) => {
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
    }));
    /**
     * POST /auth/logout
     * Logout current user
     */
    router.post('/logout', asyncHandler(async (req, res) => {
        const sessionId = req.cookies?.sessionId || req.headers.authorization?.slice(7);
        if (sessionId) {
            await authService.logout(sessionId);
        }
        // Clear cookie
        res.clearCookie('sessionId');
        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    }));
    /**
     * GET /auth/me
     * Get current user info
     */
    router.get('/me', asyncHandler(async (req, res) => {
        const sessionId = req.cookies?.sessionId || req.headers.authorization?.slice(7);
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
    }));
    /**
     * POST /auth/change-password
     * Change password (authenticated)
     */
    router.post('/change-password', asyncHandler(async (req, res) => {
        const sessionId = req.cookies?.sessionId || req.headers.authorization?.slice(7);
        if (!sessionId) {
            throw createError('Not authenticated', 401, 'AUTH_REQUIRED');
        }
        const user = await authService.validateSession(sessionId);
        if (!user) {
            res.clearCookie('sessionId');
            throw createError('Invalid or expired session', 401, 'INVALID_SESSION');
        }
        const { oldPassword, newPassword } = ChangePasswordSchema.parse(req.body);
        const success = await authService.changePassword(user.id, oldPassword, newPassword);
        if (!success) {
            throw createError('Failed to change password', 500, 'PASSWORD_CHANGE_FAILED');
        }
        res.json({
            success: true,
            message: 'Password changed successfully',
        });
    }));
    return router;
}
export default createAuthRouter;
