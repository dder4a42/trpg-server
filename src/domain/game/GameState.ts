// Domain layer: Game state types
// NO external dependencies - pure TypeScript

import type { CharacterState } from './types.js';
import type { PlayerNote, ConversationTurn } from '@/domain/room/types.js';

export interface WorldContext {
  recentEvents: string[];
  worldFacts: string[];
  flags: Record<string, string>;
}

export interface ActiveCondition {
  id: string;
  name: string;
  source: string;
  category: 'status' | 'equipment' | 'terrain' | 'magic' | 'other';
  expires: 'turn' | 'scene' | 'session' | 'permanent';
  mechanicalEffect?: string;
}

export interface CharacterOverlay {
  characterId: string;
  conditions: ActiveCondition[];
}

/**
 * Complete game state for a room/session
 * Contains all dynamic game data that changes during play
 */
export interface GameState {
  roomId: string;
  moduleName?: string;
  location: Location;
  characterStates: Map<string, CharacterState>;
  characterOverlays: Map<string, CharacterOverlay>;
  worldContext: WorldContext;
  activeEncounters: Encounter[];
  lastUpdated: number;
  playerNotes?: Map<string, PlayerNote[]>;
  conversationHistory?: ConversationTurn[];  // Snapshot of conversation at save time
}

export interface Location {
  name: string;
  description?: string;
  region?: string;
  coordinates?: { x: number; y: number };
}

export interface Encounter {
  id: string;
  name: string;
  enemies: Enemy[];
  isActive: boolean;
  round?: number;
}

export interface Enemy {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  armorClass: number;
  initiative?: number;
  conditions?: string[];
}

export interface QuestState {
  id: string;
  name: string;
  status: 'not-started' | 'in-progress' | 'completed' | 'failed';
  objectives: QuestObjective[];
}

export interface QuestObjective {
  description: string;
  completed: boolean;
}
