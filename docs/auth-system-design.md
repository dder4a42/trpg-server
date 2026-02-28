# Authentication System Design Document

> **Status:** Draft  
> **Author:** AI Assistant  
> **Date:** 2026-02-28  
> **Version:** 1.0

## 1. Executive Summary

This document proposes a redesigned authentication system for the TRPG server that addresses:
- Session expiration enforcement and automatic cleanup
- In-memory/disk synchronization issues with LowDB
- Missing features (refresh tokens, session management, rate limiting)

## 2. Current System Analysis

### 2.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ auth.ts     │  │ auth.ts     │  │ AuthModule.ts           │  │
│  │ (routes)    │  │ (middleware)│  │ (unified middleware)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Application Layer                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    AuthService.ts                            ││
│  │  - register(), login(), logout()                             ││
│  │  - validateSession(), changePassword()                       ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                          │
│  ┌────────────────────┐  ┌────────────────────────────────────┐ │
│  │ UserRepository.ts  │  │ UserSessionRepository.ts           │ │
│  │ (LowDB)            │  │ (LowDB)                            │ │
│  └────────────────────┘  └────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer (LowDB)                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  data/db.json                                                ││
│  │  { users: [...], userSessions: [...] }                       ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Identified Problems

#### Problem 1: Session Expiration Not Enforced

**Current Behavior:**
- `expiresAt` is set when session is created
- `isValid()` checks expiration but is not always called
- Expired sessions remain in database indefinitely
- No background cleanup process

**Impact:**
- Database bloat over time
- Potential security risk (old sessions could theoretically be exploited)
- Inconsistent behavior across different code paths

#### Problem 2: In-Memory/Disk Synchronization

**Current Behavior:**
```typescript
// LowDB pattern - data loaded once at startup
const data = db.getData();  // Returns in-memory reference

// Mutations modify in-memory, then write
data.users.push(newUser);
await db.write();  // Writes entire JSON to disk
```

**Issues:**
1. **No read-before-write:** If external process modifies file, changes are lost
2. **Race conditions:** Concurrent requests can overwrite each other
3. **Memory staleness:** Long-running process may have stale data
4. **No atomic operations:** Partial failures can corrupt state

#### Problem 3: Missing Security Features

| Feature | Status | Risk Level |
|---------|--------|------------|
| Refresh tokens | ❌ Missing | Medium |
| Session revocation | ⚠️ Partial | Medium |
| Rate limiting | ❌ Missing | High |
| Password reset | ❌ Placeholder | Medium |
| Remember me | ❌ Missing | Low |
| Multi-device management | ❌ Missing | Low |

## 3. Proposed Design

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
│  ┌─────────────┐  ┌─────────────────────────────────────────┐   │
│  │ auth.ts     │  │ AuthModule.ts                           │   │
│  │ (routes)    │  │ + RateLimiter integration               │   │
│  └─────────────┘  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Application Layer                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ AuthService.ts   │  │ SessionManager   │  │ TokenService  │  │
│  │ (orchestration)  │  │ (lifecycle)      │  │ (JWT/refresh) │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    SessionCache (NEW)                        ││
│  │  - In-memory LRU cache for active sessions                   ││
│  │  - Write-through to repository                               ││
│  │  - TTL-based auto-eviction                                   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                          │
│  ┌────────────────────┐  ┌────────────────────────────────────┐ │
│  │ UserRepository.ts  │  │ UserSessionRepository.ts           │ │
│  │ + atomic ops       │  │ + batch operations                 │ │
│  │ + optimistic lock  │  │ + expiration index                 │ │
│  └────────────────────┘  └────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              DatabaseConnection (Enhanced)                   ││
│  │  - Read-before-write pattern                                 ││
│  │  - File locking (advisory)                                   ││
│  │  - Periodic sync                                             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Token Strategy: Dual-Token System

