// Application layer: World context provider
// Provides DM world memory to LLM context

import type { ContextBlock, ContextProvider } from '@/domain/llm/context.js';
import type { GameState } from '@/domain/game/GameState.js';

export class WorldContextProvider implements ContextProvider {
  name = 'world-context';
  priority = 10;

  provide(state: GameState): ContextBlock | null {
    const worldContext = state.worldContext;
    const lines: string[] = ['[WORLD CONTEXT]'];

    if (Object.keys(worldContext.flags).length > 0) {
      for (const [key, value] of Object.entries(worldContext.flags)) {
        lines.push(`${key.toUpperCase()}: ${value}`);
      }
    }

    if (worldContext.recentEvents.length > 0) {
      lines.push('RECENT:');
      worldContext.recentEvents.forEach((item) => lines.push(`- ${item}`));
    }

    if (worldContext.worldFacts.length > 0) {
      lines.push('FACTS:');
      worldContext.worldFacts.forEach((item) => lines.push(`- ${item}`));
    }

    if (lines.length === 1) return null;

    return {
      name: this.name,
      content: lines.join('\n'),
      priority: this.priority,
    };
  }
}
