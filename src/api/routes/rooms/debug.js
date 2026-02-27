// API layer: Room debug routes
import { Router } from 'express';
import { asyncHandler, createError } from '@/api/middleware/errorHandler.js';
import { getRoomsMapRef } from './store.js';
const router = Router();
// Context debug endpoint
router.get('/:roomId/context-debug', asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const rooms = getRoomsMapRef()();
    const room = rooms.get(roomId);
    if (!room) {
        throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    const contextBuilder = room.contextBuilder;
    const gameState = room.gameState;
    if (!contextBuilder || !gameState) {
        throw createError('Context system not initialized', 500, 'CONTEXT_NOT_READY');
    }
    const snapshot = contextBuilder.getContextSnapshot();
    const fullContext = await contextBuilder.build(gameState);
    res.json({ snapshot, fullContext });
}));
export const debugRoutes = router;
