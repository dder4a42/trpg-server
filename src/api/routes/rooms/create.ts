// API layer: Room creation routes

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, createError } from '@/api/middleware/errorHandler.js';
import { Room } from '@/application/room/Room.js';
import { RoomFactory } from '@/infrastructure/room/RoomFactory.js';
import { getRoomsMapInstance } from './store.js';

const router = Router();

const CreateRoomSchema = z.object({
  requestId: z.string().optional(),
  moduleName: z.string().optional(),
});

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create room
router.post(
  '/create',
  asyncHandler(async (req: Request, res: Response) => {
    const { requestId, moduleName } = CreateRoomSchema.parse(req.body);

    const roomId = requestId || uuidv4();
    const rooms = getRoomsMapInstance();

    if (rooms.has(roomId)) {
      throw createError('Room already exists', 409, 'ROOM_EXISTS');
    }

    const deps = RoomFactory.createDependencies();
    const room = new Room(
      roomId,
      {
        maxPlayers: 4,
        maxHistoryTurns: 10,
        moduleName,
      },
      deps
    );

    await room.initialize();
    rooms.set(roomId, room);

    res.status(201).json({
      success: true,
      roomId,
      createdAt: room.state.createdAt.toISOString(),
    });
  })
);

export const createRoutes = router;
