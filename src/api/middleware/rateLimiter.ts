// Infrastructure: Rate Limiter
// Sliding window rate limiting middleware for Express
// Protects endpoints from abuse with configurable limits

import { authLogger } from '@/utils/auth-logger.js';

export interface RateLimitConfig {
  windowMs: number;              // Time window in milliseconds
  maxAttempts: number;           // Max requests per window
  keyGenerator: (req: Request) => string;  // Function to generate unique key
  skipSuccessfulRequests?: boolean;  // Don't count successful requests
  skipFailedRequests?: boolean;   // Don't count failed requests (4xx, 5xx)
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
  windowStart: number;
}

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Configuration for automatic cleanup
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Clean up expired entries from the rate limit store
 * Called automatically every hour, but can be called manually
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    authLogger.debug('Cleaned up expired rate limit entries', { count: cleaned });
  }
}

/**
 * Start automatic cleanup of expired entries
 * Called automatically when module is loaded
 *
 * Note: Uses timer.unref() to allow the Node process to exit naturally
 * when there's no other work keeping the event loop alive.
 */
function startAutomaticCleanup(): void {
  if (cleanupTimer) {
    return; // Already started
  }

  cleanupTimer = setInterval(() => {
    cleanupRateLimitStore();
  }, CLEANUP_INTERVAL_MS);

  // Allow process to exit naturally when there's no other work
  // The timer will keep running as long as the event loop is active
  cleanupTimer.unref();

  authLogger.debug('Rate limiter automatic cleanup started', {
    intervalMs: CLEANUP_INTERVAL_MS,
  });
}

/**
 * Stop automatic cleanup (for testing or shutdown)
 */
export function stopAutomaticCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    authLogger.debug('Rate limiter automatic cleanup stopped');
  }
}

// Start automatic cleanup when module loads
startAutomaticCleanup();

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = config.keyGenerator(req);
    const now = Date.now();

    // Get or create entry
    let entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetAt) {
      // Create new entry
      entry = {
        count: 1,
        resetAt: now + config.windowMs,
        windowStart: now,
      };
      rateLimitStore.set(key, entry);
    } else {
      // Sliding window: decay count based on time elapsed
      const windowElapsed = now - entry.windowStart;
      const decay = Math.floor((windowElapsed / config.windowMs) * entry.count);
      entry.count = Math.max(1, entry.count - decay);
      entry.windowStart = now - (windowElapsed % config.windowMs);
      entry.count++;

      // Reset if window expired
      if (now > entry.resetAt) {
        entry.count = 1;
        entry.resetAt = now + config.windowMs;
        entry.windowStart = now;
      }
    }

    // Calculate remaining attempts
    const remaining = Math.max(0, config.maxAttempts - entry.count);
    const resetDate = new Date(entry.resetAt);

    // Add rate limit info to response headers
    res.setHeader('X-RateLimit-Limit', config.maxAttempts);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    // Check if limit exceeded
    if (entry.count > config.maxAttempts) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
    }

    // Track if we should decrement on response
    const decrement = config.skipSuccessfulRequests || config.skipFailedRequests;

    if (decrement) {
      // Intercept res.json to count response status
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        const statusCode = res.statusCode;

        // Skip based on configuration
        if (config.skipSuccessfulRequests && statusCode >= 200 && statusCode < 300) {
          entry.count--;
        } else if (config.skipFailedRequests && (statusCode >= 400 || statusCode < 200)) {
          entry.count--;
        }

        return originalJson(body);
      };
    }

    next();
  };
}

/**
 * Predefined rate limit configurations
 */
export const RateLimitPresets = {
  login: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    maxAttempts: 5,
    keyGenerator: (req: Request) => {
      const ip = req.ip || 'unknown';
      const username = (req.body as any)?.usernameOrEmail || 'unknown';
      return `login:${ip}:${username}`;
    },
    skipSuccessfulRequests: true,
  },

  register: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxAttempts: 3,
    keyGenerator: (req: Request) => {
      const ip = req.ip || 'unknown';
      return `register:${ip}`;
    },
    skipSuccessfulRequests: true,
  },

  refresh: {
    windowMs: 60 * 1000,  // 1 minute
    maxAttempts: 10,
    keyGenerator: (req: Request) => {
      const refreshToken = req.cookies?.refreshToken || 'unknown';
      return `refresh:${refreshToken}`;
    },
  },

  resetPassword: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxAttempts: 3,
    keyGenerator: (req: Request) => {
      const ip = req.ip || 'unknown';
      return `reset-pwd:${ip}`;
    },
    skipSuccessfulRequests: true,
  },

  generalApi: {
    windowMs: 60 * 1000,  // 1 minute
    maxAttempts: 60,
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.id || req.ip || 'unknown';
      return `api:${userId}`;
    },
  },

  metrics: {
    windowMs: 60 * 1000,  // 1 minute
    maxAttempts: 30,  // Allow 30 requests per minute (0.5 per second)
    keyGenerator: (req: Request) => {
      const ip = req.ip || 'unknown';
      return `metrics:${ip}`;
    },
  },
} as const;

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      ip?: string;
      // Add rateLimitInfo if needed
      rateLimit?: RateLimitInfo;
    }
  }
}

// Type imports
import type { Request, Response, NextFunction } from 'express';
