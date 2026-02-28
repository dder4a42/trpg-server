// Utility: Structured logger for auth events
// Provides consistent logging format for authentication and session events

export interface LogContext {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Simple structured logger for auth events
 */
export class AuthLogger {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  private log(level: string, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      component: this.prefix,
      message,
      ...context,
    };

    const formatted = JSON.stringify(logEntry);
    console.log(`[AUTH] ${formatted}`);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'production') {
      this.log('debug', message, context);
    }
  }
}

/**
 * Auth-specific logger instance
 */
export const authLogger = new AuthLogger('Auth');

/**
 * Session cleanup logger instance
 */
export const cleanupLogger = new AuthLogger('SessionCleanup');

/**
 * Metrics tracker (simple in-memory counter)
 * In production, replace with proper metrics system (Prometheus, etc.)
 */
export class AuthMetrics {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();

  increment(name: string, value = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  incrementGauge(name: string, delta = 1): void {
    const current = this.gauges.get(name) || 0;
    this.gauges.set(name, current + delta);
  }

  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  getGauge(name: string): number {
    return this.gauges.get(name) || 0;
  }

  getAll(): { counters: Record<string, number>; gauges: Record<string, number> } {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
  }
}

/**
 * Auth metrics instance
 */
export const authMetrics = new AuthMetrics();

/**
 * Metric names constants
 */
export const AUTH_METRICS = {
  // Counters
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  LOGOUT: 'auth.logout',
  REGISTER_SUCCESS: 'auth.register.success',
  REGISTER_FAILURE: 'auth.register.failure',

  SESSION_CREATED: 'auth.session.created',
  SESSION_VALIDATED: 'auth.session.validated',
  SESSION_EXPIRED: 'auth.session.expired',
  SESSION_REFRESHED: 'auth.session.refreshed',
  SESSION_DELETED: 'auth.session.deleted',

  CLEANUP_RUN: 'auth.cleanup.run',
  CLEANUP_SESSIONS_REMOVED: 'auth.cleanup.sessions_removed',

  // Gauges
  ACTIVE_SESSIONS: 'auth.sessions.active',
} as const;