```
┌─────────────────────────────────────────────────────────────────┐
│                     Token Architecture                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐         ┌─────────────────────────────┐    │
│  │  Access Token   │         │      Refresh Token          │    │
│  │  (Short-lived)  │         │      (Long-lived)           │    │
│  ├─────────────────┤         ├─────────────────────────────┤    │
│  │ Type: JWT       │         │ Type: Opaque UUID           │    │
│  │ TTL: 15 minutes │         │ TTL: 7 days (remember me)   │    │
│  │ Storage: Memory │         │     or 24 hours (default)   │    │
│  │ Contains:       │         │ Storage: HttpOnly Cookie    │    │
│  │  - userId       │         │          + Database         │    │
│  │  - username     │         │ Contains:                   │    │
│  │  - isAdmin      │         │  - tokenId                  │    │
│  │  - exp          │         │  - userId                   │    │
│  │  - iat          │         │  - familyId (rotation)      │    │
│  └─────────────────┘         └─────────────────────────────┘    │
│                                                                  │
│  Flow:                                                           │
│  1. Login → Returns both tokens                                  │
│  2. API calls use Access Token (Authorization header)            │
│  3. Access Token expires → Use Refresh Token to get new pair     │
│  4. Refresh Token rotation: old token invalidated on use         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Why This Approach:**
- Short-lived access tokens minimize exposure window
- Refresh token rotation detects token theft
- Stateless access tokens reduce database load
- Compatible with existing cookie-based flow

### 3.3 Session Lifecycle Management

```
┌─────────────────────────────────────────────────────────────────┐
│                   Session State Machine                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│    ┌──────────┐                                                  │
│    │  Login   │                                                  │
│    └────┬─────┘                                                  │
│         │                                                        │
│         ▼                                                        │
│    ┌──────────┐    refresh     ┌──────────┐                     │
│    │  ACTIVE  │◄──────────────►│ REFRESHED│                     │
│    └────┬─────┘                └──────────┘                     │
│         │                                                        │
│    ┌────┴────────────┬─────────────────┐                        │
│    │                 │                 │                        │
│    ▼                 ▼                 ▼                        │
│ ┌──────────┐   ┌──────────┐    ┌──────────┐                    │
│ │ EXPIRED  │   │ REVOKED  │    │ LOGGED   │                    │
│ │(auto TTL)│   │(explicit)│    │   OUT    │                    │
│ └──────────┘   └──────────┘    └──────────┘                    │
│         │            │               │                          │
│         └────────────┴───────────────┘                          │
│                      │                                          │
│                      ▼                                          │
│               ┌──────────┐                                      │
│               │ CLEANED  │  (background job)                    │
│               └──────────┘                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Session Cache Design

```typescript
/**
 * SessionCache - Write-through LRU cache for session validation
 * 
 * Goals:
 * - Reduce disk I/O for frequent session validations
 * - Maintain consistency with database
 * - Auto-evict expired sessions
 */
interface SessionCacheConfig {
  maxSize: number;           // Max cached sessions (default: 1000)
  ttlMs: number;             // Cache entry TTL (default: 5 minutes)
  cleanupIntervalMs: number; // Cleanup interval (default: 1 minute)
}

interface CachedSession {
  session: UserSession;
  user: User;                // Denormalized for fast access
  cachedAt: number;          // Timestamp for TTL
  accessCount: number;       // For LRU eviction
}
```

**Cache Operations:**

| Operation | Cache Behavior | Database Behavior |
|-----------|---------------|-------------------|
| `validateSession()` | Check cache first | Read on cache miss |
| `createSession()` | Add to cache | Write-through |
| `deleteSession()` | Remove from cache | Write-through |
| `refreshSession()` | Update cache | Write-through |
| Expiration | Auto-evict | Background cleanup |

### 3.5 Database Synchronization Strategy

#### Option A: Optimistic Locking (Recommended for LowDB)

