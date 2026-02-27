// API layer: Room action routes
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/api/middleware/errorHandler.js';
import { setupStreaming, writeChunk, endStream } from '@/api/middleware/streaming.js';
import { DatabaseService } from '@/infrastructure/database/DatabaseService.js';
import { broadcastToRoom } from '../streaming.js';
import { getRoomsMapRef } from './store.js';
const router = Router();
const ActionSchema = z.object({
    roomId: z.string(),
    input: z.string().min(1),
    stream: z.boolean().default(false),
    userId: z.string().optional(),
    username: z.string().optional(),
    characterId: z.string().optional(),
});
const CollectActionSchema = z.object({
    roomId: z.string(),
    userId: z.string(),
    username: z.string(),
    action: z.string().min(1),
    characterId: z.string().optional(),
});
const ProcessCombinedActionsSchema = z.object({
    roomId: z.string(),
    stream: z.boolean().default(false),
});
// Collect player action
router.post('/collect-action', asyncHandler(async (req, res) => {
    const { roomId, userId, username, action, characterId } = CollectActionSchema.parse(req.body);
    const rooms = getRoomsMapRef()();
    const room = rooms.get(roomId);
    if (!room) {
        throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    if (!room.state.isActive) {
        throw createError('Room is not active', 400, 'ROOM_INACTIVE');
    }
    await room.addPlayerAction(userId, username, action, characterId);
    const currentActions = room.getCurrentPlayerActions();
    const hasAllActed = await room.hasAllPlayersActed();
    const isHtmx = req.headers['hx-request'] === 'true';
    const isFetchHtml = req.headers['x-requested-with'] === 'XMLHttpRequest';
    if (isHtmx || isFetchHtml) {
        let characterName = '';
        if (characterId) {
            const dbService = DatabaseService.getInstance();
            const character = dbService.characters.findById(characterId);
            if (character) {
                characterName = character.name;
            }
        }
        const html = `
        <div class="message user">
          <div class="message-header">${characterName ? `${characterName}(${username})` : username}</div>
          <div class="message-content">${action.replace(/\n/g, '<br>')}</div>
        </div>
      `;
        if (hasAllActed) {
            const responseId = `streaming-response-${Date.now()}`;
            const dmHtml = `
          <div class="message assistant">
            <div class="message-header">DM</div>
            <div class="message-content" id="${responseId}">
              <span class="streaming-indicator">Thinking...</span>
            </div>
          </div>
        `;
            res.setHeader('Content-Type', 'text/html');
            res.send(html + dmHtml);
            setImmediate(async () => {
                try {
                    const gameEventHandler = (event) => {
                        if (event.type === 'dice_roll') {
                            broadcastToRoom(roomId, 'message', {
                                type: 'dice-roll',
                                data: event.data,
                            });
                        }
                        else if (event.type === 'action_restriction') {
                            broadcastToRoom(roomId, 'message', {
                                type: 'action-restriction',
                                allowedCharacterIds: event.allowedCharacterIds,
                                reason: event.reason,
                            });
                        }
                    };
                    room.getEventEmitter().on('game-event', gameEventHandler);
                    const stream = room.streamProcessCombinedPlayerActions();
                    let fullResponse = '';
                    let chunkCount = 0;
                    for await (const chunk of stream) {
                        chunkCount++;
                        fullResponse += chunk;
                        broadcastToRoom(roomId, 'message', {
                            type: 'streaming-chunk',
                            content: chunk,
                        });
                    }
                    room.getEventEmitter().off('game-event', gameEventHandler);
                    console.log(`[Streaming] Complete. Total chunks: ${chunkCount}, Total length: ${fullResponse.length}`);
                    broadcastToRoom(roomId, 'message', {
                        type: 'streaming-complete',
                        content: fullResponse,
                    });
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[Streaming] Error:', error);
                    broadcastToRoom(roomId, 'message', {
                        type: 'streaming-error',
                        error: errorMessage,
                    });
                }
            });
            return;
        }
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
    }
    res.json({
        success: true,
        roomId,
        actionCount: currentActions.length,
        hasAllActed,
        timestamp: new Date().toISOString(),
    });
}));
// Process combined player actions
router.post('/process-actions', asyncHandler(async (req, res) => {
    const { roomId, stream } = ProcessCombinedActionsSchema.parse(req.body);
    const rooms = getRoomsMapRef()();
    const room = rooms.get(roomId);
    if (!room) {
        throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    if (!room.state.isActive) {
        throw createError('Room is not active', 400, 'ROOM_INACTIVE');
    }
    const isHtmx = req.headers['hx-request'] === 'true';
    if (stream) {
        setupStreaming(res, { contentType: 'text/plain; charset=utf-8' });
        try {
            for await (const chunk of room.streamProcessCombinedPlayerActions()) {
                writeChunk(res, chunk);
            }
            endStream(res);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            writeChunk(res, `\n[Error: ${errorMessage}]`);
            endStream(res);
        }
        return;
    }
    if (isHtmx) {
        const response = await room.processCombinedPlayerActions();
        const html = `
        <div class="message assistant">
          <div class="message-header">DM</div>
          <div class="message-content">${response.replace(/\n/g, '<br>')}</div>
        </div>
      `;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
    }
    const response = await room.processCombinedPlayerActions();
    res.json({
        success: true,
        roomId,
        response,
        timestamp: new Date().toISOString(),
    });
}));
// Process action (with optional streaming)
router.post('/action', asyncHandler(async (req, res) => {
    const { roomId, input, stream, userId, username, characterId } = ActionSchema.parse(req.body);
    const rooms = getRoomsMapRef()();
    const room = rooms.get(roomId);
    if (!room) {
        throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    if (!room.state.isActive) {
        throw createError('Room is not active', 400, 'ROOM_INACTIVE');
    }
    const isHtmx = req.headers['hx-request'] === 'true';
    if (stream) {
        setupStreaming(res, { contentType: 'text/plain; charset=utf-8' });
        try {
            for await (const chunk of room.streamProcessPlayerInput(input, userId, username, characterId)) {
                writeChunk(res, chunk);
            }
            endStream(res);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            writeChunk(res, `\n[Error: ${errorMessage}]`);
            endStream(res);
        }
        return;
    }
    if (isHtmx) {
        const response = await room.processPlayerInput(input, userId, username, characterId);
        let characterName = '';
        if (characterId) {
            const dbService = DatabaseService.getInstance();
            const character = dbService.characters.findById(characterId);
            if (character) {
                characterName = character.name;
            }
        }
        const html = `
        <div class="message user">
          <div class="message-header">${characterName ? `${characterName}(${username})` : (username || 'You')}</div>
          <div class="message-content">${input.replace(/\n/g, '<br>')}</div>
        </div>
        <div class="message assistant">
          <div class="message-header">DM</div>
          <div class="message-content">${response.replace(/\n/g, '<br>')}</div>
        </div>
      `;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
    }
    const response = await room.processPlayerInput(input, userId, username, characterId);
    res.json({
        success: true,
        roomId,
        response,
        timestamp: new Date().toISOString(),
    });
}));
export const actionRoutes = router;
