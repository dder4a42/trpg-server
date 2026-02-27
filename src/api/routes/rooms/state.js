// API layer: Room state routes
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/api/middleware/errorHandler.js';
import { getRoomsMapRef } from './store.js';
const router = Router();
const SaveGameSchema = z.object({
    roomId: z.string(),
});
const LoadGameSchema = z.object({
    roomId: z.string(),
    saveName: z.string().optional(),
});
// Save game
router.post('/save', asyncHandler(async (req, res) => {
    const { roomId } = SaveGameSchema.parse(req.body);
    const rooms = getRoomsMapRef()();
    const room = rooms.get(roomId);
    if (!room) {
        throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    await room.save();
    res.json({
        success: true,
        roomId,
        savedAt: new Date().toISOString(),
    });
}));
// Load game
router.post('/load', asyncHandler(async (req, res) => {
    const { roomId } = LoadGameSchema.parse(req.body);
    const rooms = getRoomsMapRef()();
    const room = rooms.get(roomId);
    if (!room) {
        throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    await room.load();
    res.json({
        success: true,
        roomId,
        loadedAt: new Date().toISOString(),
    });
}));
// List active rooms (admin/debug)
router.get('/list', (_req, res) => {
    const rooms = getRoomsMapRef()();
    const roomList = Array.from(rooms.entries()).map(([id, room]) => ({
        id,
        createdAt: room.state.createdAt.toISOString(),
        lastActivityAt: room.state.lastActivityAt.toISOString(),
        isActive: room.state.isActive,
    }));
    res.json({
        success: true,
        count: roomList.length,
        rooms: roomList,
    });
});
// Close room
router.post('/close', asyncHandler(async (req, res) => {
    const schema = z.object({ roomId: z.string() });
    const { roomId } = schema.parse(req.body);
    const rooms = getRoomsMapRef()();
    const room = rooms.get(roomId);
    if (!room) {
        throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    await room.close();
    rooms.delete(roomId);
    res.json({
        success: true,
        roomId,
        message: 'Room closed successfully',
    });
}));
export const stateRoutes = router;