```typescript
interface VersionedData {
  _version: number;
  users: UserRecord[];
  userSessions: SessionRecord[];
}

async function atomicUpdate<T>(
  db: DatabaseConnection,
  updater: (data: VersionedData) => T
): Promise<T> {
  const maxRetries = 3;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // 1. Read current state
    await db.read();
    const data = db.getData();
    const version = data._version;
    
    // 2. Apply update
    const result = updater(data);
    data._version = version + 1;
    
    // 3. Write with version check
    try {
      await db.writeWithVersionCheck(version);
      return result;
    } catch (e) {
      if (e instanceof VersionConflictError && attempt < maxRetries - 1) {
        continue; // Retry
      }
      throw e;
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

#### Option B: File Locking (Alternative)

```typescript
import { lock } from 'proper-lockfile';

async function withFileLock<T>(
  filePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const release = await lock(filePath, { retries: 3 });
  try {
    return await operation();
  } finally {
    await release();
  }
}
```

**Recommendation:** Use Option A (Optimistic Locking) because:
- No external dependencies
- Works well for low-contention scenarios (typical for TRPG server)
- Simpler error handling

### 3.6 Background Session Cleanup

```typescript
/**
 * SessionCleanupJob - Periodic cleanup of expired sessions
 */
class SessionCleanupJob {
  private intervalId: NodeJS.Timeout | null = null;
  
  constructor(
    private sessionRepo: IUserSessionRepository,
    private config: {
      intervalMs: number;      // Default: 1 hour
      batchSize: number;       // Default: 100
      enabled: boolean;        // Default: true
    }
  ) {}
  
  start(): void {
    if (!this.config.enabled) return;
    
    this.intervalId = setInterval(
      () => this.cleanup(),
      this.config.intervalMs
    );
    
    // Run immediately on start
    this.cleanup();
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  
  private async cleanup(): Promise<void> {
    try {
      const deleted = await this.sessionRepo.deleteExpired();
      if (deleted > 0) {
        logger.info(`Session cleanup: removed ${deleted} expired sessions`);
      }
    } catch (error) {
      logger.error('Session cleanup failed:', error);
    }
  }
}
```

### 3.7 Rate Limiting Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    Rate Limiting Strategy                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Endpoint              │ Limit          │ Window  │ Key         │
│  ──────────────────────┼────────────────┼─────────┼───────────  │
│  POST /auth/login      │ 5 attempts     │ 15 min  │ IP + user   │
│  POST /auth/register   │ 3 attempts     │ 1 hour  │ IP          │
│  POST /auth/refresh    │ 10 attempts    │ 1 min   │ userId      │
│  POST /auth/reset-pwd  │ 3 attempts     │ 1 hour  │ IP          │
│  GET  /auth/me         │ 60 requests    │ 1 min   │ userId      │
│                                                                  │
│  Implementation: Sliding window counter (in-memory)              │
│  Storage: Map<string, { count: number, resetAt: number }>        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```typescript
interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
  keyGenerator: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
}

const loginRateLimit: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxAttempts: 5,
  keyGenerator: (req) => `login:${req.ip}:${req.body.usernameOrEmail}`,
  skipSuccessfulRequests: false,
};
```

## 4. Data Model Changes

### 4.1 Enhanced Session Schema

```typescript
// Current
interface UserSession {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

// Proposed
interface UserSession {
  id: string;                    // Access token ID (for JWT jti claim)
  userId: string;
  
  // Timestamps
  createdAt: Date;
  expiresAt: Date;               // Access token expiration
  lastActivityAt: Date;          // For sliding expiration (NEW)
  
  // Refresh token (NEW)
  refreshToken: string;          // Opaque token stored in cookie
  refreshExpiresAt: Date;        // Refresh token expiration
  familyId: string;              // Token family for rotation detection
  
  // Metadata
  ipAddress?: string;
  userAgent?: string;
  deviceName?: string;           // User-friendly device name (NEW)
  
