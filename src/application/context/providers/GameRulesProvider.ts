// Application layer: Game rules provider
// Provides D&D 5e rules context when relevant

import type { ContextBlock, ContextProvider } from '@/domain/llm/context.js';
import type { GameState } from '@/domain/game/GameState.js';
import { CONDITION_DESCRIPTIONS } from '@/domain/game/dnd5e/conditions.js';

export class GameRulesProvider implements ContextProvider {
  name = 'game-rules';
  priority = 300;

  provide(state: GameState): ContextBlock | null {
    const rules: string[] = [];

    const inCombat = state.activeEncounters && state.activeEncounters.length > 0;
    const hasConditions = this.hasAnyConditions(state);

    if (!inCombat && !hasConditions) {
      return null;
    }

    if (inCombat) {
      rules.push('MODE: COMBAT');
      rules.push('- Each round: action, movement, bonus action, free action');
      rules.push('- Attack roll: d20 + proficiency + ability modifier');
      rules.push('- Damage roll: weapon dice + ability modifier');
      rules.push('- Advantage: roll 2d20 take highest; disadvantage: take lowest');
      rules.push('- Critical: natural 20 doubles damage dice');
    }

    if (hasConditions) {
      rules.push('\nACTIVE CONDITIONS:');
      for (const [instanceId, charState] of state.characterStates) {
        if (charState.conditions && charState.conditions.length > 0) {
          const charName = this.getCharacterName(state, instanceId);
          const conditionList = charState.conditions
            .map((c) => {
              const desc = CONDITION_DESCRIPTIONS[c.name as keyof typeof CONDITION_DESCRIPTIONS];
              return `- ${c.name}${desc ? ': ' + desc : ''}`;
            })
            .join('\n  ');
          rules.push(`${charName}:\n  ${conditionList}`);
        }
      }
    }

    return {
      name: this.name,
      content: `[GAME_RULES]\n${rules.join('\n')}\n[/GAME_RULES]`,
      priority: this.priority,
      metadata: {
        inCombat,
        hasConditions,
      },
    };
  }

  private hasAnyConditions(state: GameState): boolean {
    for (const charState of state.characterStates.values()) {
      if (charState.conditions && charState.conditions.length > 0) {
        return true;
      }
    }
    return false;
  }

  private getCharacterName(state: GameState, instanceId: string): string {
    const charState = state.characterStates.get(instanceId);
    return charState?.characterId || instanceId;
  }
}
