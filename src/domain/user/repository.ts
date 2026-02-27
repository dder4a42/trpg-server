// Domain: User repository interface
// Defines the contract for user data persistence

import type { User, UserSession, LoginCredentials, RegistrationData } from './types.js';

/**
 * Repository interface for User persistence
 * Implemented by infrastructure layer (LowDB, SQL, etc.)
 */
export interface IUserRepository {
  // User CRUD operations
  create(data: RegistrationData & { passwordHash: string }): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsernameOrEmail(usernameOrEmail: string): Promise<User | null>;
  update(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<boolean>;
  delete(id: string): Promise<boolean>;

  // Account status
  activate(id: string): Promise<boolean>;
  deactivate(id: string): Promise<boolean>;

  // Validation helpers
  usernameExists(username: string): Promise<boolean>;
  emailExists(email: string): Promise<boolean>;

  // Statistics
  count(): Promise<number>;
  countActive(): Promise<number>;
}

/**
 * Repository interface for UserSession persistence
 */
export interface IUserSessionRepository {
  create(session: Omit<UserSession, 'id'> & { id?: string }): Promise<UserSession>;
  findById(sessionId: string): Promise<UserSession | null>;
  findByUserId(userId: string): Promise<UserSession[]>;
  delete(sessionId: string): Promise<boolean>;
  deleteByUserId(userId: string): Promise<number>; // Returns count deleted
  deleteExpired(): Promise<number>; // Returns count deleted
  isValid(sessionId: string): Promise<boolean>;
}

/**
 * Authentication service interface
 */
export interface IAuthService {
  // Registration
  register(data: RegistrationData): Promise<{ user: User; session: UserSession }>;

  // Login
  login(credentials: LoginCredentials, metadata?: { ip?: string; userAgent?: string }): Promise<{ user: User; session: UserSession }>;

  // Logout
  logout(sessionId: string): Promise<boolean>;

  // Session validation
  validateSession(sessionId: string): Promise<User | null>;

  // Password management
  changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean>;
  resetPasswordRequest(email: string): Promise<void>; // Sends email
  resetPassword(token: string, newPassword: string): Promise<boolean>;
}
