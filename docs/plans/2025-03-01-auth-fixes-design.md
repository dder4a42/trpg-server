# Auth System Critical Fixes - Design Document

**Date:** 2025-03-01
**Status:** Approved
**Approach:** Targeted Minimal Fixes

## Overview

This design addresses critical and high-priority issues identified in code review for the authentication system. The fixes are minimal and appropriate for the current development phase.

### Issues Addressed

| Severity | Issue | Fix |
|----------|-------|-----|
| HIGH | getUserById returns fake user data | Inject UserRepository |
| HIGH | Timing attack in login error messages | Generic error messages |
| HIGH | Admin check uses environment variable | Add isAdmin to User type |
| HIGH | JWT secret validation after trim | Validate before trim |
| MEDIUM | In-memory tokens lost on restart | Document limitation |

## Architecture

No new architecture - targeted fixes to existing components.

**Components affected:**
- `RefreshTokenService` - Inject UserRepository
- `AuthService` - Standardize error messages
- `User` type - Add isAdmin field
- `TokenService` - Fix validation order

**Components unchanged:**
- `SessionCache`, `rateLimiter`, `tokenRevocationList`

## Detailed Fixes

### Fix 1: Real User Lookup in Token Rotation

**File:** `src/application/auth/RefreshTokenService.ts`

**Problem:** The `getUserById()` method returns a hardcoded fake user. JWT tokens issued during rotation contain fake user data.

**Solution:** Inject `IUserRepository` for real user lookups.

```typescript
// Constructor change
constructor(
  private tokenService: ITokenService,
  private userRepo: IUserRepository,  // Add
  private config: RefreshTokenServiceConfig
) {}

// Method change
private async getUserById(userId: string): Promise<User | null> {
  return this.userRepo.findById(userId);
}
```

**Integration:** Update `src/server.ts` to pass userRepository when creating RefreshTokenService.

---

### Fix 2: Generic Login Error Messages

**File:** `src/application/auth/AuthService.ts`

**Problem:** Different error paths reveal if a user exists ("user not found" vs "invalid credentials"). Enables username enumeration attacks.

**Solution:** Always return "Invalid credentials" for auth failures. Log specific reasons internally.

```typescript
// Line ~139-145: User not found
if (!user) {
  authMetrics.increment(AUTH_METRICS.LOGIN_FAILURE);
  authLogger.warn('Login failed: user not found', { usernameOrEmail });
  throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
}

// Line ~149-156: Account deactivated
if (!user.isActive) {
  authMetrics.increment(AUTH_METRICS.LOGIN_FAILURE);
  authLogger.warn('Login failed: account deactivated', { userId: user.id });
  throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
}
```

---

### Fix 3: Admin Field on User Type

**Files:**
- `src/domain/user/types.ts`
- `src/api/middleware/AuthModule.ts`
- `src/application/auth/TokenService.ts`

**Problem:** Admin status determined by comparing username to environment variable at runtime. Changes don't take effect until re-login.

**Solution:** Add `isAdmin` boolean to User type.

```typescript
// types.ts
export interface User {
  id: string;
  username: string;
  email?: string;
  passwordHash: string;
  isActive: boolean;
  isAdmin?: boolean;  // Add this
  createdAt: Date;
  // ... other fields
}
```

**Database migration:** Add `isAdmin` column to users table with default `false`.

---

### Fix 4: JWT Secret Validation Order

**File:** `src/application/auth/TokenService.ts`

**Problem:** Secret is trimmed before length check, so `" " + 32 chars` would pass validation.

**Solution:** Check raw secret length first, then trim.

```typescript
// createTokenService function
const MIN_SECRET_LENGTH = 32;

// Check raw secret FIRST
if (!secret || typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
  throw new Error(
    `JWT_SECRET or AUTH_SECRET required (minimum ${MIN_SECRET_LENGTH} characters)`
  );
}

// Then trim and use
const trimmedSecret = secret.trim();
```

---

### Fix 5: Document In-Memory Token Limitation

**File:** `src/application/auth/RefreshTokenService.ts`

**Problem:** No warning that tokens are lost on server restart.

**Solution:** Add security note to class documentation.

```typescript
/**
 * RefreshTokenService - Handles refresh token lifecycle and rotation
 *
 * SECURITY NOTE: Tokens stored in-memory (Map). Lost on server restart.
 * For production, migrate to database-backed storage.
 */
```

## Data Flow

### Token Rotation Flow (Fixed)

```
RefreshTokenService.rotate()
  → userRepo.findById(userId)
  → Returns real user from database ✅
  → JWT signed with real user data ✅
  → Returns valid token pair
```

### Dependency Changes

**src/server.ts:**
```typescript
// Before
const refreshTokenService = new RefreshTokenService(tokenService, config);

// After
const refreshTokenService = new RefreshTokenService(
  tokenService,
  userRepository,  // Add dependency
  config
);
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| User deleted while token valid | Token rotation returns null gracefully |
| Admin status changes | Requires re-login (by design) |
| Server restart | Tokens lost (documented limitation) |
| JWT secret too short | Fails fast with clear error |
| Username enumeration attempt | Generic error prevents it |

**Logging principle:** Log specific details internally, return generic messages externally.

```typescript
// Internal - for developers
authLogger.warn('Login failed: account deactivated', { userId });

// External - for users/attackers
throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
```

## Testing Strategy

### Unit Tests

**RefreshTokenService:**
- `rotate()` returns null when user not found
- `rotate()` uses real user data from repository

**AuthService:**
- `login()` returns generic error for non-existent user
- `login()` returns generic error for deactivated account
- `login()` returns generic error for invalid password

**TokenService:**
- `createTokenService()` throws when raw secret < 32 chars

### Integration Tests

- Token rotation with real user data
- Login error messages are all identical
- Admin check uses User.isAdmin field

### Manual Testing

- [ ] Login with valid credentials → success
- [ ] Login with wrong username → "Invalid credentials"
- [ ] Login with wrong password → "Invalid credentials"
- [ ] Login as admin → JWT has isAdmin: true
- [ ] Token rotation → correct user data
- [ ] Delete user → rotation returns null

## Implementation Notes

- All fixes are self-contained to auth components
- No breaking changes to existing APIs
- Database migration needed for isAdmin column
- RefreshTokenService constructor signature changes (affects src/server.ts)

## Future Work (Out of Scope)

- Database-backed refresh tokens (production readiness)
- Redis for token revocation list
- Metrics export (Prometheus integration)
- Split AuthModule into smaller classes
