// Application layer: Game session coordinator
// Owns the state machine and delegates to current state
import { AllPlayerGate, RestrictedGate } from '@/application/game/TurnGate.js';
import { ExplorationState } from '@/application/game/states/ExplorationState.js';
/**
 * GameSession - Central game flow coordinator
 * Extracted from Room to separate game logic from orchestration
 */
export class GameSession {
    currentState;
    turnGate;
    deps;
    constructor(deps, initialState) {
        this.deps = deps;
        this.currentState = initialState || this.createExplorationState();
        this.turnGate = new AllPlayerGate();
    }
    getTurnGate() {
        return this.turnGate;
    }
    setTurnGate(gate) {
        this.turnGate = gate;
    }
    getCurrentStateName() {
        return this.currentState.name;
    }
    /**
     * Main entry point: process collected player actions.
     * Yields SessionEvents for the caller to route to SSE/UI.
     */
    async *processActions(actions) {
        const roomMembers = await this.deps.getRoomMembers();
        const context = {
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
                }
                else {
                    this.turnGate = new RestrictedGate(event.allowedCharacterIds, event.reason);
                }
            }
            yield event;
        }
    }
    async transitionTo(stateName, reason, context) {
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
    createExplorationState() {
        return new ExplorationState();
    }
}
