// API Middleware: Admin authorization
// Protects admin routes by checking ADMIN_USERNAME environment variable

import type { Request, Response, NextFunction } from 'express';
import type { User } from '@/domain/user/types.js';
import { isAdmin } from './auth.js';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;

/**
 * Require admin access middleware
 * Redirects to login if not authenticated, returns 403 if not admin
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = (req as Request & { user?: User }).user;

  // Not authenticated
  if (!user) {
    res.redirect('/login');
    return;
  }

  // Not admin
  if (!isAdmin(user)) {
    res.status(403).render('error', {
      title: 'Access Denied',
      message: 'Admin access required.',
    });
    return;
  }

  next();
}

/**
 * Check if user is admin (for use in templates/routes)
 */
export { isAdmin };
