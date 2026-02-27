// API layer: Save/load routes
// Exposes endpoints for game state persistence

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/api/middleware/errorHandler.js';
import { DatabaseService } from '@/infrastructure/database/DatabaseService.js';
import type { IRoom } from '@/domain/index.js';
import { GameStateManager } from '@/application/game/GameStateManager.js';

const router = Router();

const SaveSchema = z.object({
  slotName: z.string().optional(),
  description: z.string().optional(),
});

const LoadSchema = z.object({
  slotName: z.string(),
});

type SaveSlotResponse = {
  slotId?: number;
  slotName: string;
  description: string | null;
  screenshotUrl: string | null;
  isAutoSave: boolean;
  savedAt: string | null;
};

function toIso(value?: number | string | null): string | null {
  if (!value) return null;
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatSlot(slot: {
  id: number;
  saveName: string;
  description?: string | null;
  screenshotUrl?: string | null;
  createdAt: string;
  isAutoSave: boolean;
}): SaveSlotResponse {
  return {
    slotId: slot.id,
    slotName: slot.saveName,
    description: slot.description ?? null,
    screenshotUrl: slot.screenshotUrl ?? null,
    isAutoSave: slot.isAutoSave,
    savedAt: toIso(slot.createdAt),
  };
}

// In-memory room store (shared with other routes)
let getRoomsMap: () => Map<string, IRoom>;

function getRooms(): Map<string, IRoom> {
  if (!getRoomsMap) {
    throw new Error('Rooms map not initialized');
  }
  return getRoomsMap();
}

export function setRoomsMap(getRoomsFn: () => Map<string, IRoom>): void {
  getRoomsMap = getRoomsFn;
}

router.get(
  '/rooms/:roomId',
  asyncHandler(async (req: Request, res: Response) => {
    const { roomId } = req.params;
    const dbService = DatabaseService.getInstance();
    const room = dbService.rooms.getRoomById(roomId);
    if (!room) {
      throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const gameStateManager = new GameStateManager(dbService.gameStates, dbService.rooms);
    const slots = await gameStateManager.listSlots(roomId);
    res.json({ success: true, slots: slots.map((slot) => formatSlot(slot)) });
  })
);

router.post(
  '/rooms/:roomId/save',
  asyncHandler(async (req: Request, res: Response) => {
    const { roomId } = req.params;
    const { slotName, description } = SaveSchema.parse(req.body);
    const targetSlot = slotName?.trim() || 'manual';

    const room = getRooms().get(roomId);
    if (!room) {
      throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    // Include conversation history in game state snapshot
    const gameState = room.getGameState();
    const conversationHistory = room.getConversationHistory();
    const historySnapshot = conversationHistory.getAll ? 
      Array.from(conversationHistory.getAll()) : [];
    
    const stateWithHistory = {
      ...gameState,
      conversationHistory: historySnapshot,
    };

    const dbService = DatabaseService.getInstance();
    const gameStateManager = new GameStateManager(dbService.gameStates, dbService.rooms);
    const result = await gameStateManager.save(roomId, stateWithHistory, targetSlot, description);
    const slots = await gameStateManager.listSlots(roomId);
    const slot = slots.find((s) => s.saveName === targetSlot) ?? null;

    res.json({
      success: true,
      save: {
        slotName: targetSlot,
        description: description ?? slot?.description ?? null,
        isAutoSave: slot?.isAutoSave ?? targetSlot === 'autosave',
        savedAt: toIso(result.savedAt) ?? toIso(slot?.createdAt) ?? null,
        slotId: slot?.id,
        screenshotUrl: slot?.screenshotUrl ?? null,
      },
    });
  })
);

router.post(
  '/rooms/:roomId/load',
  asyncHandler(async (req: Request, res: Response) => {
    const { roomId } = req.params;
    const { slotName } = LoadSchema.parse(req.body);

    const room = getRooms().get(roomId);
    if (!room) {
      throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const dbService = DatabaseService.getInstance();
    const gameStateManager = new GameStateManager(dbService.gameStates, dbService.rooms);
    const result = await gameStateManager.load(roomId, slotName);
    if (!result) {
      throw createError('Save slot not found', 404, 'SAVE_SLOT_NOT_FOUND', {
        roomId,
        slotName,
      });
    }

    const slots = await gameStateManager.listSlots(roomId);
    const slot = slots.find((s) => s.saveName === slotName) ?? null;

    // Restore game state
    room.setGameState(result.state);

    // Restore conversation history if present in save
    if (result.state.conversationHistory && Array.isArray(result.state.conversationHistory)) {
      const conversationHistory = room.getConversationHistory();
      // Clear existing history
      if ('setHistory' in conversationHistory) {
        (conversationHistory as any).setHistory(result.state.conversationHistory);
      } else {
        console.warn('[Load] ConversationHistory does not support setHistory, history not restored');
      }
      console.log(`[Load] Restored ${result.state.conversationHistory.length} conversation turns`);
    } else {
      console.warn('[Load] No conversation history in save slot');
    }
    res.json({
      success: true,
      load: {
        slotName,
        description: slot?.description ?? null,
        isAutoSave: slot?.isAutoSave ?? false,
        savedAt: slot ? toIso(slot.createdAt) : null,
        loadedAt: toIso(result.loadedAt),
        slotId: slot?.id,
        screenshotUrl: slot?.screenshotUrl ?? null,
        state: result.state,
      },
    });
  })
);

router.delete(
  '/rooms/:roomId/:slotName',
  asyncHandler(async (req: Request, res: Response) => {
    const { roomId, slotName } = req.params;

    const room = getRooms().get(roomId);
    if (!room) {
      throw createError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const dbService = DatabaseService.getInstance();
    const gameStateManager = new GameStateManager(dbService.gameStates, dbService.rooms);
    await gameStateManager.deleteSlot(roomId, slotName);

    res.json({ success: true, deleted: { roomId, slotName } });
  })
);

export default router;