  // Status (NEW)
  status: 'active' | 'revoked' | 'expired';
  revokedAt?: Date;
  revokedReason?: string;
}
```

### 4.2 Database Schema (LowDB JSON)

```json
{
  "_version": 1,
  "_lastCleanup": "2026-02-28T00:00:00Z",
  
  "users": [
    {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "password_hash": "string",
      "is_active": 1,
      "created_at": "ISO8601",
      "last_login": "ISO8601",
      "failed_login_attempts": 0,
      "locked_until": null
    }
  ],
  
  "userSessions": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "refresh_token": "uuid",
      "family_id": "uuid",
      "created_at": "ISO8601",
      "expires_at": "ISO8601",
      "refresh_expires_at": "ISO8601",
      "last_activity_at": "ISO8601",
      "ip_address": "string",
      "user_agent": "string",
      "device_name": "string",
      "status": "active",
      "revoked_at": null,
      "revoked_reason": null
    }
  ],
  
  "refreshTokenFamilies": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "created_at": "ISO8601",
      "is_compromised": false
    }
  ]
}
```

## 5. API Changes

### 5.1 New Endpoints

```
POST /auth/refresh
  Request:  { } (refresh token in HttpOnly cookie)
  Response: { accessToken, expiresIn }
  
POST /auth/logout-all
  Request:  { } (requires authentication)
  Response: { success, sessionsRevoked }
  
GET /auth/sessions
  Request:  { } (requires authentication)
  Response: { sessions: [{ id, deviceName, lastActivity, current }] }
  
DELETE /auth/sessions/:sessionId
  Request:  { } (requires authentication)
  Response: { success }
```

### 5.2 Modified Endpoints

```
POST /auth/login
  Request:  { usernameOrEmail, password, rememberMe? }
  Response: { 
    user, 
    accessToken,      // NEW: JWT
    expiresIn,        // NEW: seconds until expiration
    // refreshToken sent as HttpOnly cookie
  }

POST /auth/register
  Response: Same as login (auto-login after registration)
```

## 6. Implementation Plan

### Phase 1: Foundation (Week 1)
- [ ] Add version field to database schema
- [ ] Implement optimistic locking in DatabaseConnection
- [ ] Add SessionCache with write-through
- [ ] Add background cleanup job

### Phase 2: Token System (Week 2)
- [ ] Implement JWT access tokens
- [ ] Implement refresh token rotation
- [ ] Update login/register endpoints
- [ ] Add /auth/refresh endpoint

### Phase 3: Security Hardening (Week 3)
- [ ] Implement rate limiting middleware
- [ ] Add account lockout after failed attempts
- [ ] Add session management endpoints
- [ ] Implement logout-all functionality

### Phase 4: Polish (Week 4)
- [ ] Add device naming/tracking
- [ ] Implement sliding session expiration
- [ ] Add comprehensive logging
- [ ] Write migration script for existing sessions

## 7. Migration Strategy

### 7.1 Database Migration

```typescript
async function migrateAuthSchema(db: DatabaseConnection): Promise<void> {
  const data = db.getData();
  
  // Add version if missing
  if (!data._version) {
    data._version = 1;
  }
  
  // Migrate existing sessions
  for (const session of data.userSessions) {
    if (!session.refresh_token) {
      session.refresh_token = crypto.randomUUID();
      session.family_id = crypto.randomUUID();
      session.refresh_expires_at = session.expires_at;
      session.last_activity_at = session.created_at;
      session.status = 'active';
    }
  }
  
  // Initialize refresh token families
  if (!data.refreshTokenFamilies) {
    data.refreshTokenFamilies = [];
  }
  
  await db.write();
}
```

### 7.2 Backward Compatibility

During migration period:
1. Accept both old session format and new JWT format
2. Gradually migrate sessions on access
3. Set deadline for full migration (e.g., 30 days)
4. Log warnings for old format usage

## 8. Security Considerations

### 8.1 Token Security

| Concern | Mitigation |
|---------|------------|
| JWT secret exposure | Use strong secret, rotate periodically |
| Token theft | Short TTL, refresh rotation, HTTPS only |
| XSS attacks | HttpOnly cookies for refresh token |
| CSRF attacks | SameSite=Strict cookies |
| Replay attacks | JWT `jti` claim, one-time refresh tokens |

### 8.2 Password Security

| Concern | Mitigation |
|---------|------------|
| Brute force | Rate limiting, account lockout |
| Weak passwords | Minimum 8 chars, complexity rules |
| Rainbow tables | bcrypt with cost factor 10+ |
| Credential stuffing | Rate limit by IP, CAPTCHA after failures |

## 9. Monitoring & Observability

### 9.1 Metrics to Track

```typescript
const authMetrics = {
  // Counters
  'auth.login.success': Counter,
  'auth.login.failure': Counter,
  'auth.login.rate_limited': Counter,
  'auth.session.created': Counter,
  'auth.session.expired': Counter,
  'auth.session.revoked': Counter,
  'auth.refresh.success': Counter,
  'auth.refresh.failure': Counter,
  
  // Gauges
  'auth.sessions.active': Gauge,
  'auth.cache.size': Gauge,
  'auth.cache.hit_rate': Gauge,
  
  // Histograms
  'auth.validation.duration_ms': Histogram,
  'auth.login.duration_ms': Histogram,
};
```

### 9.2 Logging

```typescript
// Structured logging for auth events
logger.info('auth.login', {
  userId: user.id,
  username: user.username,
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  success: true,
});

