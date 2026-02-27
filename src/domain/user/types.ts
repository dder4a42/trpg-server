// Domain: User types
// Pure TypeScript interfaces for user management

/**
 * User entity representing a player account
 */
export interface User {
  id: string;                    // UUID
  username: string;              // Display name
  email: string;                 // Email address
  passwordHash: string;          // bcrypt hash
  isActive: boolean;             // Account status
  createdAt: Date;
  lastLoginAt: Date | null;
}

/**
 * User session for authentication
 */
export interface UserSession {
  id: string;                    // Session token/UUID
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * User preferences
 */
export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  notifications: boolean;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  usernameOrEmail: string;
  password: string;
}

/**
 * Registration data
 */
export interface RegistrationData {
  username: string;
  email: string;
  password: string;
}

/**
 * Authenticated user (without sensitive data)
 */
export interface PublicUser {
  id: string;
  username: string;
  createdAt: Date;
}
