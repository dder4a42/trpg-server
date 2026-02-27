// Domain layer: Game session types and interfaces
// NO external dependencies - pure TypeScript

import type { PlayerAction } from '@/domain/room/types.js';
import type { RoomMember } from '@/domain/room/types.js';
import type { GameState } from '@/domain/game/GameState.js';
import type { GameEngine } from '@/domain/game/types.js';
import type { ILLMClient } from '@/domain/llm/types.js';
import type { IConversationHistory } from '@/domain/room/types.js';
import type { ContextBuilder } from '@/domain/llm/context.js';

/**
 * Events yielded by game state processing
 * AsyncGenerator<SessionEvent> replaces explicit event queues
 */
export type SessionEvent =
  | NarrativeChunkEvent
  | DiceRollEvent
  | StateTransitionEvent
  | ActionRestrictionEvent
  | TurnEndEvent;

export interface NarrativeChunkEvent {
  type: 'narrative_chunk';
  content: string;
}

export interface DiceRollEvent {
  type: 'dice_roll';
  data: {
    checkType: 'ability_check' | 'saving_throw' | 'attack_roll' | 'group_check';
    characterId: string;
    characterName?: string;
    ability: string;
    dc: number;
    roll: {
      formula: string;
      rolls: number[];
      modifier: number;
      total: number;
    };
    success: boolean;
    reason: string;
  };
}

export interface StateTransitionEvent {
  type: 'state_transition';
  to: 'exploration' | 'combat';
  reason: string;
}

export interface ActionRestrictionEvent {
  type: 'action_restriction';
  allowedCharacterIds: string[]; // empty = all allowed
  reason: string;
}

export interface TurnEndEvent {
  type: 'turn_end';
}

/**
 * Context passed to game states
 * Contains all dependencies needed for processing
 */
export interface GameSessionContext {
  llmClient: ILLMClient;
  gameEngine: GameEngine;
  conversationHistory: IConversationHistory;
  contextBuilder: ContextBuilder;
  gameState: GameState;
  turnGate: TurnGate;
  roomMembers: RoomMember[];
}

/**
 * Game state interface
 * Each state implements its own processing logic
 */
export interface IGameState {
  readonly name: 'exploration' | 'combat';

  /**
   * Process player actions and yield events.
   * The AsyncGenerator pattern replaces explicit event queues:
   * - yield narrative chunks as they stream from LLM
   * - yield dice roll events as checks are executed
   * - yield state transition events when mode changes
   */
  processActions(
    actions: PlayerAction[],
    context: GameSessionContext
  ): AsyncGenerator<SessionEvent>;

  /** Called when entering this state */
  onEnter?(context: GameSessionContext): Promise<void>;

  /** Called when leaving this state */
  onExit?(context: GameSessionContext): Promise<void>;
}

/**
 * Turn gate controls who can act and when to advance
 */
export interface TurnGate {
  /** Check if a specific user/character is allowed to submit an action */
  canAct(userId: string, characterId?: string): boolean;

  /** Check if enough actions collected to advance the turn */
  canAdvance(currentActions: PlayerAction[], totalMembers: number): boolean;

  /** Get description of current gate state (for UI display) */
  getStatus(): TurnGateStatus;
}

export interface TurnGateStatus {
  type: 'all_players' | 'restricted' | 'paused' | 'initiative';
  allowedCharacterIds?: string[]; // undefined = all allowed
  reason?: string;
}

/**
 * Combat state interface (reserved for future implementation)
 */
export interface ICombatState extends IGameState {
  readonly name: 'combat';

  // Combat-specific methods (to be designed)
  getInitiativeOrder(): CombatParticipant[];
  getCurrentTurn(): CombatParticipant | null;
}

export interface CombatParticipant {
  id: string;
  name: string;
  initiative: number;
  isPlayer: boolean;
  characterId?: string;
}

/**
 * Event queue interface (reserved for CombatState use)
 */
export interface IEventQueue<T> {
  enqueue(event: T): void;
  dequeue(): T | undefined;
  peek(): T | undefined;
  isEmpty(): boolean;
  clear(): void;
}
