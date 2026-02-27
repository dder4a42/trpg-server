// API layer: Admin dashboard routes
// Provides admin functionality for managing users, rooms, and characters
import { Router } from 'express';
import { asyncHandler } from '@/api/middleware/errorHandler.js';
import { DatabaseService } from '@/infrastructure/database/DatabaseService.js';
import { requireAdmin } from '@/api/middleware/admin.js';
import { promises as fs } from 'fs';
const router = Router();
// Helper function to format bytes to human-readable size
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
// Helper function to get database file size
async function getDatabaseSize() {
    try {
        const dbPath = process.env.DB_PATH || './data/trpg.db';
        const stats = await fs.stat(dbPath);
        return formatBytes(stats.size);
    }
    catch {
        return 'Unknown';
    }
}
// Auth middleware applied at app level (app.ts)
// Admin middleware handles admin verification
router.use(requireAdmin);
// ========== Dashboard Routes ==========
// GET /admin - Main dashboard
router.get('/', asyncHandler(async (_req, res) => {
    const db = DatabaseService.getInstance();
    const userStats = db.users.getStats();
    const roomStats = db.rooms.getStats();
    const charResult = db.characters.list({ limit: 1 });
    const dbSize = await getDatabaseSize();
    const dbPath = process.env.DB_PATH || './data/trpg.json';
    const stats = {
        users: {
            total: userStats.totalUsers,
            active: userStats.activeUsers,
            newThisWeek: userStats.newUsersThisWeek,
        },
        rooms: {
            totalRooms: roomStats.totalRooms,
            activeRooms: roomStats.activeRooms,
            totalSaves: roomStats.totalSaves,
        },
        characters: charResult.total,
        databaseSize: dbSize,
        databasePath: dbPath,
    };
    res.render('admin/index', { stats });
}));
// ========== User Management Routes ==========
// GET /admin/users - User management page
router.get('/users', asyncHandler(async (_req, res) => {
    const db = DatabaseService.getInstance();
    const users = await db.users.listAll();
    res.render('admin/users', { users });
}));
// POST /admin/users/:id/deactivate - Deactivate user
router.post('/users/:id/deactivate', asyncHandler(async (req, res) => {
    const db = DatabaseService.getInstance();
    await db.users.deactivate(req.params.id);
    res.redirect('/admin/users');
}));
// POST /admin/users/:id/activate - Activate user
router.post('/users/:id/activate', asyncHandler(async (req, res) => {
    const db = DatabaseService.getInstance();
    await db.users.activate(req.params.id);
    res.redirect('/admin/users');
}));
// GET /admin/users/:id - User details
router.get('/users/:id', asyncHandler(async (req, res) => {
    const db = DatabaseService.getInstance();
    const user = await db.users.findById(req.params.id);
    if (!user) {
        return res.status(404).render('error', {
            title: 'User Not Found',
            message: 'The requested user could not be found.',
        });
    }
    // Get user's characters
    const userCharacters = db.characters.list({ userId: user.id, limit: 50 });
    res.render('admin/user-details', { user, characters: userCharacters.characters });
}));
// ========== Room Management Routes ==========
// GET /admin/rooms - Room management page
router.get('/rooms', asyncHandler(async (_req, res) => {
    const db = DatabaseService.getInstance();
    const rooms = db.rooms.listRooms();
    res.render('admin/rooms', { rooms });
}));
// POST /admin/rooms/:id/close - Close room
router.post('/rooms/:id/close', asyncHandler(async (req, res) => {
    const db = DatabaseService.getInstance();
    await db.rooms.closeRoom(req.params.id);
    res.redirect('/admin/rooms');
}));
// POST /admin/rooms/:id/delete - Delete room
router.post('/rooms/:id/delete', asyncHandler(async (req, res) => {
    const db = DatabaseService.getInstance();
    await db.rooms.deleteRoom(req.params.id);
    res.redirect('/admin/rooms');
}));
// GET /admin/rooms/:id - Room details
router.get('/rooms/:id', asyncHandler(async (req, res) => {
    const db = DatabaseService.getInstance();
    const room = db.rooms.getRoomById(req.params.id);
    if (!room) {
        return res.status(404).render('error', {
            title: 'Room Not Found',
            message: 'The requested room could not be found.',
        });
    }
    // Get room members
    const members = await db.roomMemberships.getRoomMembers(room.id);
    // Get conversation turns count
    const turnCount = db.conversations.countTurns(room.id);
    // Get save slots
    const saveSlots = db.rooms.listSaveSlots(room.id);
    res.render('admin/room-details', { room, members, turnCount, saveSlots });
}));
// ========== Character Management Routes ==========
// GET /admin/characters - Character management page
router.get('/characters', asyncHandler(async (_req, res) => {
    const db = DatabaseService.getInstance();
    const result = db.characters.list({ limit: 100 });
    res.render('admin/characters', { characters: result.characters });
}));
// POST /admin/characters/:id/delete - Delete character
router.post('/characters/:id/delete', asyncHandler(async (req, res) => {
    const db = DatabaseService.getInstance();
    await db.characters.delete(req.params.id);
    res.redirect('/admin/characters');
}));
export default router;
