// Infrastructure layer: GameState repository using LowDB
// Handles persistence of game state for save/load functionality

import type { GameState } from '@/domain/game/GameState.js';
import type { DatabaseConnection, GameStateRecord, CharacterStateRecord } from './connection.js';

/**
 * Repository for game state persistence
 * Handles saving and loading complete game states
 */
export class GameStateRepository {
  constructor(private db: DatabaseConnection) {}

  /**
   * Save a game state to a specific slot
   * @param roomId - Room identifier
   * @param slotName - Save slot name (e.g., "autosave", "slot1")
   * @param state - Game state to save
   */
  async saveState(roomId: string, slotName: string, state: GameState): Promise<void> {
    const data = this.db.getData();

    // Convert Map to array for JSON serialization
    const characterStatesArray = Array.from(state.characterStates.entries()).map(([instanceId, charState]) => ({
      instance_id: instanceId,
      character_id: charState.characterId,
      current_hp: charState.currentHp,
      temporary_hp: charState.temporaryHp,
      conditions: JSON.stringify(charState.conditions),
      active_buffs: JSON.stringify(charState.activeBuffs),
      current_thoughts: charState.currentThoughts || '',
      known_spells: JSON.stringify(charState.knownSpells || []),
      equipment_worn: JSON.stringify(charState.equipmentState?.worn || []),
      equipment_wielded: JSON.stringify(charState.equipmentState?.wielded || []),
    }));

    const characterOverlaysArray = Array.from(state.characterOverlays.entries()).map(
      ([characterId, overlay]) => ({
        character_id: characterId,
        conditions: JSON.stringify(overlay.conditions || []),
      })
    );

    const record: GameStateRecord = {
      room_id: roomId,
      slot_name: slotName,
      module_name: state.moduleName,
      location_name: state.location.name,
      location_description: state.location.description,
      character_states: JSON.stringify(characterStatesArray),
      world_context: JSON.stringify(state.worldContext || { recentEvents: [], worldFacts: [], flags: {} }),
      character_overlays: JSON.stringify(characterOverlaysArray),
      active_encounters: JSON.stringify(state.activeEncounters || []),
      last_updated: state.lastUpdated || Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const existingIndex = data.gameStates?.findIndex(
      (s) => s.room_id === roomId && s.slot_name === slotName
    ) ?? -1;

    if (existingIndex >= 0) {
      data.gameStates[existingIndex] = record;
    } else {
      // Ensure gameStates array exists
      if (!data.gameStates) {
        data.gameStates = [];
      }
      data.gameStates.push(record);
    }

    await this.db.write();
  }

  /**
   * Load a game state from a specific slot
   * @param roomId - Room identifier
   * @param slotName - Save slot name
   * @returns Game state or null if not found
   */
  async loadState(roomId: string, slotName: string): Promise<GameState | null> {
    const data = this.db.getData();
    const record = data.gameStates?.find(
      (s) => s.room_id === roomId && s.slot_name === slotName
    );

    if (!record) {
      return null;
    }

    const characterStatesArray: CharacterStateRecord[] = JSON.parse(record.character_states || '[]');
    const characterStates = new Map(
      characterStatesArray.map((cs) => [
        cs.instance_id,
        {
          instanceId: cs.instance_id,
          characterId: cs.character_id,
          currentHp: cs.current_hp,
          temporaryHp: cs.temporary_hp,
          conditions: JSON.parse(cs.conditions || '[]'),
          activeBuffs: JSON.parse(cs.active_buffs || '[]'),
          currentThoughts: cs.current_thoughts || '',
          knownSpells: JSON.parse(cs.known_spells || '[]'),
          equipmentState: {
            worn: JSON.parse(cs.equipment_worn || '[]'),
            wielded: JSON.parse(cs.equipment_wielded || '[]'),
          },
        },
      ])
    );

    const overlaysArray = JSON.parse(record.character_overlays || '[]') as Array<{
      character_id: string;
      conditions: string;
    }>;

    const characterOverlays = new Map(
      overlaysArray.map((overlay) => [
        overlay.character_id,
        {
          characterId: overlay.character_id,
          conditions: JSON.parse(overlay.conditions || '[]'),
        },
      ])
    );

    const worldContext = JSON.parse(record.world_context || '{}');

    return {
      roomId: record.room_id,
      moduleName: record.module_name,
      location: {
        name: record.location_name,
        description: record.location_description,
      },
      characterStates,
      characterOverlays,
      worldContext: {
        recentEvents: worldContext.recentEvents || [],
        worldFacts: worldContext.worldFacts || [],
        flags: worldContext.flags || {},
      },
      activeEncounters: JSON.parse(record.active_encounters || '[]'),
      lastUpdated: record.last_updated,
    };
  }

  /**
   * Delete a game state from a specific slot
   * @param roomId - Room identifier
   * @param slotName - Save slot name
   */
  async deleteState(roomId: string, slotName: string): Promise<void> {
    const data = this.db.getData();
    data.gameStates = data.gameStates?.filter(
      (s) => !(s.room_id === roomId && s.slot_name === slotName)
    ) || [];

    await this.db.write();
  }

  /**
   * List all save slots for a room
   * @param roomId - Room identifier
   * @returns Array of save slot records
   */
  async listSlots(roomId: string): Promise<GameStateRecord[]> {
    const data = this.db.getData();
    return data.gameStates?.filter((s) => s.room_id === roomId) || [];
  }

  /**
   * Get a specific save slot record
   * @param roomId - Room identifier
   * @param slotName - Save slot name
   * @returns Save slot record or null
   */
  async getSlot(roomId: string, slotName: string): Promise<GameStateRecord | null> {
    const data = this.db.getData();
    return data.gameStates?.find(
      (s) => s.room_id === roomId && s.slot_name === slotName
    ) || null;
  }

  /**
   * Check if a slot exists
   * @param roomId - Room identifier
   * @param slotName - Save slot name
   * @returns True if slot exists
   */
  async hasSlot(roomId: string, slotName: string): Promise<boolean> {
    const slot = await this.getSlot(roomId, slotName);
    return slot !== null;
  }
}
