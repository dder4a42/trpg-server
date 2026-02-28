// Infrastructure: Session Cleanup Job
// Periodic background cleanup of expired sessions

import type { IUserSessionRepository } from '@/domain/user/repository.js';
import { cleanupLogger, authMetrics, AUTH_METRICS } from '@/utils/auth-logger.js';

export interface SessionCleanupConfig {
  intervalMs: number;      // Cleanup interval (default: 1 hour)
  batchSize: number;       // Batch size for cleanup (default: 100)
  enabled: boolean;        // Whether cleanup is enabled
  logEnabled: boolean;     // Whether to log cleanup activity
}

/**
 * SessionCleanupJob - Periodic cleanup of expired sessions
 *
 * Runs in the background to remove expired sessions from the database.
 * Uses setInterval for periodic execution.
 */
export class SessionCleanupJob {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private sessionRepo: IUserSessionRepository,
    private config: SessionCleanupConfig
  ) {}

  /**
   * Start the periodic cleanup job
   */
  start(): void {
    if (!this.config.enabled) {
      if (this.config.logEnabled) {
        cleanupLogger.info('Cleanup disabled, not starting');
      }
      return;
    }

    if (this.intervalId) {
      if (this.config.logEnabled) {
        cleanupLogger.warn('Already running');
      }
      return;
    }

    // Run immediately on start
    this.cleanup().catch((error) => {
      cleanupLogger.error('Initial cleanup failed', { error: String(error) });
    });

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.cleanup().catch((error) => {
        cleanupLogger.error('Periodic cleanup failed', { error: String(error) });
      });
    }, this.config.intervalMs);

    if (this.config.logEnabled) {
      cleanupLogger.info('Started', {
        intervalMs: this.config.intervalMs,
        batchSize: this.config.batchSize,
      });
    }
  }

  /**
   * Stop the periodic cleanup job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;

      if (this.config.logEnabled) {
        cleanupLogger.info('Stopped');
      }
    }
  }

  /**
   * Perform cleanup of expired sessions
   */
  private async cleanup(): Promise<void> {
    try {
      authMetrics.increment(AUTH_METRICS.CLEANUP_RUN);
      const deleted = await this.sessionRepo.deleteExpired();

      if (deleted > 0) {
        authMetrics.increment(AUTH_METRICS.CLEANUP_SESSIONS_REMOVED, deleted);
        cleanupLogger.info('Removed expired sessions', {
          count: deleted,
          timestamp: new Date().toISOString(),
        });
      } else if (this.config.logEnabled) {
        cleanupLogger.debug('No expired sessions to remove');
      }
    } catch (error) {
      cleanupLogger.error('Cleanup operation failed', { error: String(error) });
      throw error;
    }
  }

  /**
   * Get current status
   */
  getStatus(): { running: boolean; intervalMs: number; enabled: boolean } {
    return {
      running: this.intervalId !== null,
      intervalMs: this.config.intervalMs,
      enabled: this.config.enabled,
    };
  }
}

/**
 * Default configuration for session cleanup
 */
export function defaultCleanupConfig(): SessionCleanupConfig {
  return {
    intervalMs: 60 * 60 * 1000,  // 1 hour
    batchSize: 100,
    enabled: true,
    logEnabled: true,
  };
}
