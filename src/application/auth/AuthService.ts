// Application: Authentication Service
// Handles user registration, login, logout, and session management

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import type {
  User,
  UserSession,
  RegistrationData,
  LoginCredentials,
} from '@/domain/user/types.js';
import type {
  IUserRepository,
  IUserSessionRepository,
  IAuthService,
  ITokenService,
} from '@/domain/user/repository.js';
import type { TokenService } from './TokenService.js';
import type { RefreshTokenService } from './RefreshTokenService.js';
import { authLogger, authMetrics, AUTH_METRICS } from '@/utils/auth-logger.js';

export interface AuthServiceConfig {
  sessionTimeoutHours: number;
  sessionRefreshHours?: number;  // Refresh interval for sliding expiration (default: 1 hour)
  bcryptRounds: number;
  enableDualToken?: boolean;      // Enable JWT + refresh token flow (default: false for backward compatibility)
  maxLoginAttempts?: number;      // Max failed login attempts before lockout (default: 5)
  lockoutDurationMinutes?: number; // How long to lock account (default: 15 minutes)
}

export interface TokenAuthResult {
  user: User;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
}

export class AuthService implements IAuthService {
  private tokenService?: TokenService;
  private refreshTokenService?: RefreshTokenService;

  constructor(
    private userRepo: IUserRepository,
    private sessionRepo: IUserSessionRepository,
    private config: AuthServiceConfig = {
      sessionTimeoutHours: 24,
      sessionRefreshHours: 1,
      bcryptRounds: 10,
      enableDualToken: false,
      maxLoginAttempts: 5,
      lockoutDurationMinutes: 15,
    }
  ) {}

  /**
   * Set token service for JWT support (dependency injection)
   */
  setTokenService(tokenService: TokenService): void {
    this.tokenService = tokenService;
  }

  /**
   * Set refresh token service (dependency injection)
   */
  setRefreshTokenService(refreshTokenService: RefreshTokenService): void {
    this.refreshTokenService = refreshTokenService;
  }

