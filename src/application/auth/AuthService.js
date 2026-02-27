// Application: Authentication Service
// Handles user registration, login, logout, and session management
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
export class AuthService {
    userRepo;
    sessionRepo;
    config;
    constructor(userRepo, sessionRepo, config = { sessionTimeoutHours: 24, bcryptRounds: 10 }) {
        this.userRepo = userRepo;
        this.sessionRepo = sessionRepo;
        this.config = config;
    }
    /**
     * Register a new user
     */
    async register(data) {
        // Validate username uniqueness
        if (await this.userRepo.usernameExists(data.username)) {
            throw new AuthError('Username already exists', 'USERNAME_TAKEN');
        }
        // Validate email uniqueness
        if (data.email && (await this.userRepo.emailExists(data.email))) {
            throw new AuthError('Email already registered', 'EMAIL_TAKEN');
        }
        // Hash password
        const passwordHash = await bcrypt.hash(data.password, this.config.bcryptRounds);
        // Create user
        const user = await this.userRepo.create({
            ...data,
            passwordHash,
        });
        // Create session
        const session = await this.createSession(user.id);
        return { user, session };
    }
    /**
     * Login user
     */
    async login(credentials, metadata) {
        // Find user by username or email
        const user = await this.userRepo.findByUsernameOrEmail(credentials.usernameOrEmail);
        if (!user) {
            throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
        }
        // Check if account is active
        if (!user.isActive) {
            throw new AuthError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
        }
        // Verify password
        const isValidPassword = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValidPassword) {
            throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
        }
        // Create session
        const session = await this.createSession(user.id, metadata);
        return { user, session };
    }
    /**
     * Logout user (delete session)
     */
    async logout(sessionId) {
        return this.sessionRepo.delete(sessionId);
    }
    /**
     * Validate session and return user
     */
    async validateSession(sessionId) {
        // Check if session exists and is valid
        const isValid = await this.sessionRepo.isValid(sessionId);
        if (!isValid) {
            return null;
        }
        // Get session
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) {
            return null;
        }
        // Get user
        const user = await this.userRepo.findById(session.userId);
        if (!user || !user.isActive) {
            return null;
        }
        return user;
    }
    /**
     * Change password
     */
    async changePassword(userId, oldPassword, newPassword) {
        // Get user
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new AuthError('User not found', 'USER_NOT_FOUND');
        }
        // Verify old password
        const isValidOldPassword = await bcrypt.compare(oldPassword, user.passwordHash);
        if (!isValidOldPassword) {
            throw new AuthError('Invalid old password', 'INVALID_OLD_PASSWORD');
        }
        // Hash and update new password
        const newPasswordHash = await bcrypt.hash(newPassword, this.config.bcryptRounds);
        return this.userRepo.update(userId, { passwordHash: newPasswordHash });
    }
    /**
     * Reset password request (placeholder - would send email)
     */
    async resetPasswordRequest(email) {
        const user = await this.userRepo.findByEmail(email);
        if (!user) {
            // Don't reveal if email exists - silently return
            return;
        }
        // TODO: Generate reset token and send email
        console.log(`[Password Reset] Requested for user: ${user.username}`);
    }
    /**
     * Reset password with token (placeholder)
     */
    async resetPassword(token, newPassword) {
        // TODO: Validate token and update password
        console.log(`[Password Reset] Token validation not implemented`);
        return false;
    }
    // ==================== Private Helpers ====================
    async createSession(userId, metadata) {
        const session = {
            id: uuidv4(),
            userId,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + this.config.sessionTimeoutHours * 60 * 60 * 1000),
            ipAddress: metadata?.ip,
            userAgent: metadata?.userAgent,
        };
        return this.sessionRepo.create(session);
    }
}
// ==================== Error Classes ====================
export class AuthError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'AuthError';
    }
}
