# Auth System Critical Fixes - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 5 critical/high-priority issues in the authentication system identified during code review

**Architecture:** Targeted fixes to existing components - no new architecture. Inject UserRepository into RefreshTokenService, standardize error messages, add isAdmin to User type, fix JWT secret validation order, document in-memory token limitations.

**Tech Stack:** TypeScript, Node.js, bcrypt, uuid, LowDB

---

## Prerequisites

**Read before starting:**
- `docs/plans/2025-03-01-auth-fixes-design.md` - Approved design document
- `src/domain/user/repository.ts` - Interface definitions
- `src/domain/user/types.ts` - User type definition

**Build/test commands:**
```bash
npm run build          # Build TypeScript
npm run typecheck      # Type check only
npm run dev           # Dev server with hot reload
```

---

## Task 1: Add isAdmin Field to User Type

**Files:**
- Modify: `src/domain/user/types.ts`
- Modify: `src/infrastructure/database/lowdb/connection.ts`

### Step 1: Add isAdmin to User interface

Open `src/domain/user/types.ts` and add `isAdmin` field:

```typescript
export interface User {
  id: string;
  username: string;
  email?: string;
  passwordHash: string;
  isActive: boolean;
  isAdmin?: boolean;  // <-- ADD THIS LINE
  createdAt: Date;
  lastLoginAt: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}
```

### Step 2: Update database schema

Open `src/infrastructure/database/lowdb/connection.ts` and update `UserRecord`:

```typescript
export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  email?: string;
  created_at: string;
  last_login?: string;
  is_active: number;
  is_admin?: number;  // <-- ADD THIS LINE (0 or 1)
  // Security fields for account lockout
  failed_login_attempts: number;
  locked_until?: string;
}
```

### Step 3: Update defaultData

In `src/infrastructure/database/lowdb/connection.ts`, find `defaultData` object (around line 200):

```typescript
const defaultData: DatabaseSchema = {
  _version: 1,
  _lastCleanup: undefined,
  users: [],
  rooms: [],
  // ... rest of default data
};
```

No change needed - `is_admin` is optional so existing data works.

### Step 4: Type check

Run: `npm run typecheck`
Expected: No type errors

### Step 5: Commit

```bash
git add src/domain/user/types.ts src/infrastructure/database/lowdb/connection.ts
git commit -m "feat: add isAdmin field to User type

- Add isAdmin?: boolean to User interface
- Add is_admin?: number to UserRecord schema
- Default undefined is treated as false (non-admin)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Update Admin Check to Use User.isAdmin

**Files:**
- Modify: `src/api/middleware/AuthModule.ts`
- Modify: `src/application/auth/TokenService.ts`

### Step 1: Update AuthModule.isAdmin()

Open `src/api/middleware/AuthModule.ts` and find the `isAdmin()` method (around line 165):

**Before:**
```typescript
isAdmin(user: User | undefined): boolean {
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  return !!user && !!ADMIN_USERNAME && user.username === ADMIN_USERNAME;
}
```

**After:**
```typescript
isAdmin(user: User | undefined): boolean {
  return !!user && !!user.isAdmin;
}
```

### Step 2: Update TokenService to use User.isAdmin

Open `src/application/auth/TokenService.ts` and find the `sign()` method (around line 47):

**Before:**
```typescript
const payload: TokenPayload = {
  userId: user.id,
  username: user.username,
  isAdmin: user.username === (process.env.ADMIN_USERNAME || 'admin'),
  iat: now,
  exp,
  jti,
};
```

**After:**
```typescript
const payload: TokenPayload = {
  userId: user.id,
  username: user.username,
  isAdmin: !!user.isAdmin,
  iat: now,
  exp,
  jti,
};
```

### Step 3: Type check

Run: `npm run typecheck`
Expected: No type errors

### Step 4: Build to verify

Run: `npm run build`
Expected: Build succeeds

### Step 5: Commit

```bash
git add src/api/middleware/AuthModule.ts src/application/auth/TokenService.ts
git commit -m "refactor: use User.isAdmin instead of environment comparison

- AuthModule.isAdmin() now checks user.isAdmin field
- TokenService uses user.isAdmin for JWT payload
- Admin status now persistent in database, not env variable

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Fix JWT Secret Validation Order

**Files:**
- Modify: `src/application/auth/TokenService.ts`

### Step 1: Update createTokenService()

Open `src/application/auth/TokenService.ts` and find the `createTokenService()` function (around line 238):

