// Domain layer: Room aggregate root types
// NO external dependencies

import type { LLMMessage } from '@/domain/llm/types.js';
import type { IRoomChat } from '@/domain/room/chat.js';
import type { GameState } from '@/domain/game/GameState.js';

export interface RoomConfig {
  maxPlayers: number;
  moduleName?: string;
  maxHistoryTurns: number;
}

export interface RoomState {
  id: string;
  createdAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
  config: RoomConfig;
}

export interface PlayerAction {
  userId: string;
  username: string;
  characterId?: string;
  characterName?: string;
  action: string;
  timestamp: number;
}

// Player note with stable ID
export interface PlayerNote {
  id: string;           // UUID for stable identification
  content: string;      // Note content (max 200 chars)
  createdAt: Date;      // When the note was created
  userId: string;       // Owner of the note
}

// History management
export interface ConversationTurn {
  userInputs: PlayerAction[]; // Changed from userInput: string
  assistantResponse: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface IConversationHistory {
  add(turn: ConversationTurn): void;
  getRecent(turns: number): ConversationTurn[];
  toLLMMessages(): LLMMessage[];
  clear(): void;
  getAll?(): readonly ConversationTurn[];  // Get all turns (for save)
  setHistory?(turns: ConversationTurn[]): void;  // Restore history (for load)
}

// StatusBar - compact state summary for LLM prompts

// Room member for display
export interface RoomMember {
  userId: string;
  username: string;
  characterId?: string;
  characterName?: string;
  joinedAt: Date;
}

// Room aggregate root interface
export interface IRoom {
  readonly id: string;
  readonly state: RoomState;

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Conversation
  processPlayerInput(input: string, userId?: string, username?: string, characterId?: string): Promise<string>;
  streamProcessPlayerInput(input: string, userId?: string, username?: string, characterId?: string): AsyncGenerator<string>;

  // New methods for action collection
  addPlayerAction(userId: string, username: string, action: string, characterId?: string): Promise<void>;
  getCurrentPlayerActions(): PlayerAction[];
  hasAllPlayersActed(): Promise<boolean>;
  processCombinedPlayerActions(): Promise<string>;
  streamProcessCombinedPlayerActions(): AsyncGenerator<string>;

  // State management
  save(): Promise<void>;
  load(): Promise<void>;
  getGameState(): GameState;
  setGameState(state: GameState): void;

  // Member management
  getMembers(): Promise<RoomMember[]>;
  getMemberCount(): Promise<number>;
  canAcceptMoreMembers(): Promise<boolean>;

  // Player notes
  getAllPlayerNotes(): Map<string, PlayerNote[]>;
  getPlayerNotes(userId: string): Promise<PlayerNote[]>;
  addPlayerNote(userId: string, note: string): Promise<PlayerNote>;
  deletePlayerNote(userId: string, noteId: string): Promise<void>;

  // Access to internal components (for advanced use)
  getConversationHistory(): IConversationHistory;
  getRoomChat(): IRoomChat | undefined;
  getEventEmitter(): any; // EventEmitter for subscribing to game events (dice rolls, action restrictions)
}