logger.warn('auth.login.failed', {
  usernameOrEmail: credentials.usernameOrEmail,
  ip: req.ip,
  reason: 'invalid_password',
  attemptCount: 3,
});
```

## 10. Testing Strategy

### 10.1 Unit Tests

- SessionCache: LRU eviction, TTL expiration, write-through
- TokenService: JWT generation/validation, refresh rotation
- RateLimiter: Window sliding, key generation, reset

### 10.2 Integration Tests

- Full login → refresh → logout flow
- Concurrent session handling
- Database sync under load
- Migration script validation

### 10.3 Security Tests

- Token expiration enforcement
- Refresh token rotation detection
- Rate limit bypass attempts
- Session fixation prevention

## 11. Auth & Game Session Integration

### 11.1 Current Coupling Points

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Auth ↔ Game Integration Points                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────────────┐ │
│  │   Auth       │         │   Room       │         │   Game Session       │ │
│  │   System     │────────►│   System     │────────►│   (GameSession.ts)   │ │
│  └──────────────┘         └──────────────┘         └──────────────────────┘ │
│        │                        │                           │               │
│        │                        │                           │               │
│        ▼                        ▼                           ▼               │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────────────┐ │
│  │ UserSession  │         │ RoomMember-  │         │ PlayerAction         │ │
│  │ (auth token) │         │ ship         │         │ (userId, characterId)│ │
│  └──────────────┘         └──────────────┘         └──────────────────────┘ │
│                                                                              │
│  Integration Points:                                                         │
│  1. req.user (from auth middleware) → Room.processPlayerInput(userId)        │
│  2. RoomMembership.userId → links to User.id                                 │
│  3. PlayerAction.userId → used for turn tracking, notes, history             │
│  4. SSE streams → authenticated per-user                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Impact Analysis

| Component | Auth Dependency | Impact of Session Expiration |
|-----------|-----------------|------------------------------|
| `Room.processPlayerInput()` | Uses `userId` from `req.user` | Mid-action expiration = action lost |
| `RoomMembership` | Links `userId` to room | User appears as member but can't act |
| `GameSession.processActions()` | Receives `PlayerAction[]` with `userId` | No direct impact (userId already extracted) |
| `TurnGate` | Checks `characterId` ownership | Stale session = can't verify ownership |
| `PlayerNotes` | Stored per `userId` | Notes inaccessible until re-auth |
| `SSE Streaming` | Session validated on connect | Stream dies on expiration |
| `ConversationHistory` | Records `userId` in actions | Historical data unaffected |

### 11.3 Critical Scenarios

#### Scenario 1: Session Expires Mid-Game Turn

```
Timeline:
  T0: Player submits action (session valid)
  T1: Action queued in ActionManager
  T2: Session expires (15 min JWT TTL)
  T3: All players ready, processCombinedPlayerActions() called
  T4: LLM generates response
  T5: Response saved with original userId ✓

