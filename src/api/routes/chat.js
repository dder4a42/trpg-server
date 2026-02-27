// API layer: Chat routes
// Real-time player-to-player chat within rooms
import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, createError } from '@/api/middleware/errorHandler.js';
import { DatabaseService } from '@/infrastructure/database/DatabaseService.js';
const router = Router();
// Validation schemas
const SendMessageSchema = z.object({
    message: z.string().min(1).max(1000).trim(),
});
// In-memory room store (shared with other routes)
// This will be set via setRoomReferences
let getRoomsMap;
let broadcastFn;
async function requireAuth(req, res, next) {
    const sessionId = req.cookies?.sessionId || req.headers.authorization?.slice(7);
    if (!sessionId) {
        throw createError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    const dbService = DatabaseService.getInstance();
    const session = await dbService.userSessions.findById(sessionId);
    if (!session) {
        throw createError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    if (session.expiresAt < new Date()) {
        await dbService.userSessions.delete(sessionId);
        throw createError('Session expired', 401, 'SESSION_EXPIRED');
    }
    const user = await dbService.users.findById(session.userId);
    if (!user || !user.isActive) {
        throw createError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    req.user = user;
    req.sessionId = sessionId;
    next();
}
function getRoomOr404(roomId) {
    const rooms = getRoomsMap();
    const room = rooms.get(roomId);
    if (!room) {
        throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    return room;
}
// ========== Chat Routes ==========
/**
 * GET /api/chat/rooms/:roomId/messages
 * Get recent chat messages for a room
 */
router.get('/rooms/:roomId/messages', requireAuth, asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    const room = getRoomOr404(roomId);
    const roomChat = room.getRoomChat();
    if (!roomChat) {
        res.json({
            success: true,
            messages: [],
        });
        return;
    }
    const messages = roomChat.getMessages(limit);
    res.json({
        success: true,
        messages,
        count: messages.length,
    });
}));
/**
 * POST /api/chat/rooms/:roomId/send
 * Send a chat message to a room
 */
router.post('/rooms/:roomId/send', requireAuth, asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    // Get user from session (attached by auth middleware)
    const user = req.user;
    if (!user) {
        throw createError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    // Validate request body
    const { message } = SendMessageSchema.parse(req.body);
    // Get room and chat
    const room = getRoomOr404(roomId);
    const roomChat = room.getRoomChat();
    if (!roomChat) {
        throw createError('Chat not available in this room', 400, 'CHAT_NOT_AVAILABLE');
    }
    // Send message
    const chatMessage = roomChat.sendMessage({
        playerId: user.id,
        playerName: user.username,
        message,
    });
    // Broadcast to all clients in the room
    broadcastFn(roomId, {
        id: chatMessage.id,
        playerId: chatMessage.playerId,
        playerName: chatMessage.playerName,
        message: chatMessage.message,
        timestamp: chatMessage.timestamp.getTime(),
        type: chatMessage.type,
    });
    // Add system notification if user joined
    const messageCount = roomChat.getMessageCount();
    if (messageCount === 1) {
        const joinMessage = roomChat.addSystemMessage(`${user.username} joined the chat`);
        broadcastFn(roomId, {
            id: joinMessage.id,
            playerId: joinMessage.playerId,
            playerName: joinMessage.playerName,
            message: joinMessage.message,
            timestamp: joinMessage.timestamp.getTime(),
            type: joinMessage.type,
        });
    }
    res.json({
        success: true,
        message: chatMessage,
    });
}));
/**
 * DELETE /api/chat/rooms/:roomId/messages
 * Clear all chat messages (admin/room owner only)
 */
router.delete('/rooms/:roomId/messages', requireAuth, asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    // Get user from session
    const user = req.user;
    if (!user) {
        throw createError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    const room = getRoomOr404(roomId);
    const roomChat = room.getRoomChat();
    if (!roomChat) {
        throw createError('Chat not available in this room', 400, 'CHAT_NOT_AVAILABLE');
    }
    // Clear messages
    roomChat.clear();
    // Broadcast clear event
    broadcastFn(roomId, {
        id: uuidv4(),
        playerId: 'system',
        playerName: 'System',
        message: 'Chat cleared',
        timestamp: Date.now(),
        type: 'system',
    });
    res.json({
        success: true,
        message: 'Chat messages cleared',
    });
}));
// ========== Setup Functions ==========
/**
 * Set room references (called from main app)
 */
export function setChatReferences(getRoomsFn, broadcast) {
    getRoomsMap = getRoomsFn;
    broadcastFn = broadcast;
}
export default router;
