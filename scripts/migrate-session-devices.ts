// Migration Script: Add device names and fingerprints to existing sessions
// This script updates existing user sessions to include device tracking fields

import { initDatabase } from '../src/infrastructure/database/lowdb/connection.js';
import type { UserSessionRecord } from '../src/infrastructure/database/lowdb/connection.js';

/**
 * Generate a device name from user agent string
 */
function generateDeviceName(userAgent?: string): string {
  if (!userAgent) {
    return 'Unknown Device';
  }

  const ua = userAgent.toLowerCase();

  // Mobile devices
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    if (ua.includes('iphone')) return 'iPhone';
    if (ua.includes('ipad')) return 'iPad';
    if (ua.includes('android')) return 'Android';
    return 'Mobile Device';
  }

  // Desktop browsers
  if (ua.includes('chrome')) return 'Chrome';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('edge')) return 'Edge';

  return 'Desktop Browser';
}

/**
 * Generate a device fingerprint from user agent and IP
 * Uses SHA-256 for cryptographic-quality fingerprinting
 */
async function generateDeviceFingerprint(userAgent?: string, ip?: string): Promise<string | undefined> {
  if (!userAgent && !ip) return undefined;

  const combined = `${userAgent || ''}-${ip || ''}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);

  // Use Web Crypto API for SHA-256 hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // Return first 16 hex characters (64 bits)
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Migrate existing sessions to add device tracking fields
 */
async function migrateSessions(): Promise<void> {
  console.log('Starting session migration...');

  // Initialize database
  const db = await initDatabase({
    path: process.env.DB_PATH || './data/trpg.json',
  });

  const data = db.getData();
  const sessions = data.userSessions;

  console.log(`Found ${sessions.length} sessions to migrate`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const session of sessions) {
    // Skip if already migrated
    if (session.device_name !== undefined && session.device_fingerprint !== undefined) {
      skippedCount++;
      continue;
    }

    // Generate device name from user agent
    session.device_name = generateDeviceName(session.user_agent);

    // Generate device fingerprint from user agent and IP
    session.device_fingerprint = await generateDeviceFingerprint(
      session.user_agent,
      session.ip_address
    );

    migratedCount++;

    if (process.env.NODE_ENV !== 'production') {
      console.log(`  Migrated session ${session.id}: ${session.device_name}`);
    }
  }

  // Save changes
  if (migratedCount > 0) {
    await db.write();
    console.log(`Migration complete: ${migratedCount} sessions updated, ${skippedCount} skipped`);
  } else {
    console.log(`No sessions needed migration (${skippedCount} already migrated)`);
  }

  // Close database
  await db.close();
}

// Run migration
migrateSessions()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
