// API layer: Room member management routes
// Provides endpoints for joining/leaving rooms and listing members

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/api/middleware/errorHandler.js';
import type { User } from '@/domain/user/types.js';
import { DatabaseService } from '@/infrastructure/database/DatabaseService.js';
import type { IRoom } from '@/domain/index.js';
import { getRoomsMap } from './web.js';
import { broadcastToRoom as broadcast } from './streaming.js';

// ========== Request Schemas ==========

const JoinRoomSchema = z.object({
  characterId: z.string().optional(),
});

// ========== Helper Types ==========

interface AuthenticatedRequest extends Request {
  user?: User;
}

// ========== Helper Functions ==========

// Room lookup - shared with rooms.ts
const getRoomOr404 = (roomId: string): IRoom | {
  throw(): never;
} => {
  const rooms = getRoomsMap();
  const room = rooms.get(roomId);

  if (!room) {
    throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
  }

  return room;
};

// ========== Routes ==========

const router = Router();

/**
 * GET /api/rooms/:roomId/members
 * Get all members in a room
 */
router.get(
  '/:roomId/members',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { roomId } = req.params;

    const room = getRoomOr404(roomId) as IRoom;

    const members = await room.getMembers();
    const memberCount = await room.getMemberCount();

    res.json({
      success: true,
      roomId,
      members,
      count: memberCount,
      maxPlayers: room.state.config.maxPlayers,
    });
  })
);

/**
 * POST /api/rooms/:roomId/join
 * Join a room (with optional character selection)
 */
router.post(
  '/:roomId/join',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { roomId } = req.params;
    const { characterId } = JoinRoomSchema.parse(req.body);

    if (!req.user) {
      throw createError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const room = getRoomOr404(roomId) as IRoom;
    const dbService = DatabaseService.getInstance();

    // Check max players limit
    const memberCount = await dbService.roomMemberships.getActiveMemberCount(roomId);
    if (memberCount >= room.state.config.maxPlayers) {
      throw createError(
        'Room is full',
        403,
        'ROOM_FULL'
      );
    }

    // Check if already member
    const isAlreadyMember = await dbService.roomMemberships.isUserInRoom(
      roomId,
      req.user.id
    );

    if (isAlreadyMember) {
      throw createError('Already in room', 400, 'ALREADY_IN_ROOM');
    }

    // Join room
    await dbService.roomMemberships.joinRoom(roomId, req.user.id, characterId);

    // Broadcast join event
    const members = await room.getMembers();
    broadcast(roomId, 'members-updated', {
      roomId,
      members,
      count: members.length,
    });

    res.json({
      success: true,
      roomId,
      message: 'Joined room successfully',
    });
  })
);

/**
 * POST /api/rooms/:roomId/leave
 * Leave a room
 */
router.post(
  '/:roomId/leave',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { roomId } = req.params;

    if (!req.user) {
      throw createError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const dbService = DatabaseService.getInstance();

    const success = await dbService.roomMemberships.leaveRoom(roomId, req.user.id);

    if (!success) {
      throw createError('Not in room', 400, 'NOT_IN_ROOM');
    }

    // Broadcast leave event
    const rooms = getRoomsMap();
    const room = rooms.get(roomId);
    if (room) {
      const members = await room.getMembers();
      broadcast(roomId, 'members-updated', {
        roomId,
        members,
        count: members.length,
      });
    }

    res.json({
      success: true,
      roomId,
      message: 'Left room successfully',
    });
  })
);

export default router;
