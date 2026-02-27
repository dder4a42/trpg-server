// Application layer: System prompt provider
// Provides the base DM system prompt

import type { ContextBlock, ContextProvider } from '@/domain/llm/context.js';
import type { GameState } from '@/domain/game/GameState.js';
import { loadPrompt } from '@/utils/prompts.js';

export class SystemPromptProvider implements ContextProvider {
  name = 'system-prompt';
  priority = 0;

  provide(_state: GameState): ContextBlock | null {
    try {
      const prompt = loadPrompt('system_prompt');
      return {
        name: this.name,
        content: prompt,
        priority: this.priority,
      };
    } catch (error) {
      console.error('[SystemPromptProvider] Failed to load prompt:', error);
      return {
        name: this.name,
        content: this.getFallbackPrompt(),
        priority: this.priority,
      };
    }
  }

  private getFallbackPrompt(): string {
    return `You are the TRPG game master. Your duties are:
1. Advance the story based on player actions.
2. Describe scenes and NPC reactions.
3. Ask for checks when appropriate.
4. Keep the story coherent and engaging.

Output format:
- Narration in third person.
- NPC dialogue in quotes.
- Clearly call out required checks.`;
  }
}
