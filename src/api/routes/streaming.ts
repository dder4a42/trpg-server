// API layer: SSE streaming endpoint
// Real-time streaming from LLM to browser via Server-Sent Events

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, createError } from '@/api/middleware/errorHandler.js';
import type { IRoom } from '@/domain/index.js';

const router = Router();

// Store active SSE connections
const sseClients = new Map<string, Response[]>();

// In-memory room store (shared with other routes)
// Will be set via setRoomsMapFunction to enable dynamic lookup
let getRoomsMap: () => Map<string, IRoom>;

// Helper to get rooms map
function getRooms(): Map<string, IRoom> {
  if (!getRoomsMap) {
    throw new Error('Rooms map not initialized');
  }
  return getRoomsMap();
}

// ========== SSE Streaming Routes ==========

// SSE endpoint for streaming room actions
router.get(
  '/rooms/:roomId/stream',
  asyncHandler(async (req: Request, res: Response) => {
    const { roomId } = req.params;

    // Verify room exists
    const room = getRooms().get(roomId);
    if (!room) {
      throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection message
    res.write(`event: connected\ndata: {"roomId":"${roomId}"}\n\n`);

    // Store the response for later use
    if (!sseClients.has(roomId)) {
      sseClients.set(roomId, []);
    }
    sseClients.get(roomId)!.push(res);

    // Send keepalive every 30 seconds
    const keepalive = setInterval(() => {
      res.write(`: keepalive\n\n`);
    }, 30000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(keepalive);
      const clients = sseClients.get(roomId);
      if (clients) {
        const idx = clients.indexOf(res);
        if (idx > -1) {
          clients.splice(idx, 1);
        }
        if (clients.length === 0) {
          sseClients.delete(roomId);
        }
      }
    });
  })
);

// WebSocket upgrade endpoint (alternative to SSE)
router.get('/rooms/:roomId/ws', (req: Request, res: Response) => {
  // This would require a WebSocket server
  // For now, we'll use SSE which is simpler
  res.json({
    message: 'WebSocket not implemented. Use SSE endpoint instead.',
    sseUrl: `/api/stream/rooms/${req.params.roomId}/stream`,
  });
});

// ========== Helper Functions ==========

/**
 * Send a message to all SSE clients in a room
 */
export function broadcastToRoom(
  roomId: string,
  event: string,
  data: Record<string, unknown>
): void {
  const clients = sseClients.get(roomId);
  if (!clients || clients.length === 0) {
    console.log(`[SSE] No clients for room ${roomId}`);
    return;
  }

  console.log(`[SSE] Broadcasting to ${clients.length} clients in room ${roomId}, event: ${event}`, data);

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  console.log(`[SSE] Broadcasting ${event} to room ${roomId} (${clients.length} clients)`);

  for (const client of [...clients]) {
    try {
      client.write(message);
    } catch (error) {
      // Remove dead client
      const idx = clients.indexOf(client);
      if (idx > -1) {
        clients.splice(idx, 1);
      }
    }
  }
}

/**
 * Stream LLM response to room for single player input
 */
export async function* streamLLMToRoom(
  roomId: string,
  input: string
): AsyncGenerator<string> {
  const room = getRooms().get(roomId);
  if (!room) {
    throw new Error(`Room ${roomId} not found`);
  }

  // Get the stream from the room
  const stream = room.streamProcessPlayerInput(input);

  // Yield chunks and also broadcast to SSE clients
  for await (const chunk of stream) {
    broadcastToRoom(roomId, 'message', { chunk });
    yield chunk;
  }

  // Send completion event
  broadcastToRoom(roomId, 'done', { timestamp: Date.now() });
}

/**
 * Stream LLM response to room for combined player actions
 */
export async function* streamCombinedLLMToRoom(
  roomId: string
): AsyncGenerator<string> {
  const room = getRooms().get(roomId);
  if (!room) {
    throw new Error(`Room ${roomId} not found`);
  }

  // Subscribe to game events
  const gameEventHandler = (event: any) => {
    if (event.type === 'dice_roll') {
      broadcastToRoom(roomId, 'message', {
        type: 'dice-roll',
        data: event.data,
      });
    } else if (event.type === 'action_restriction') {
      broadcastToRoom(roomId, 'message', {
        type: 'action-restriction',
        allowedCharacterIds: event.allowedCharacterIds,
        reason: event.reason,
      });
    }
  };

  room.getEventEmitter().on('game-event', gameEventHandler);

  // Get the stream from the room
  const stream = room.streamProcessCombinedPlayerActions();

  // Yield chunks and also broadcast to SSE clients
  for await (const chunk of stream) {
    broadcastToRoom(roomId, 'message', { chunk });
    yield chunk;
  }

  // Unsubscribe from events
  room.getEventEmitter().off('game-event', gameEventHandler);

  // Send completion event
  broadcastToRoom(roomId, 'done', { timestamp: Date.now() });
  // Signal turn end so all connected clients refresh their status panel
  broadcastToRoom(roomId, 'message', { type: 'turn_end', timestamp: Date.now() });
}

/**
 * Broadcast chat message to all clients in a room
 */
export function broadcastChatMessage(
  roomId: string,
  message: {
    id: string;
    playerId: string;
    playerName: string;
    message: string;
    timestamp: number;
    type: 'chat' | 'system';
  }
): void {
  broadcastToRoom(roomId, 'chat', message);
}

// Set rooms reference (called from main app)
export function setRoomsMap(getRoomsFn: () => Map<string, IRoom>): void {
  getRoomsMap = getRoomsFn;
}

export default router;
