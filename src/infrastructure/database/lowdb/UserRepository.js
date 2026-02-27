// User Repository - LowDB implementation
// Handles user CRUD and authentication with JSON file storage
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
export class UserRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Create a new user
     */
    async create(data) {
        const id = uuidv4();
        const newUser = {
            id,
            username: data.username,
            password_hash: data.passwordHash,
            email: data.email ?? null,
            created_at: new Date().toISOString(),
            last_login: null,
            is_active: 1,
        };
        this.db.getData().users.push(newUser);
        await this.db.write();
        return this.rowToUser(newUser);
    }
    /**
     * Get user by ID
     */
    async findById(id) {
        const user = this.db.getData().users.find((u) => u.id === id);
        return user ? this.rowToUser(user) : null;
    }
    /**
     * Get user by username
     */
    async findByUsername(username) {
        const user = this.db.getData().users.find((u) => u.username.toLowerCase() === username.toLowerCase());
        return user ? this.rowToUser(user) : null;
    }
    /**
     * Get user by email
     */
    async findByEmail(email) {
        const user = this.db.getData().users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        return user ? this.rowToUser(user) : null;
    }
    /**
     * Find by username OR email
     */
    async findByUsernameOrEmail(usernameOrEmail) {
        // Check if it looks like an email
        if (usernameOrEmail.includes('@')) {
            return this.findByEmail(usernameOrEmail);
        }
        return this.findByUsername(usernameOrEmail);
    }
    /**
     * Update user
     */
    async update(id, updates) {
        const data = this.db.getData();
        const user = data.users.find((u) => u.id === id);
        if (!user)
            return false;
        if (updates.email !== undefined) {
            user.email = updates.email ?? null;
        }
        if (updates.passwordHash !== undefined) {
            user.password_hash = updates.passwordHash;
        }
        if (updates.isActive !== undefined) {
            user.is_active = updates.isActive ? 1 : 0;
        }
        await this.db.write();
        return true;
    }
    /**
     * Delete user
     */
    async delete(id) {
        const data = this.db.getData();
        const idx = data.users.findIndex((u) => u.id === id);
        if (idx === -1)
            return false;
        data.users.splice(idx, 1);
        await this.db.write();
        return true;
    }
    /**
     * Activate user account
     */
    async activate(id) {
        return this.update(id, { isActive: true });
    }
    /**
     * Deactivate user account
     */
    async deactivate(id) {
        return this.update(id, { isActive: false });
    }
    /**
     * Count total users
     */
    async count() {
        return this.db.getData().users.length;
    }
    /**
     * Count active users
     */
    async countActive() {
        return this.db.getData().users.filter((u) => u.is_active === 1).length;
    }
    /**
     * List all users (for admin dashboard)
     */
    async listAll() {
        const data = this.db.getData();
        return data.users.map((u) => this.rowToUser(u));
    }
    /**
     * Get user statistics
     */
    getStats() {
        const data = this.db.getData();
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        let activeUsers = 0;
        let newUsersThisWeek = 0;
        for (const user of data.users) {
            if (user.is_active === 1) {
                activeUsers += 1;
            }
            const createdAt = Date.parse(user.created_at);
            if (!Number.isNaN(createdAt) && createdAt >= weekAgo) {
                newUsersThisWeek += 1;
            }
        }
        return {
            totalUsers: data.users.length,
            activeUsers,
            newUsersThisWeek,
        };
    }
    /**
     * Verify password
     */
    async verifyPassword(user, password) {
        return bcrypt.compare(password, user.passwordHash);
    }
    /**
     * Change password
     */
    async changePassword(id, newPassword) {
        const passwordHash = await bcrypt.hash(newPassword, 10);
        return this.update(id, { passwordHash });
    }
    /**
     * Check if username exists
     */
    async usernameExists(username) {
        return this.db
            .getData()
            .users.some((u) => u.username.toLowerCase() === username.toLowerCase());
    }
    /**
     * Check if email exists
     */
    async emailExists(email) {
        return this.db
            .getData()
            .users.some((u) => u.email?.toLowerCase() === email.toLowerCase());
    }
    rowToUser(row) {
        return {
            id: row.id,
            username: row.username,
            email: row.email ?? undefined,
            passwordHash: row.password_hash,
            createdAt: new Date(row.created_at),
            lastLoginAt: row.last_login ? new Date(row.last_login) : null,
            isActive: row.is_active === 1,
        };
    }
}
