// Application layer: GameStateManager
// Handles save/load orchestration for GameState

import type { GameState } from '@/domain/game/GameState.js';
import type { GameStateRepository } from '@/infrastructure/database/lowdb/GameStateRepository.js';
import type { RoomRepository } from '@/infrastructure/database/lowdb/RoomRepository.js';

export interface SaveResult {
  slotName: string;
  description?: string;
  savedAt: number;
}

export interface LoadResult {
  slotName: string;
  state: GameState;
  loadedAt: number;
}

export class GameStateManager {
  constructor(
    private gameStateRepo: GameStateRepository,
    private roomRepo: RoomRepository
  ) {}

  async save(roomId: string, state: GameState, slotName = 'autosave', description?: string): Promise<SaveResult> {
    await this.gameStateRepo.saveState(roomId, slotName, state);
    await this.roomRepo.upsertSaveSlot(roomId, slotName, description, slotName === 'autosave');
    return { slotName, description, savedAt: Date.now() };
  }

  async load(roomId: string, slotName: string): Promise<LoadResult | null> {
    const state = await this.gameStateRepo.loadState(roomId, slotName);
    if (!state) return null;
    return { slotName, state, loadedAt: Date.now() };
  }

  async listSlots(roomId: string) {
    return this.roomRepo.listSaveSlots(roomId);
  }

  async deleteSlot(roomId: string, slotName: string): Promise<void> {
    await this.gameStateRepo.deleteState(roomId, slotName);
    await this.roomRepo.deleteSaveSlotByName(roomId, slotName);
  }
}
