// Application layer: Game session coordinator
// Owns the state machine and delegates to current state

import type {
  IGameState,
  GameSessionContext,
  SessionEvent,
  TurnGate,
} from '@/domain/game/session.js';
import type { PlayerAction } from '@/domain/room/types.js';
import type { RoomMember } from '@/domain/room/types.js';
import type { GameState } from '@/domain/game/GameState.js';
import type { GameEngine } from '@/domain/game/types.js';
import type { ILLMClient } from '@/domain/llm/types.js';
import type { IConversationHistory } from '@/domain/room/types.js';
import type { ContextBuilder } from '@/domain/llm/context.js';
import { AllPlayerGate, RestrictedGate } from '@/application/game/TurnGate.js';
import { ExplorationState } from '@/application/game/states/ExplorationState.js';
import type { WorldContextUpdater } from '@/application/game/agents/WorldContextUpdater.js';

export interface GameSessionDependencies {
  llmClient: ILLMClient;
  gameEngine: GameEngine;
  conversationHistory: IConversationHistory;
  contextBuilder: ContextBuilder;
  gameState: GameState;
  getRoomMembers: () => Promise<RoomMember[]>;
  worldContextUpdater: WorldContextUpdater;
}

/**
 * GameSession - Central game flow coordinator
 * Extracted from Room to separate game logic from orchestration
 */
export class GameSession {
  private currentState: IGameState;
  private turnGate: TurnGate;
  private deps: GameSessionDependencies;

  constructor(deps: GameSessionDependencies, initialState?: IGameState) {
    this.deps = deps;
    this.currentState = initialState || this.createExplorationState();
    this.turnGate = new AllPlayerGate();
  }

  getTurnGate(): TurnGate {
    return this.turnGate;
  }

  setTurnGate(gate: TurnGate): void {
    this.turnGate = gate;
  }

  getCurrentStateName(): string {
    return this.currentState.name;
  }

  /**
   * Main entry point: process collected player actions.
   * Yields SessionEvents for the caller to route to SSE/UI.
   */
  async *processActions(actions: PlayerAction[]): AsyncGenerator<SessionEvent> {
    const roomMembers = await this.deps.getRoomMembers();

    const context: GameSessionContext = {
      llmClient: this.deps.llmClient,
      gameEngine: this.deps.gameEngine,
      conversationHistory: this.deps.conversationHistory,
      contextBuilder: this.deps.contextBuilder,
      gameState: this.deps.gameState,
      turnGate: this.turnGate,
      roomMembers,
    };

    for await (const event of this.currentState.processActions(actions, context)) {
      // Intercept state transition events
      if (event.type === 'state_transition') {
        await this.transitionTo(event.to, event.reason, context);
      }

      // Intercept action restriction events
      if (event.type === 'action_restriction') {
        if (event.allowedCharacterIds.length === 0) {
          this.turnGate = new AllPlayerGate();
        } else {
          this.turnGate = new RestrictedGate(
            event.allowedCharacterIds,
            event.reason
          );
        }
      }

      yield event;
    }
  }

  private async transitionTo(
    stateName: 'exploration' | 'combat',
    reason: string,
    context: GameSessionContext
  ): Promise<void> {
    console.log(`[GameSession] Transitioning to ${stateName}: ${reason}`);

    await this.currentState.onExit?.(context);

    switch (stateName) {
      case 'exploration':
        this.currentState = this.createExplorationState();
        this.turnGate = new AllPlayerGate();
        break;
      case 'combat':
        // CombatState is interface-only for now
        throw new Error('CombatState not yet implemented');
      default:
        throw new Error(`Unknown state: ${stateName}`);
    }

    await this.currentState.onEnter?.(context);
  }

  private createExplorationState(): IGameState {
    return new ExplorationState(this.deps.worldContextUpdater);
  }
}
