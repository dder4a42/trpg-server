// API Middleware: Admin authorization
// Protects admin routes by checking ADMIN_USERNAME environment variable
import { isAdmin } from './auth.js';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
/**
 * Require admin access middleware
 * Redirects to login if not authenticated, returns 403 if not admin
 */
export function requireAdmin(req, res, next) {
    const user = req.user;
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
