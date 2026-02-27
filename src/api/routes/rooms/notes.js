// API layer: Room notes routes
import { Router } from 'express';
import { asyncHandler, createError } from '@/api/middleware/errorHandler.js';
import { broadcastToRoom } from '../streaming.js';
import { getRoomsMapRef } from './store.js';
const router = Router();
// Get player notes
router.get('/:roomId/notes', asyncHandler(async (req, res) => {
    if (!req.user) {
        throw createError('Authentication required', 401, 'AUTH_REQUIRED');
    }
    const { roomId } = req.params;
    const rooms = getRoomsMapRef()();
    const room = rooms.get(roomId);
    if (!room) {
        throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    const notes = await room.getPlayerNotes(req.user.id);
    res.json({ success: true, notes });
}));
// Add player note
router.post('/:roomId/notes', asyncHandler(async (req, res) => {
    if (!req.user) {
        throw createError('Authentication required', 401, 'AUTH_REQUIRED');
    }
    const { roomId } = req.params;
    const { note } = req.body;
    if (!note || note.trim() === '') {
        return res.status(400).json({ success: false, error: 'Note cannot be empty' });
    }
    if (note.length > 200) {
        return res.status(400).json({ success: false, error: 'Note too long' });
    }
    const rooms = getRoomsMapRef()();
    const room = rooms.get(roomId);
    if (!room) {
        throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    const created = await room.addPlayerNote(req.user.id, note.trim());
    const notes = await room.getPlayerNotes(req.user.id);
    broadcastToRoom(roomId, 'player-note-added', {
        userId: req.user.id,
        username: req.user.username,
        noteId: created.id,
        content: created.content,
        createdAt: created.createdAt,
    });
    res.json({ success: true, notes });
}));
// Delete player note
router.delete('/:roomId/notes/:noteId', asyncHandler(async (req, res) => {
    if (!req.user) {
        throw createError('Authentication required', 401, 'AUTH_REQUIRED');
    }
    const { roomId, noteId } = req.params;
    const rooms = getRoomsMapRef()();
    const room = rooms.get(roomId);
    if (!room) {
        throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    try {
        await room.deletePlayerNote(req.user.id, noteId);
        const notes = await room.getPlayerNotes(req.user.id);
        broadcastToRoom(roomId, 'player-note-deleted', {
            userId: req.user.id,
            username: req.user.username,
            noteId,
        });
        res.json({ success: true, notes });
    }
    catch (error) {
        return res.status(404).json({ success: false, error: 'Invalid note id' });
    }
}));
export const notesRoutes = router;