  /**
   * Register a new user
   */
  async register(
    data: RegistrationData
  ): Promise<{ user: User; session: UserSession }> {
    try {
      // Validate username uniqueness
      if (await this.userRepo.usernameExists(data.username)) {
        authMetrics.increment(AUTH_METRICS.REGISTER_FAILURE);
        authLogger.warn('Registration failed: username taken', { username: data.username });
        throw new AuthError('Username already exists', 'USERNAME_TAKEN');
      }

      // Validate email uniqueness
      if (data.email && (await this.userRepo.emailExists(data.email))) {
        authMetrics.increment(AUTH_METRICS.REGISTER_FAILURE);
        authLogger.warn('Registration failed: email taken', { email: data.email });
        throw new AuthError('Email already registered', 'EMAIL_TAKEN');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(
        data.password,
        this.config.bcryptRounds
      );

      // Create user
      const user = await this.userRepo.create({
        ...data,
        passwordHash,
      });

      // Create session
      const session = await this.createSession(user.id);

      authMetrics.increment(AUTH_METRICS.REGISTER_SUCCESS);
      authMetrics.incrementGauge(AUTH_METRICS.ACTIVE_SESSIONS, 1);
      authMetrics.increment(AUTH_METRICS.SESSION_CREATED);
      authLogger.info('User registered', {
        userId: user.id,
        username: user.username,
        sessionId: session.id,
      });

      return { user, session };
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      authMetrics.increment(AUTH_METRICS.REGISTER_FAILURE);
      authLogger.error('Registration error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(
    credentials: LoginCredentials,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<{ user: User; session: UserSession }> {
    try {
      // Find user by username or email
      const user = await this.userRepo.findByUsernameOrEmail(
        credentials.usernameOrEmail
      );

      if (!user) {
        authMetrics.increment(AUTH_METRICS.LOGIN_FAILURE);
        authLogger.warn('Login failed: user not found', {
          usernameOrEmail: credentials.usernameOrEmail,
          ip: metadata?.ip,
        });
        throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
      }

      // Check if account is active
      if (!user.isActive) {
        authMetrics.increment(AUTH_METRICS.LOGIN_FAILURE);
        authLogger.warn('Login failed: account deactivated', {
          userId: user.id,
          username: user.username,
        });
        throw new AuthError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(
        credentials.password,
        user.passwordHash
      );

      if (!isValidPassword) {
        // Atomic increment failed attempts with lockout check
        const maxAttempts = this.config.maxLoginAttempts || 5;
        const lockDuration = this.config.lockoutDurationMinutes || 15;
        const result = await this.userRepo.incrementFailedAttemptsAtomic(
          user.id,
          maxAttempts,
          lockDuration
        );

        authMetrics.increment(AUTH_METRICS.LOGIN_FAILURE);
        authLogger.warn('Login failed: invalid password', {
          userId: user.id,
          username: user.username,
          ip: metadata?.ip,
          attempts: result.attempts,
          locked: result.locked,
        });

        if (result.locked) {
          authLogger.warn('Account locked due to too many failed attempts', {
            userId: user.id,
            username: user.username,
            attempts: result.attempts,
            lockedUntil: result.lockedUntil?.toISOString(),
          });

          const remainingMinutes = result.lockedUntil
            ? Math.ceil((result.lockedUntil.getTime() - Date.now()) / 60000)
            : 0;

          throw new AuthError(
            `Account locked for ${remainingMinutes} minutes due to too many failed login attempts`,
            'ACCOUNT_LOCKED'
          );
        }

        throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
      }

      // Reset failed attempts on successful login
      await this.userRepo.resetFailedAttempts(user.id);

      // Create session
      const session = await this.createSession(user.id, metadata);

      authMetrics.increment(AUTH_METRICS.LOGIN_SUCCESS);
      authMetrics.incrementGauge(AUTH_METRICS.ACTIVE_SESSIONS, 1);
      authMetrics.increment(AUTH_METRICS.SESSION_CREATED);
      authLogger.info('User logged in', {
        userId: user.id,
        username: user.username,
        sessionId: session.id,
        ip: metadata?.ip,
        userAgent: metadata?.userAgent,
      });

      return { user, session };
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      authMetrics.increment(AUTH_METRICS.LOGIN_FAILURE);
      authLogger.error('Login error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Logout user (delete session)
   */
  async logout(sessionId: string): Promise<boolean> {
    try {
      const result = this.sessionRepo.delete(sessionId);

      if (result) {
        authMetrics.increment(AUTH_METRICS.LOGOUT);
        authMetrics.incrementGauge(AUTH_METRICS.ACTIVE_SESSIONS, -1);
        authMetrics.increment(AUTH_METRICS.SESSION_DELETED);
        authLogger.info('User logged out', { sessionId });
      }

      return result;
    } catch (error) {
      authLogger.error('Logout error', { sessionId, error: String(error) });
      throw error;
    }
  }

  /**
   * Validate session and return user
   * Implements sliding expiration: refreshes session if it's older than refresh interval
   * Uses atomic update to prevent race conditions
   */
  async validateSession(sessionId: string): Promise<User | null> {
    try {
      // First check if session exists
      const session = await this.sessionRepo.findById(sessionId);
      if (!session) {
        authLogger.debug('Session validation failed: session not found', { sessionId });
        return null;
      }

      // Get user
      const user = await this.userRepo.findById(session.userId);
      if (!user || !user.isActive) {
        authLogger.debug('Session validation failed: user not found or inactive', {
          sessionId,
          userId: session.userId,
        });
        return null;
      }

      // Atomic extend session if needed (sliding expiration)
      if (this.config.sessionRefreshHours && this.config.sessionRefreshHours > 0) {
        const refreshThreshold = new Date(
          Date.now() - this.config.sessionRefreshHours * 60 * 60 * 1000
        );
        const result = await this.sessionRepo.extendSessionIfExpired(
          sessionId,
          refreshThreshold,
          this.config.sessionTimeoutHours
        );

        if (result.expired) {
          authMetrics.increment(AUTH_METRICS.SESSION_EXPIRED);
          authMetrics.incrementGauge(AUTH_METRICS.ACTIVE_SESSIONS, -1);
          authLogger.debug('Session validation failed: session expired during atomic check', {
            sessionId,
            userId: session.userId,
            expiredAt: session.expiresAt.toISOString(),
          });
          return null;
        }

        if (result.extended) {
          authMetrics.increment(AUTH_METRICS.SESSION_REFRESHED);
          authLogger.debug('Session refreshed atomically', {
            sessionId,
            userId: session.userId,
          });
        }
      }

      authMetrics.increment(AUTH_METRICS.SESSION_VALIDATED);
      return user;
    } catch (error) {
      authLogger.error('Session validation error', { sessionId, error: String(error) });
      return null;
    }
  }

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<boolean> {
    // Get user
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AuthError('User not found', 'USER_NOT_FOUND');
    }

    // Verify old password
    const isValidOldPassword = await bcrypt.compare(
      oldPassword,
      user.passwordHash
    );
    if (!isValidOldPassword) {
      throw new AuthError('Invalid old password', 'INVALID_OLD_PASSWORD');
    }

    // Hash and update new password
    const newPasswordHash = await bcrypt.hash(
      newPassword,
      this.config.bcryptRounds
    );

    return this.userRepo.update(userId, { passwordHash: newPasswordHash });
  }

  /**
   * Reset password request (placeholder - would send email)
   */
  async resetPasswordRequest(email: string): Promise<void> {
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
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    // TODO: Validate token and update password
    console.log(`[Password Reset] Token validation not implemented`);
    return false;
  }

  // ==================== Token-Based Auth Methods (Dual-Token Flow) ====================

  /**
   * Login with tokens (returns JWT + refresh token)
   * Use this for API authentication with cookies
   */
  async loginWithTokens(
    credentials: LoginCredentials,
    metadata?: { ip?: string; userAgent?: string },
    rememberMe = false
  ): Promise<TokenAuthResult> {
    if (!this.tokenService || !this.refreshTokenService) {
      throw new AuthError('Token services not configured', 'TOKEN_SERVICE_NOT_AVAILABLE');
    }

    // First authenticate using standard login
    const { user } = await this.login(credentials, metadata);

    // Generate access token
    const { accessToken, expiresIn } = await this.tokenService.sign(user);

    // Generate refresh token
    const refreshToken = await this.refreshTokenService.create(user.id, rememberMe);
    const refreshExpiresIn = rememberMe
      ? 7 * 24 * 60 * 60  // 7 days in seconds
      : 24 * 60 * 60;     // 24 hours in seconds

    authLogger.info('User logged in with tokens', {
      userId: user.id,
      username: user.username,
      rememberMe,
    });

    return {
      user,
      accessToken,
      expiresIn,
      refreshToken,
      refreshExpiresIn,
    };
  }

  /**
   * Register with tokens (returns JWT + refresh token)
   */
  async registerWithTokens(
    data: RegistrationData,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<TokenAuthResult> {
    if (!this.tokenService || !this.refreshTokenService) {
      throw new AuthError('Token services not configured', 'TOKEN_SERVICE_NOT_AVAILABLE');
    }

    // First register using standard flow
    const { user } = await this.register(data);

    // Generate access token
    const { accessToken, expiresIn } = await this.tokenService.sign(user);

    // Generate refresh token
    const refreshToken = await this.refreshTokenService.create(user.id, false);
    const refreshExpiresIn = 24 * 60 * 60;  // 24 hours in seconds

    authLogger.info('User registered with tokens', {
      userId: user.id,
      username: user.username,
    });

    return {
      user,
      accessToken,
      expiresIn,
      refreshToken,
      refreshExpiresIn,
    };
  }

  /**
   * Validate access token and return user
   */
  async validateAccessToken(accessToken: string): Promise<User | null> {
    if (!this.tokenService) {
      throw new AuthError('Token service not configured', 'TOKEN_SERVICE_NOT_AVAILABLE');
    }

    const payload = await this.tokenService.verify(accessToken);
    if (!payload) {
      authMetrics.increment(AUTH_METRICS.SESSION_EXPIRED);
      return null;
    }

    const user = await this.userRepo.findById(payload.userId);
    if (!user || !user.isActive) {
      return null;
    }

    authMetrics.increment(AUTH_METRICS.SESSION_VALIDATED);
    return user;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<TokenAuthResult | null> {
    if (!this.tokenService || !this.refreshTokenService) {
      throw new AuthError('Token services not configured', 'TOKEN_SERVICE_NOT_AVAILABLE');
    }

    const result = await this.refreshTokenService.rotate(refreshToken);
    if (!result) {
      authMetrics.increment(AUTH_METRICS.SESSION_EXPIRED);
      return null;
    }

    // Validate and get user from new access token
    const payload = await this.tokenService.verify(result.accessToken);
    if (!payload) {
      return null;
    }

    const user = await this.userRepo.findById(payload.userId);
    if (!user || !user.isActive) {
      return null;
    }

    authMetrics.increment(AUTH_METRICS.SESSION_REFRESHED);
    authLogger.info('Tokens refreshed', {
      userId: user.id,
      username: user.username,
    });

    return {
      user,
      ...result,
    };
  }

  /**
   * Logout by revoking refresh token
   */
  async logoutWithToken(refreshToken: string): Promise<boolean> {
    if (!this.refreshTokenService) {
      throw new AuthError('Refresh token service not configured', 'TOKEN_SERVICE_NOT_AVAILABLE');
    }

    const result = await this.refreshTokenService.revoke(refreshToken);

    if (result) {
      authMetrics.increment(AUTH_METRICS.LOGOUT);
      authMetrics.incrementGauge(AUTH_METRICS.ACTIVE_SESSIONS, -1);
      authLogger.info('User logged out (token)', { refreshToken });
    }

    return result;
  }

  /**
   * Logout from all devices by revoking all refresh tokens
   */
  async logoutAllWithTokens(userId: string): Promise<number> {
    if (!this.refreshTokenService) {
      throw new AuthError('Refresh token service not configured', 'TOKEN_SERVICE_NOT_AVAILABLE');
    }

    const count = await this.refreshTokenService.revokeAllForUser(userId);

    authMetrics.increment(AUTH_METRICS.LOGOUT);
    authLogger.info('User logged out from all devices', { userId, count });

    return count;
  }

  /**
   * Get user's active sessions
   * Returns list of sessions with device info
   */
  async getUserSessions(userId: string): Promise<Array<{
    id: string;
    deviceName: string;
    ipAddress: string | undefined;
    lastActivity: Date;
    expiresAt: Date;
    isCurrent: boolean;
  }>> {
    // Get all sessions for user from repository
    const sessions = await this.sessionRepo.findByUserId(userId);
    const now = Date.now();

    return sessions
      .filter(session => session.expiresAt > new Date(now)) // Only active sessions
      .map(session => {
        // Generate device name from user agent
        const deviceName = this.generateDeviceName(session.userAgent);

        return {
          id: session.id,
          deviceName,
          ipAddress: session.ipAddress,
          lastActivity: session.lastActivityAt,
          expiresAt: session.expiresAt,
          isCurrent: false, // Will be set by caller
        };
      })
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  /**
   * Generate a user-friendly device name from user agent string
   */
  private generateDeviceName(userAgent?: string): string {
    if (!userAgent) {
      return 'Unknown Device';
    }

    // Simple user agent parsing
    const ua = userAgent.toLowerCase();

    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      if (ua.includes('iphone')) return 'iPhone';
      if (ua.includes('ipad')) return 'iPad';
      if (ua.includes('android')) return 'Android';
      return 'Mobile Device';
    }

    if (ua.includes('chrome')) return 'Chrome';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
    if (ua.includes('edge')) return 'Edge';

    return 'Desktop Browser';
  }

  // ==================== Private Helpers ====================

  private async createSession(
    userId: string,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<UserSession> {
    const now = new Date();
    const deviceName = this.generateDeviceName(metadata?.userAgent);
    const deviceFingerprint = await this.generateDeviceFingerprint(metadata?.userAgent, metadata?.ip);

    const session: UserSession = {
      id: uuidv4(),
      userId,
      createdAt: now,
      expiresAt: new Date(
        Date.now() + this.config.sessionTimeoutHours * 60 * 60 * 1000
      ),
      lastActivityAt: now,  // Initialize lastActivityAt
      ipAddress: metadata?.ip,
      userAgent: metadata?.userAgent,
      deviceName,
      deviceFingerprint,
    };

    return this.sessionRepo.create(session);
  }

  /**
   * Generate a device fingerprint from user agent and IP
   * Uses SHA-256 for cryptographic-quality fingerprinting
   * Returns first 16 hex characters (64 bits) for practical uniqueness
   */
  private async generateDeviceFingerprint(userAgent?: string, ip?: string): Promise<string | undefined> {
    if (!userAgent && !ip) return undefined;

    // Create a fingerprint by hashing the combination with SHA-256
    const combined = `${userAgent || ''}-${ip || ''}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);

    // Use Web Crypto API for SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    // Return first 16 hex characters (64 bits) - sufficient for device tracking
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }
}

// ==================== Error Classes ====================

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
