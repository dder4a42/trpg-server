// Application layer: World context updater
// Extracts world context and character overlays after narration

import { randomUUID } from 'crypto';
import type { ILLMClient } from '@/domain/llm/types.js';
import type { PlayerAction } from '@/domain/room/types.js';
import type {
  GameState,
  WorldContext,
  CharacterOverlay,
  ActiveCondition,
} from '@/domain/game/GameState.js';

export interface WorldContextPatch {
  worldMemory?: {
    recentEvents?: string[];
    worldFacts?: string[];
    flags?: Record<string, string>;
  };
  characterConditions?: Array<{
    characterId: string;
    add?: Array<Omit<ActiveCondition, 'id'>>;
    remove?: string[];
  }>;
}

export interface WorldContextLimits {
  maxRecentEvents: number;
  maxWorldFacts: number;
}

export class WorldContextUpdater {
  constructor(
    private llmClient: ILLMClient,
    private limits: WorldContextLimits = { maxRecentEvents: 12, maxWorldFacts: 50 }
  ) {}

  async update(
    narrative: string,
    actions: PlayerAction[],
    gameState: GameState
  ): Promise<void> {
    const patch = await this.extract(narrative, actions, gameState);
    this.applyPatch(patch, gameState);
  }

  private async extract(
    narrative: string,
    actions: PlayerAction[],
    gameState: GameState
  ): Promise<WorldContextPatch> {
    const prompt = this.buildPrompt(actions, gameState);

    try {
      const response = await this.llmClient.chat([
        { role: 'system', content: prompt },
        { role: 'user', content: narrative },
      ]);

      return this.parseResponse(response.content);
    } catch (error) {
      console.error('[WorldContextUpdater] Extraction failed:', error);
      return {};
    }
  }

  private buildPrompt(actions: PlayerAction[], gameState: GameState): string {
    const currentConditions = this.serializeCurrentConditions(gameState);
    const actionLines = actions
      .map((a) => `[${a.characterName ?? a.username}]: ${a.action}`)
      .join('\n');

    return `你是一个 TRPG 状态追踪器。根据本回合叙事，提取以下两类状态更新。

## 当前角色效果（供参考）
${currentConditions || '（无）'}

## 玩家行动
${actionLines}

## 要求
输出严格 JSON，符合以下格式：

\`\`\`json
{
  "worldMemory": {
    "recentEvents": ["本回合发生的情节摘要（1-3条，简洁）"],
    "worldFacts": ["新确立的持久世界事实或NPC信息（可为空数组）"],
    "flags": { "location": "当前地点（如有变化）", "time": "当前时间（如有变化）" }
  },
  "characterConditions": [
    {
      "characterId": "角色ID（与玩家行动中的角色对应）",
      "add": [
        {
          "name": "效果名称",
          "source": "来源描述",
          "category": "status|equipment|terrain|magic|other",
          "expires": "turn|scene|session|permanent",
          "mechanicalEffect": "可选：如+2AC、力量检定劣势"
        }
      ],
      "remove": ["要移除的效果名称"]
    }
  ]
}
\`\`\`

规则：
- worldMemory.flags 只列出本回合发生变化的键
- worldFacts 只追加新信息，不重复已知事实
- characterConditions.add 只包含本回合新施加的效果
- 若无变化则使用空数组，不要省略字段
- 只输出 JSON，不要其他文字`;
  }

  private applyPatch(patch: WorldContextPatch, gameState: GameState): void {
    if (patch.worldMemory) {
      this.applyWorldMemoryPatch(patch.worldMemory, gameState.worldContext);
    }

    for (const change of patch.characterConditions ?? []) {
      const overlay = this.getOrCreateOverlay(change.characterId, gameState);

      for (const nameOrId of change.remove ?? []) {
        overlay.conditions = overlay.conditions.filter(
          (cond) => cond.id !== nameOrId && cond.name !== nameOrId
        );
      }

      for (const cond of change.add ?? []) {
        overlay.conditions.push({ ...cond, id: randomUUID() });
      }
    }

    gameState.lastUpdated = Date.now();
  }

  private applyWorldMemoryPatch(
    patch: NonNullable<WorldContextPatch['worldMemory']>,
    worldContext: WorldContext
  ): void {
    if (patch.recentEvents?.length) {
      worldContext.recentEvents.push(...patch.recentEvents);
      while (worldContext.recentEvents.length > this.limits.maxRecentEvents) {
        worldContext.recentEvents.shift();
      }
    }

    if (patch.worldFacts?.length) {
      worldContext.worldFacts.push(...patch.worldFacts);
      while (worldContext.worldFacts.length > this.limits.maxWorldFacts) {
        worldContext.worldFacts.shift();
      }
    }

    if (patch.flags) {
      Object.assign(worldContext.flags, patch.flags);
    }
  }

  private getOrCreateOverlay(characterId: string, gameState: GameState): CharacterOverlay {
    if (!gameState.characterOverlays.has(characterId)) {
      gameState.characterOverlays.set(characterId, {
        characterId,
        conditions: [],
      });
    }

    return gameState.characterOverlays.get(characterId)!;
  }

  private serializeCurrentConditions(gameState: GameState): string {
    const lines: string[] = [];

    for (const [charId, overlay] of gameState.characterOverlays) {
      if (overlay.conditions.length === 0) continue;
      const condList = overlay.conditions
        .map((c) => `${c.name}(${c.expires})`)
        .join(', ');
      lines.push(`${charId}: ${condList}`);
    }

    return lines.join('\n');
  }

  private parseResponse(content: string): WorldContextPatch {
    const fenced = content.match(/```json\s*([\s\S]*?)```/);
    const inline = content.match(/\{[\s\S]*\}/);
    const payload = fenced?.[1] ?? inline?.[0];

    if (!payload) return {};

    try {
      return JSON.parse(payload) as WorldContextPatch;
    } catch {
      return {};
    }
  }
}