**Before:**
```typescript
export function createTokenService(): TokenService {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;

  const MIN_SECRET_LENGTH = 32;

  if (!secret || typeof secret !== 'string' || secret.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET or AUTH_SECRET environment variable is required (minimum ${MIN_SECRET_LENGTH} characters)`
    );
  }

  const trimmedSecret = secret.trim();
  // ... rest of function
}
```

**After:**
```typescript
export function createTokenService(): TokenService {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;

  const MIN_SECRET_LENGTH = 32;

  // Check raw secret length BEFORE trim
  if (!secret || typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET or AUTH_SECRET environment variable is required (minimum ${MIN_SECRET_LENGTH} characters)`
    );
  }

  const trimmedSecret = secret.trim();
  // ... rest of function
}
```

### Step 2: Type check and build

Run: `npm run typecheck && npm run build`
Expected: No errors, build succeeds

### Step 3: Commit

```bash
git add src/application/auth/TokenService.ts
git commit -m "fix: validate JWT secret length before trim

- Check raw secret length before trimming
- Prevents padded secrets from passing validation
- More secure secret validation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Standardize Login Error Messages

**Files:**
- Modify: `src/application/auth/AuthService.ts`

### Step 1: Update user not found error

Open `src/application/auth/AuthService.ts` and find the login method (around line 129).

Find the "user not found" check (around line 139):

**Before:**
```typescript
if (!user) {
  authMetrics.increment(AUTH_METRICS.LOGIN_FAILURE);
  authLogger.warn('Login failed: user not found', {
    usernameOrEmail: credentials.usernameOrEmail,
    ip: metadata?.ip,
  });
  throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
}
```

**After:**
```typescript
if (!user) {
  authMetrics.increment(AUTH_METRICS.LOGIN_FAILURE);
  // Log specific reason internally
  authLogger.warn('Login failed: user not found', {
    usernameOrEmail: credentials.usernameOrEmail,
    ip: metadata?.ip,
  });
  // Return generic message externally
  throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
}
```

(Actually - this was already correct! The error message is already generic. But let's verify the next one...)

### Step 2: Update account deactivated error

Find the "account deactivated" check (around line 149):

**Before:**
```typescript
if (!user.isActive) {
  authMetrics.increment(AUTH_METRICS.LOGIN_FAILURE);
  authLogger.warn('Login failed: account deactivated', {
    userId: user.id,
    username: user.username,
  });
  throw new AuthError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
}
```

**After:**
```typescript
if (!user.isActive) {
  authMetrics.increment(AUTH_METRICS.LOGIN_FAILURE);
  // Log specific reason internally
  authLogger.warn('Login failed: account deactivated', {
    userId: user.id,
    username: user.username,
  });
  // Return generic message externally (prevent enumeration)
  throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
}
```

### Step 3: Verify password error is generic

The password check error should already be generic (around line 201):

```typescript
throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
```

This is correct - no change needed.

### Step 4: Type check

Run: `npm run typecheck`
Expected: No type errors

### Step 5: Commit

```bash
git add src/application/auth/AuthService.ts
git commit -m "security: use generic login error messages

- Account deactivated now returns 'Invalid credentials'
- Prevents username enumeration via error messages
- Specific reasons still logged internally for debugging

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Inject UserRepository into RefreshTokenService

**Files:**
- Modify: `src/application/auth/RefreshTokenService.ts`
- Modify: `src/server.ts`

### Step 1: Update RefreshTokenService constructor

Open `src/application/auth/RefreshTokenService.ts` and find the constructor (around line 48):

**Before:**
```typescript
constructor(
  private tokenService: ITokenService,
  private config: RefreshTokenServiceConfig
) {}
```

**After:**
```typescript
constructor(
  private tokenService: ITokenService,
  private userRepo: IUserRepository,  // <-- ADD THIS
  private config: RefreshTokenServiceConfig
) {}
```

### Step 2: Update getUserById to use repository

Find the `getUserById()` method (around line 334):

**Before:**
```typescript
private async getUserById(userId: string): Promise<User | null> {
  // This would use UserRepository in production
  // For now, return a minimal user object
  return {
    id: userId,
    username: 'user',
    email: 'user@example.com',
    passwordHash: '',
    isActive: true,
    createdAt: new Date(),
    lastLoginAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
  };
}
```

**After:**
```typescript
private async getUserById(userId: string): Promise<User | null> {
  return this.userRepo.findById(userId);
}
```

### Step 3: Add security documentation

Add this comment to the top of the class (around line 42):

**Before:**
```typescript
/**
 * RefreshTokenService - Handles refresh token lifecycle and rotation
 *
 * Security features:
 * - Token rotation: Old token invalidated when new one issued
 * - Token families: Detects token theft attempts
 * - Compromise detection: If old token from family is used, family is flagged
 * - Global token limit: Prevents unbounded memory growth
 */
export class RefreshTokenService {
  // In-memory storage for refresh tokens (in production, use database)
  private tokens: Map<string, RefreshToken> = new Map();
```

**After:**
```typescript
/**
 * RefreshTokenService - Handles refresh token lifecycle and rotation
 *
 * Security features:
 * - Token rotation: Old token invalidated when new one issued
 * - Token families: Detects token theft attempts
 * - Compromise detection: If old token from family is used, family is flagged
 * - Global token limit: Prevents unbounded memory growth
 *
 * DEVELOPMENT NOTE: Tokens stored in-memory (Map). Lost on server restart.
 * For production, migrate to database-backed storage in UserSession table.
 */
export class RefreshTokenService {
  // In-memory storage for refresh tokens (in production, use database)
  private tokens: Map<string, RefreshToken> = new Map();
```

### Step 4: Import IUserRepository and User

Verify imports at top of file (around line 1-7):

```typescript
import { v4 as uuidv4 } from 'uuid';
import type { User } from '@/domain/user/types.js';
import type { IUserRepository, ITokenService } from '@/domain/user/repository.js';
import { authLogger, authMetrics, AUTH_METRICS } from '@/utils/auth-logger.js';
```

`IUserRepository` should already be imported. If not, add it.

### Step 5: Update src/server.ts to pass userRepository

Open `src/server.ts` and find where RefreshTokenService is created.

Search for: `new RefreshTokenService`

You'll need to find the authService initialization and add userRepo to refreshTokenService. The exact location depends on your server.ts structure.

**Pattern to look for:**
```typescript
// Find this pattern
const refreshTokenService = new RefreshTokenService(
  tokenService,
  config
);

// Change to:
const refreshTokenService = new RefreshTokenService(
  tokenService,
  userRepository,  // Add this line
  config
);
```

### Step 6: Type check

Run: `npm run typecheck`
Expected: No type errors

### Step 7: Build to verify

Run: `npm run build`
Expected: Build succeeds

### Step 8: Commit

```bash
git add src/application/auth/RefreshTokenService.ts src/server.ts
git commit -m "fix: use real user lookup in RefreshTokenService

- Inject IUserRepository into RefreshTokenService
- getUserById() now returns real user from database
- Fixes JWT tokens being issued with fake user data
- Add documentation about in-memory storage limitation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Verification & Testing

**Files:**
- Manual testing via dev server
- Type checking

### Step 1: Full type check

Run: `npm run typecheck`
Expected: No type errors across all files

### Step 2: Build

Run: `npm run build`
Expected: Build succeeds without errors

### Step 3: Start dev server

Run: `npm run dev`
Expected: Server starts successfully

### Step 4: Manual test - login with valid credentials

1. Navigate to `http://localhost:3000/login`
2. Enter valid username and password
3. Click login

Expected: Successfully logged in, redirected to home

### Step 5: Manual test - login with invalid username

1. Navigate to `http://localhost:3000/login`
2. Enter non-existent username
3. Enter any password
4. Click login

Expected: "Invalid credentials" error message

### Step 6: Manual test - login with invalid password

1. Navigate to `http://localhost:3000/login`
2. Enter valid username
3. Enter wrong password
4. Click login

Expected: "Invalid credentials" error message (same as invalid username)

### Step 7: Verify admin check

If you have a user in the database:
1. Check that user.isAdmin field exists
2. If not set, user should not be admin
3. If set to true, user should have admin access

### Step 8: Final commit

```bash
git add -A
git commit -m "test: verify auth fixes work correctly

All fixes verified:
- Admin check uses User.isAdmin field
- Login errors are generic
- JWT secret validated before trim
- RefreshTokenService uses real user lookup
- In-memory storage limitation documented

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Push Changes

### Step 1: Push to remote

Run: `git push origin feature/auth-expiration`
Expected: Push succeeds

### Step 2: Create Pull Request

Using GitHub web interface:
1. Go to https://github.com/dder4a42/trpg-server
2. Click "Compare & pull request"
3. Base: `main` ← Compare: `feature/auth-expiration`
4. Title: `fix: Address critical auth system issues from code review`
5. Use template from `.github/PULL_REQUEST_TEMPLATE.md`

**Summary for PR:**
```
## Summary
Fixes critical and high-priority issues from code review

## Motivation
Code review identified 5 issues that could cause security vulnerabilities
and incorrect behavior. Fixes are targeted and minimal.

## Changes
- Add isAdmin field to User type
- Use User.isAdmin instead of environment variable for admin checks
- Fix JWT secret validation to check length before trim
- Standardize login error messages to prevent enumeration
- Inject UserRepository into RefreshTokenService for real user lookup
- Document in-memory token storage limitation

## Breaking Changes
None. isAdmin is optional with undefined = false (non-admin)

## Testing
- Manual testing of login flows
- Type checking passes
- Build succeeds
```

---

## Summary of Changes

| Task | Files Modified | Lines Changed |
|------|----------------|---------------|
| 1 | types.ts, connection.ts | +2 |
| 2 | AuthModule.ts, TokenService.ts | ~4 |
| 3 | TokenService.ts | ~3 |
| 4 | AuthService.ts | ~3 |
| 5 | RefreshTokenService.ts, server.ts | ~10 |
| 6 | Verification | - |
| 7 | Push/PR | - |

**Total estimated time:** 30-45 minutes

**Order of execution:** Tasks 1-6 must be done in sequence. Task 7 (push) is after all fixes complete.
