// Token Revocation List for JWT
// Stores revoked JWT jti claims in memory with TTL-based cleanup

/**
 * Revoked token entry with expiration time
 */
interface RevokedTokenEntry {
  jti: string;
  revokedAt: Date;
  expiresAt: Date;  // When the token would have naturally expired
  reason?: string;
}

/**
 * In-memory store for revoked tokens
 */
const revokedTokens = new Map<string, RevokedTokenEntry>();

/**
 * Maximum number of revoked tokens to store in memory
 * Prevents unbounded memory growth in case of abuse
 */
const MAX_REVOKED_TOKENS = 10000;

/**
 * Cleanup interval (run every hour)
 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Start automatic cleanup of expired entries
 */
function startAutomaticCleanup(): void {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    cleanupRevokedTokens();
  }, CLEANUP_INTERVAL_MS);

  // Also run on module load
  cleanupRevokedTokens();
}

/**
 * Stop automatic cleanup
 */
function stopAutomaticCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Remove expired entries from the revocation list
 */
function cleanupRevokedTokens(): void {
  const now = new Date();
  let cleaned = 0;

  for (const [jti, entry] of revokedTokens.entries()) {
    if (entry.expiresAt <= now) {
      revokedTokens.delete(jti);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[TokenRevocationList] Cleaned up ${cleaned} expired entries`);
  }
}

/**
 * Add a token to the revocation list
 * @param jti JWT ID claim from the token
 * @param expiresAt When the token would naturally expire
 * @param reason Optional reason for revocation
 */
export function revokeToken(jti: string, expiresAt: Date, reason?: string): void {
  // Check if we're at capacity and try cleanup first
  if (revokedTokens.size >= MAX_REVOKED_TOKENS) {
    cleanupRevokedTokens();

    // Still at capacity after cleanup - skip this revocation
    if (revokedTokens.size >= MAX_REVOKED_TOKENS) {
      console.warn(`[TokenRevocationList] Max size (${MAX_REVOKED_TOKENS}) reached, skipping revocation for ${jti}`);
      return;
    }
  }

  const entry: RevokedTokenEntry = {
    jti,
    revokedAt: new Date(),
    expiresAt,
    reason,
  };

  revokedTokens.set(jti, entry);
  console.log(`[TokenRevocationList] Token revoked: ${jti} (expires: ${expiresAt.toISOString()})`);
}

/**
 * Check if a token has been revoked
 * @param jti JWT ID claim from the token
 * @returns true if the token is revoked, false otherwise
 */
export function isTokenRevoked(jti: string): boolean {
  const entry = revokedTokens.get(jti);

  if (!entry) {
    return false;
  }

  // Check if the revocation entry has expired (token has passed its natural expiration)
  if (entry.expiresAt <= new Date()) {
    revokedTokens.delete(jti);
    return false;
  }

  return true;
}

/**
 * Revoke all tokens for a user
 * This requires a list of jti claims - typically tracked via RefreshTokenService
 * @param jtis Array of JWT ID claims to revoke
 * @param expiresAt Default expiration for tokens without specific expiry
 */
export function revokeTokens(jtis: string[], expiresAt: Date): number {
  let count = 0;

  for (const jti of jtis) {
    revokeToken(jti, expiresAt, 'logout_all');
    count++;
  }

  return count;
}

/**
 * Get statistics about the revocation list
 */
export function getRevocationListStats(): {
  total: number;
  revokedThisHour: number;
} {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  let revokedThisHour = 0;
  for (const entry of revokedTokens.values()) {
    if (entry.revokedAt >= oneHourAgo) {
      revokedThisHour++;
    }
  }

  return {
    total: revokedTokens.size,
    revokedThisHour,
  };
}

/**
 * Clear all revocation entries (for testing)
 */
export function clearRevocationList(): void {
  revokedTokens.clear();
}

// Start automatic cleanup on module load
startAutomaticCleanup();

// Cleanup on process exit (only beforeExit - library code shouldn't call process.exit)
process.on('beforeExit', stopAutomaticCleanup);
