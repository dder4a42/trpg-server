// Application layer: Turn gate implementations
// Controls who can act and when to advance turns
/**
 * AllPlayerGate - Normal exploration mode
 * All players can act, advance when all have acted
 */
export class AllPlayerGate {
    canAct(_userId, _characterId) {
        return true;
    }
    canAdvance(currentActions, totalMembers) {
        // Advance when all members have acted (or if there are any actions and no members)
        return totalMembers > 0 && currentActions.length >= totalMembers;
    }
    getStatus() {
        return { type: 'all_players' };
    }
}
/**
 * RestrictedGate - Specific characters only
 * Only named characters can act (e.g., party leader negotiation)
 */
export class RestrictedGate {
    allowedCharacterIds;
    reason;
    constructor(allowedCharacterIds, reason) {
        this.allowedCharacterIds = allowedCharacterIds;
        this.reason = reason;
    }
    canAct(_userId, characterId) {
        if (!characterId)
            return false;
        return this.allowedCharacterIds.includes(characterId);
    }
    canAdvance(currentActions, _totalMembers) {
        // Advance when all allowed characters have acted
        const actedCharacterIds = new Set(currentActions.map(a => a.characterId).filter(Boolean));
        return this.allowedCharacterIds.every(id => actedCharacterIds.has(id));
    }
    getStatus() {
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
export class PausedGate {
    reason;
    constructor(reason) {
        this.reason = reason;
    }
    canAct(_userId, _characterId) {
        return false;
    }
    canAdvance(_currentActions, _totalMembers) {
        return false;
    }
    getStatus() {
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
export class InitiativeGate {
    currentTurnCharacterId;
    reason;
    constructor(currentTurnCharacterId, reason) {
        this.currentTurnCharacterId = currentTurnCharacterId;
        this.reason = reason;
    }
    canAct(_userId, characterId) {
        return characterId === this.currentTurnCharacterId;
    }
    canAdvance(currentActions, _totalMembers) {
        // In combat, advance when current turn character has acted
        return currentActions.some(a => a.characterId === this.currentTurnCharacterId);
    }
    getStatus() {
        return {
            type: 'initiative',
            allowedCharacterIds: [this.currentTurnCharacterId],
            reason: this.reason || '战斗回合中',
        };
    }
    setCurrentTurn(characterId) {
        this.currentTurnCharacterId = characterId;
    }
}