Result: Action completes successfully because userId was captured at T0.
Risk: LOW - userId is captured early in the request lifecycle.
```

#### Scenario 2: SSE Stream During Session Expiration

```
Timeline:
  T0: Player connects to /api/stream/room/:roomId (session valid)
  T1: SSE connection established, streaming game events
  T2: Session expires
  T3: New game event occurs
  T4: ??? 

Current Behavior: Stream continues (no re-validation)
Risk: MEDIUM - Unauthorized user receives game events

Proposed Fix: Periodic session re-validation in SSE handler
```

#### Scenario 3: Refresh Token During Active Game

```
Timeline:
  T0: Player in active game, access token expires
  T1: Client detects 401 on API call
  T2: Client calls /auth/refresh
  T3: New access token issued
  T4: Client retries original request

Risk: LOW - Standard refresh flow, no game state impact
Requirement: Client must handle 401 gracefully without losing pending action
```

#### Scenario 4: User Logs Out While In Room

```
Timeline:
  T0: User in room with active game
  T1: User calls /auth/logout
  T2: Session invalidated
  T3: Other players waiting for this user's action

Current Behavior: User remains in RoomMembership (is_active=1)
Risk: HIGH - Game can stall waiting for logged-out user

Proposed Fix: Logout should trigger room leave or mark user as "away"
```

### 11.4 Design Decisions

#### Decision 1: Decouple Auth Session from Room Membership

**Problem:** Currently, `RoomMembership.userId` assumes user is authenticated.

**Solution:** Add explicit presence tracking separate from auth.

```typescript
interface RoomMembership {
  // ... existing fields
  
  // NEW: Presence tracking (independent of auth)
  presenceStatus: 'online' | 'away' | 'disconnected';
  lastSeenAt: Date;
  
  // NEW: Link to current session (nullable)
  currentSessionId?: string;  // null = not currently authenticated
}
```

**Benefits:**
- Room can handle "away" players gracefully
- Game can auto-skip disconnected players after timeout
- Historical membership preserved even after logout

#### Decision 2: Graceful Degradation for Expired Sessions

**Problem:** Hard 401 errors disrupt game flow.

**Solution:** Implement "grace period" for in-progress actions.

```typescript
// In auth middleware
async function validateSessionWithGrace(req, res, next) {
  const sessionId = extractSessionId(req);
  const session = await sessionRepo.findById(sessionId);
  
  if (!session) {
    return next(createError('Invalid session', 401));
  }
  
  const now = Date.now();
  const expiresAt = session.expiresAt.getTime();
  const gracePeriodMs = 5 * 60 * 1000; // 5 minutes
  
  if (now > expiresAt + gracePeriodMs) {
    // Hard expired - no grace
    return next(createError('Session expired', 401));
  }
  
  if (now > expiresAt) {
    // In grace period - allow but flag for refresh
    req.sessionExpired = true;
    res.setHeader('X-Session-Expired', 'true');
  }
  
  req.user = await userRepo.findById(session.userId);
  next();
}
```

#### Decision 3: SSE Connection Lifecycle

**Problem:** SSE streams don't re-validate sessions.

**Solution:** Implement heartbeat with session check.

```typescript
// In streaming.ts
async function* streamWithHeartbeat(roomId: string, sessionId: string) {
  const heartbeatInterval = 30_000; // 30 seconds
  let lastHeartbeat = Date.now();
  
  while (true) {
    // Check session validity on heartbeat
    if (Date.now() - lastHeartbeat > heartbeatInterval) {
      const isValid = await sessionRepo.isValid(sessionId);
      if (!isValid) {
        yield { event: 'session_expired', data: {} };
        return; // Close stream
      }
      yield { event: 'heartbeat', data: { timestamp: Date.now() } };
      lastHeartbeat = Date.now();
    }
    
    // ... yield game events
  }
}
```

#### Decision 4: Logout Triggers Room Status Update

**Problem:** Logout doesn't notify room system.

**Solution:** Add cross-system event.

```typescript
// In AuthService.logout()
async logout(sessionId: string): Promise<boolean> {
  const session = await this.sessionRepo.findById(sessionId);
  if (!session) return false;
  
  // NEW: Notify room system
  await this.eventBus.emit('user:logout', {
    userId: session.userId,
    sessionId,
  });
  
  return this.sessionRepo.delete(sessionId);
}

