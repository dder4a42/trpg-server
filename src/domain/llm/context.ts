// Domain layer: Context management types and interfaces
// NO external dependencies - pure TypeScript

import type { LLMMessage } from '@/domain/llm/types.js';
import type { CharacterState, Condition } from '@/domain/game/types.js';
import type { Encounter, GameState, Location } from '@/domain/game/GameState.js';

/**
 * A single block of context content to be added to the LLM prompt
 */
export interface ContextBlock {
  name: string;
  content: string;
  priority: number;
  metadata?: Record<string, unknown>;
}

/**
 * Provider that can generate context blocks based on current game state
 */
export interface ContextProvider {
  name: string;
  priority: number;
  provide(state: GameState): ContextBlock | ContextBlock[] | null;
}

/**
 * Builder that chains providers and generates final LLM messages
 */
export interface ContextBuilder {
  add(provider: ContextProvider): this;
  build(state: GameState): Promise<LLMMessage[]>;
  getContextSnapshot(): ContextSnapshot;
}

/**
 * Debug information about context building process
 */
export interface ContextSnapshot {
  timestamp: Date;
  providers: Array<{ name: string; priority: number }>;
  buildLog: BuildLogEntry[];
  errors: BuildErrorEntry[];
  estimatedTokens: number;
}

export interface BuildLogEntry {
  provider: string;
  priority: number;
  included: boolean;
  blockCount?: number;
  reason?: string;
}

export interface BuildErrorEntry {
  provider: string;
  error: string;
  cause?: unknown;
}

// Re-export core state types for convenience in context implementations
export type { GameState, Location, Encounter, CharacterState, Condition };
