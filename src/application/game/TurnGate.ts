// Application layer: Turn gate implementations
// Controls who can act and when to advance turns

import type { TurnGate, TurnGateStatus } from '@/domain/game/session.js';
import type { PlayerAction } from '@/domain/room/types.js';

/**
 * AllPlayerGate - Normal exploration mode
 * All players can act, advance when all have acted
 */
export class AllPlayerGate implements TurnGate {
  canAct(_userId: string, _characterId?: string): boolean {
    return true;
  }

  canAdvance(currentActions: PlayerAction[], totalMembers: number): boolean {
    // Advance when all members have acted (or if there are any actions and no members)
    return totalMembers > 0 && currentActions.length >= totalMembers;
  }

  getStatus(): TurnGateStatus {
    return { type: 'all_players' };
  }
}

/**
 * RestrictedGate - Specific characters only
 * Only named characters can act (e.g., party leader negotiation)
 */
export class RestrictedGate implements TurnGate {
  constructor(
    private allowedCharacterIds: string[],
    private reason: string
  ) {}

  canAct(_userId: string, characterId?: string): boolean {
    if (!characterId) return false;
    return this.allowedCharacterIds.includes(characterId);
  }

  canAdvance(currentActions: PlayerAction[], _totalMembers: number): boolean {
    // Advance when all allowed characters have acted
    const actedCharacterIds = new Set(
      currentActions.map(a => a.characterId).filter(Boolean) as string[]
    );
    return this.allowedCharacterIds.every(id => actedCharacterIds.has(id));
  }

  getStatus(): TurnGateStatus {
    return {
      type: 'restricted',
      allowedCharacterIds: this.allowedCharacterIds,
      reason: this.reason,
    };
  }
}

/**
 * PausedGate - No actions accepted
 * Used when waiting for check resolution or other interrupts
 */
export class PausedGate implements TurnGate {
  constructor(private reason: string) {}

  canAct(_userId: string, _characterId?: string): boolean {
    return false;
  }

  canAdvance(_currentActions: PlayerAction[], _totalMembers: number): boolean {
    return false;
  }

  getStatus(): TurnGateStatus {
    return {
      type: 'paused',
      reason: this.reason,
    };
  }
}

/**
 * InitiativeGate - Combat turn order (reserved for CombatState)
 * Only the character whose turn it is can act
 */
export class InitiativeGate implements TurnGate {
  constructor(
    private currentTurnCharacterId: string,
    private reason?: string
  ) {}

  canAct(_userId: string, characterId?: string): boolean {
    return characterId === this.currentTurnCharacterId;
  }

  canAdvance(currentActions: PlayerAction[], _totalMembers: number): boolean {
    // In combat, advance when current turn character has acted
    return currentActions.some(a => a.characterId === this.currentTurnCharacterId);
  }

  getStatus(): TurnGateStatus {
    return {
      type: 'initiative',
      allowedCharacterIds: [this.currentTurnCharacterId],
      reason: this.reason || '战斗回合中',
    };
  }

  setCurrentTurn(characterId: string): void {
    this.currentTurnCharacterId = characterId;
  }
}