// In RoomService (new listener)
eventBus.on('user:logout', async ({ userId }) => {
  const membership = await membershipRepo.getUserMembership(userId);
  if (membership) {
    await membershipRepo.updatePresence(
      membership.roomId,
      userId,
      'disconnected'
    );
    
    // Notify other players
    await roomEvents.emit(membership.roomId, {
      type: 'player_disconnected',
      userId,
      reason: 'logout',
    });
  }
});
```

### 11.5 Data Flow: Auth → Room → Game

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Request Flow with Auth Integration                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HTTP Request                                                                │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────┐                                                        │
│  │ AuthModule.     │  1. Extract sessionId from cookie/header               │
│  │ validateSession │  2. Validate session (cache → DB)                      │
│  │                 │  3. Attach user to req.user                            │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ Room Routes     │  4. Extract roomId from params                         │
│  │ (rooms/actions) │  5. Verify user is room member                         │
│  │                 │  6. Get user's characterId from membership             │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ Room.process    │  7. Create PlayerAction with userId, characterId       │
│  │ PlayerInput()   │  8. Queue action in ActionManager                      │
│  │                 │  9. Check if all players acted (TurnGate)              │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ GameSession.    │  10. Build context with player actions                 │
│  │ processActions  │  11. Call LLM with game state                          │
│  │                 │  12. Emit events (dice rolls, narrative)               │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                        │
│  │ Conversation    │  13. Save turn to history with userId                  │
│  │ History         │  14. Persist to database                               │
│  └─────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.6 Required Changes Summary

| Layer | Change | Priority |
|-------|--------|----------|
| Domain | Add `presenceStatus` to RoomMembership | High |
| Application | Add EventBus for cross-service events | Medium |
| Application | Add grace period to session validation | Medium |
| Infrastructure | Add SSE heartbeat with session check | High |
| API | Add `X-Session-Expired` header for soft expiration | Low |
| API | Handle logout → room disconnect flow | High |

### 11.7 Migration Considerations

1. **Existing Room Memberships:** Add `presenceStatus: 'online'` default
2. **Active SSE Connections:** Will need reconnect after deploy
3. **In-Progress Games:** No impact (userId captured at action time)

## 12. Appendix

### A. Configuration Options

```typescript
interface AuthConfig {
  // Tokens
  accessTokenTtlMinutes: number;      // Default: 15
  refreshTokenTtlHours: number;       // Default: 24
  rememberMeTtlDays: number;          // Default: 7
  jwtSecret: string;                  // Required, from env
  
  // Sessions
  maxSessionsPerUser: number;         // Default: 10
  slidingExpirationEnabled: boolean;  // Default: true
  
  // Security
  bcryptRounds: number;               // Default: 10
  maxLoginAttempts: number;           // Default: 5
  lockoutDurationMinutes: number;     // Default: 15
  
  // Cache
  sessionCacheMaxSize: number;        // Default: 1000
  sessionCacheTtlMinutes: number;     // Default: 5
  
  // Cleanup
  cleanupIntervalMinutes: number;     // Default: 60
  cleanupEnabled: boolean;            // Default: true
}
```

### B. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| AUTH_REQUIRED | 401 | No authentication provided |
| INVALID_CREDENTIALS | 401 | Wrong username/password |
| INVALID_SESSION | 401 | Session expired or invalid |
| INVALID_REFRESH_TOKEN | 401 | Refresh token invalid |
| TOKEN_EXPIRED | 401 | Access token expired |
| ACCOUNT_DEACTIVATED | 403 | Account is disabled |
| ACCOUNT_LOCKED | 403 | Too many failed attempts |
| RATE_LIMITED | 429 | Too many requests |
| USERNAME_TAKEN | 409 | Username already exists |
| EMAIL_TAKEN | 409 | Email already registered |

### C. References

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [OAuth 2.0 Token Refresh](https://datatracker.ietf.org/doc/html/rfc6749#section-6)
