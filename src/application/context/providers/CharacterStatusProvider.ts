// Application layer: Character status provider
// Provides player-visible character overlays to LLM context

import type { ContextBlock, ContextProvider } from '@/domain/llm/context.js';
import type { GameState } from '@/domain/game/GameState.js';

export class CharacterStatusProvider implements ContextProvider {
  name = 'character-status';
  priority = 15;

  provide(state: GameState): ContextBlock | null {
    if (state.characterOverlays.size === 0) return null;

    const lines: string[] = ['[CHARACTER CONDITIONS]'];
    let hasAny = false;

    for (const [characterId, overlay] of state.characterOverlays) {
      if (overlay.conditions.length === 0) continue;
      hasAny = true;

      const condList = overlay.conditions
        .map((cond) => {
          const effect = cond.mechanicalEffect ? `(${cond.mechanicalEffect})` : '';
          return `${cond.name}${effect}[${cond.expires}]`;
        })
        .join(', ');

      lines.push(`${characterId}: ${condList}`);
    }

    if (!hasAny) return null;

    return {
      name: this.name,
      content: lines.join('\n'),
      priority: this.priority,
    };
  }
}
