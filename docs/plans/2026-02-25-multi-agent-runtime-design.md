# 运行时多 Agent 架构设计

**日期：** 2026-02-25  
**状态：** 设计稿 v1.0  
**范围：** 运行时 Agent 拆分 + 状态层双轨重构  
**不考虑：** 向后兼容（数据迁移单独进行）

---

## 一、背景与问题定义

### 1.1 StatusBar 的语义混用

当前 `StatusBar`（`src/domain/room/types.ts`）将三类性质不同的数据压缩到一个结构：

```typescript
// 现状：一个结构承载了多条语义轨道
interface StatusBar {
  longTermMemory: string[];  // DM维护的世界事实（LLM记忆）
  shortTermMemory: string[]; // DM维护的近期情节（LLM记忆）
  flags: Record<string, string>; // 地点/时间等全局状态（LLM记忆）
  // ⚠️ 缺失：玩家可见的角色叠加状态（装备效果、中毒、地形、魔法效果）
}
```

同时，`GameState.worldFlags` 与 `StatusBar.flags` 存在**语义重复**，持有相同类型的数据。

第三类数据（角色叠加状态：中毒、魔法护盾、地形效果）**完全缺失**：
- `GameState.characterStates[id].conditions` 仅存储 D&D 5e 标准状态名（`"Poisoned"` 等枚举），无来源、无分类、无到期范围
- 没有装备效果、地形效果、场景魔法效果的持久化位置  
- LLM 需要从对话历史中反向推断这些信息，随 context 截断而失忆

**后果：**
1. `StatusBarExtractor` 的提取 prompt 语义模糊，LLM 难以区分「世界事实」与「角色当前状态」
2. 玩家 UI 状态栏无法准确展示当前效果（因为数据不存在）
3. LLM 生叙事时拿不到"Aldric 目前中毒"这类明确信息，必须从对话历史自行推断

### 1.2 ExplorationState 的职责混合

`ExplorationState.processActions()` 内嵌了两种性质不同的逻辑：

| 逻辑 | 性质 | 当前位置 |
|---|---|---|
| LLM tool_call 循环，叙事生成 | 叙事决策 | `ExplorationState.processActions()` |
| tool_call 执行：能力检定、豁免、攻击 | 机制计算 | `ExplorationState.executeTool()` 内联 |
| GameState 副作用写入（HP、条件） | 状态变更 | **不存在**（当前只返回 JSON 给 LLM，不写 GameState） |

关键问题：`executeAbilityCheck()` 只计算结果，不把失败带来的条件（跌倒、中毒）写回 `GameState.characterStates`。LLM 下一轮叙事时，GameState 中角色依然"健康"。

### 1.3 turn_end 后的状态提取位置不对

`extractStatusBarUpdates()` 在 `Room.ts` 的 `turn_end` 处调用，这意味着：
- 状态提取是 Room 的私有逻辑，GameSession 无法感知
- WorldContextUpdater（以及未来更复杂的状态提取）无法作为独立可测试单元存在

---

## 二、设计目标

1. **状态双轨分离**：将 `StatusBar` 替换为 `WorldContext`（DM 记忆，LLM 专用）和 `CharacterOverlay`（玩家可见角色效果），两轨独立读写、独立提取
2. **Agent 职责分离**：`NarratorAgent` 负责叙事驱动的 tool_call 循环，`MechanicsAgent` 负责机制执行并写回 `GameState`
3. **状态更新内聚**：`WorldContextUpdater` 取代 `StatusBarExtractor`，作为独立可测单元，在 `GameSession` 内的 `turn_end` 阶段调用，不依赖 `Room`
4. **流程不引入路由器**：叙事模式流程固定（检定 → 叙事 → 更新状态），暂不需要意图分类

---

## 三、状态层重构

### 3.1 新类型定义（`src/domain/game/GameState.ts`）

```typescript
/**
 * DM 维护的 LLM 记忆 —— 叙事侧专用，不直接呈现给玩家
 * 替代原 StatusBar 的三个字段
 */
export interface WorldContext {
  recentEvents: string[];           // 近期情节摘要（原 shortTermMemory）
  worldFacts: string[];             // 持久世界事实/NPC信息（原 longTermMemory）
  flags: Record<string, string>;    // 全局状态键值对（合并原 StatusBar.flags + GameState.worldFlags）
}

/**
 * 角色叠加状态条目 —— 玩家可见
 * 涵盖装备效果、地形效果、中毒/魔法等
 */
export interface ActiveCondition {
  id: string;              // UUID，用于精确删除
  name: string;            // 显示名：如"中毒III"、"魔法护盾+2AC"、"处于暗处"
  source: string;          // 来源描述：如"毒蛇咬伤"、"魔法师施法"
  category: 'status' | 'equipment' | 'terrain' | 'magic' | 'other';
  expires: 'turn' | 'scene' | 'session' | 'permanent';
  mechanicalEffect?: string; // 可选：机制说明，如"+2 AC"、"力量检定劣势"
}

/**
 * 单个角色的叠加状态集合
 */
export interface CharacterOverlay {
  characterId: string;
  conditions: ActiveCondition[];
}

/**
 * 完整游戏状态（重构后）
 */
export interface GameState {
  roomId: string;
  moduleName?: string;
  location: Location;

  /**
   * D&D 5e 角色机制状态（HP、属性、标准状态名）
   * 由 MechanicsAgent 写入
   */
  characterStates: Map<string, CharacterState>;

  /**
   * 角色叠加效果（玩家可见）
   * 由 WorldContextUpdater 写入
   */
  characterOverlays: Map<string, CharacterOverlay>;

  /**
   * DM 的 LLM 上下文记忆
   * 由 WorldContextUpdater 写入
   */
  worldContext: WorldContext;

  activeEncounters: Encounter[];
  lastUpdated: number;
  playerNotes?: Map<string, PlayerNote[]>;
  conversationHistory?: ConversationTurn[];
}
```

> **废弃：** `GameState.worldFlags`（内容迁移到 `worldContext.flags`）  
> **废弃：** `StatusBar`、`IStatusBarManager`、`StatusBarManager`（全部由 `WorldContext` 替代）  
> **废弃：** `src/application/llm/StatusBarExtractor.ts`（由 `WorldContextUpdater` 替代）  
> **废弃：** `src/infrastructure/room/StatusBarManager.ts`

### 3.2 WorldContext 的容量限制

取代 `MemoryLimits`，在 `WorldContextUpdater` 的配置中定义：

```typescript
export interface WorldContextLimits {
  maxRecentEvents: number;  // 默认 12，FIFO 淘汰
  maxWorldFacts: number;    // 默认 50，只增不减（手动归档）
}
```

---

## 四、运行时 Agent 架构

### 4.1 Agent 职责划分

| Agent | 类 | 职责 | 依赖 |
|---|---|---|---|
| **NarratorAgent** | `ExplorationState`（重构） | LLM tool_call 循环，叙事生成，event yield | `ILLMClient`, `ContextBuilder`, `MechanicsAgent` |
| **MechanicsAgent** | `MechanicsAgent`（新） | tool_call 执行，GameState 副作用写入 | `GameEngine` |
| **WorldContextUpdater** | `WorldContextUpdater`（新，替代 `StatusBarExtractor`）| 叙事后提取 WorldContext + CharacterOverlay | `ILLMClient` |

### 4.2 数据流（固定流程，探索模式）

```
PlayerAction[]
  │
  ▼
GameSession.processActions()
  │
  ▼
NarratorAgent.processActions(actions, ctx)
  │
  ├─── [阶段1: 叙事+检定循环]
  │     │
  │     ├── ctx.contextBuilder.build(ctx.gameState)
  │     │     → WorldContextProvider   读 gameState.worldContext
  │     │     → CharacterStatusProvider 读 gameState.characterOverlays   ← 新
  │     │     → CharacterProfileProvider 读 gameState.characterStates
  │     │     → ConversationHistoryProvider
  │     │     → [LLMMessage[]]
  │     │
  │     ├── llmClient.chat(messages, tools=EXPLORATION_TOOLS)
  │     │
  │     └── loop (有 tool_calls，最多5轮):
  │           │
  │           ├── MechanicsAgent.execute(toolCalls, ctx)
  │           │     ├── gameEngine.abilityCheck / savingThrow / attack
  │           │     ├── ⚡ 写入 gameState.characterStates (HP变化、标准条件)
  │           │     └── yield SessionEvent(dice_roll)
  │           │              ↑ NarratorAgent 转发给 GameSession → Room → SSE
  │           │
  │           └── llmClient.chat(追加 tool_result 继续)
  │
  ├── yield SessionEvent(narrative_chunk) × N  （叙事流式输出）
  │
  ├─── [阶段2: 状态更新，turn_end 后]
  │     │
  │     └── WorldContextUpdater.update(narrative, actions, ctx.gameState)
  │           ├── llmClient.chat(提取 prompt)  ← 独立 LLM 调用
  │           ├── 写入 gameState.worldContext  (recentEvents / worldFacts / flags)
  │           └── 写入 gameState.characterOverlays  (add/remove ActiveCondition)
  │
  └── yield SessionEvent(turn_end)
```

### 4.3 `SessionContext` 变更

```typescript
// src/domain/game/session.ts
export interface GameSessionContext {
  llmClient: ILLMClient;
  gameEngine: GameEngine;
  conversationHistory: IConversationHistory;
  contextBuilder: ContextBuilder;
  gameState: GameState;           // 现已包含 worldContext + characterOverlays
  turnGate: TurnGate;
  roomMembers: RoomMember[];
  // ⚠️ 移除：statusBarManager（状态直接通过 gameState 管理）
}
```

---

## 五、接口定义

### 5.1 `MechanicsAgent`（`src/application/game/agents/MechanicsAgent.ts`）

```typescript
import type { ToolCall } from '@/domain/llm/types.js';
import type { GameSessionContext, SessionEvent } from '@/domain/game/session.js';
import type { GameEngine, Ability, Condition } from '@/domain/game/types.js';

/**
 * 机制执行副作用：写回 GameState 的内容
 */
export interface MechanicsStateUpdate {
  characterId: string;
  hpDelta?: number;                    // 负数=扣血，正数=回血
  conditionApplied?: Condition;        // 施加标准 D&D 5e 状态
  conditionRemoved?: string;           // 移除状态名
}

/**
 * MechanicsAgent
 * 从 ExplorationState.executeTool() 提取，负责：
 * 1. 解析 tool_call 参数
 * 2. 调用 GameEngine 执行机制
 * 3. 将结果副作用写回 GameState.characterStates
 * 4. yield dice_roll / state_transition / action_restriction events
 */
export class MechanicsAgent {
  constructor(private gameEngine: GameEngine) {}

  async *execute(
    toolCalls: ToolCall[],
    ctx: GameSessionContext
  ): AsyncGenerator<{ sessionEvent?: SessionEvent; toolResult: unknown }> {
    for (const call of toolCalls) {
      const result = await this.dispatch(call, ctx);

      // 写回 GameState（副作用）
      if (result.stateUpdate) {
        this.applyStateUpdate(result.stateUpdate, ctx);
      }

      yield { sessionEvent: result.sessionEvent, toolResult: result.toolResult };
    }
  }

  private applyStateUpdate(update: MechanicsStateUpdate, ctx: GameSessionContext): void {
    const state = ctx.gameState.characterStates.get(update.characterId);
    if (!state) return;

    if (update.hpDelta !== undefined) {
      state.currentHp = Math.max(0, Math.min(state.maxHp, state.currentHp + update.hpDelta));
    }
    if (update.conditionApplied) {
      this.gameEngine.applyCondition(update.characterId, update.conditionApplied);
    }
    if (update.conditionRemoved) {
      this.gameEngine.removeCondition(update.characterId, update.conditionRemoved);
    }
  }

  private async dispatch(
    call: ToolCall,
    ctx: GameSessionContext
  ): Promise<{ toolResult: unknown; sessionEvent?: SessionEvent; stateUpdate?: MechanicsStateUpdate }> {
    let args: any;
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      return { toolResult: { error: 'Invalid tool arguments JSON' } };
    }

    switch (call.function.name) {
      case 'request_ability_check':   return this.executeAbilityCheck(args, ctx);
      case 'request_saving_throw':    return this.executeSavingThrow(args, ctx);
      case 'request_group_check':     return this.executeGroupCheck(args, ctx);
      case 'start_combat':
        return {
          toolResult: { acknowledged: true },
          sessionEvent: { type: 'state_transition', to: 'combat', reason: args.reason || '进入战斗' },
        };
      case 'restrict_action':
        return {
          toolResult: { acknowledged: true },
          sessionEvent: {
            type: 'action_restriction',
            allowedCharacterIds: args.characterIds || [],
            reason: args.reason || '行动限制',
          },
        };
      default:
        return { toolResult: { error: `Unknown tool: ${call.function.name}` } };
    }
  }

  // executeAbilityCheck / executeSavingThrow / executeGroupCheck
  // 迁移自 ExplorationState，接口不变，新增 stateUpdate 返回字段
}
```

### 5.2 `WorldContextUpdater`（`src/application/game/agents/WorldContextUpdater.ts`）

```typescript
import type { ILLMClient } from '@/domain/llm/types.js';
import type { GameState, WorldContext, CharacterOverlay, ActiveCondition } from '@/domain/game/GameState.js';
import type { PlayerAction } from '@/domain/room/types.js';
import { randomUUID } from 'crypto';

/**
 * LLM 提取结果的结构化 patch
 */
export interface WorldContextPatch {
  worldMemory?: {
    recentEvents?: string[];
    worldFacts?: string[];
    flags?: Record<string, string>;
  };
  characterConditions?: Array<{
    characterId: string;
    add?: Omit<ActiveCondition, 'id'>[];   // id 由 Updater 生成
    remove?: string[];                      // 按 condition.id 或 condition.name 删除
  }>;
}

export interface WorldContextLimits {
  maxRecentEvents: number;  // 默认 12
  maxWorldFacts: number;    // 默认 50
}

export class WorldContextUpdater {
  constructor(
    private llmClient: ILLMClient,
    private limits: WorldContextLimits = { maxRecentEvents: 12, maxWorldFacts: 50 }
  ) {}

  /**
   * 主入口：叙事完成后调用
   * 读取 narrative + actions → 提取 → 写入 gameState
   */
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
    const prompt = this.buildPrompt(narrative, actions, gameState);
    try {
      const response = await this.llmClient.chat([
        { role: 'system', content: prompt },
        { role: 'user', content: narrative },
      ]);
      return this.parseResponse(response.content, gameState);
    } catch (error) {
      console.error('[WorldContextUpdater] Extraction failed:', error);
      return {};
    }
  }

  private buildPrompt(
    narrative: string,
    actions: PlayerAction[],
    gameState: GameState
  ): string {
    const currentConditions = this.serializeCurrentConditions(gameState);

    return `你是一个 TRPG 状态追踪器。根据本回合叙事，提取以下两类状态更新。

## 当前角色效果（供参考）
${currentConditions || '（无）'}

## 玩家行动
${actions.map(a => `[${a.characterName ?? a.username}]: ${a.action}`).join('\n')}

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
- worldMemory.flags 只列出本回合**发生变化**的键
- worldFacts 只追加新信息，不重复已知事实
- characterConditions.add 只包含本回合**新施加**的效果
- 若无变化则使用空数组，不要省略字段
- 只输出 JSON，不要其他文字`;
  }

  private applyPatch(patch: WorldContextPatch, gameState: GameState): void {
    if (patch.worldMemory) {
      const wc = gameState.worldContext;

      if (patch.worldMemory.recentEvents?.length) {
        wc.recentEvents.push(...patch.worldMemory.recentEvents);
        // FIFO 淘汰
        while (wc.recentEvents.length > this.limits.maxRecentEvents) {
          wc.recentEvents.shift();
        }
      }
      if (patch.worldMemory.worldFacts?.length) {
        wc.worldFacts.push(...patch.worldMemory.worldFacts);
        while (wc.worldFacts.length > this.limits.maxWorldFacts) {
          wc.worldFacts.shift();
        }
      }
      if (patch.worldMemory.flags) {
        Object.assign(wc.flags, patch.worldMemory.flags);
      }
    }

    for (const cc of patch.characterConditions ?? []) {
      if (!gameState.characterOverlays.has(cc.characterId)) {
        gameState.characterOverlays.set(cc.characterId, {
          characterId: cc.characterId,
          conditions: [],
        });
      }
      const overlay = gameState.characterOverlays.get(cc.characterId)!;

      // 移除
      for (const nameOrId of cc.remove ?? []) {
        overlay.conditions = overlay.conditions.filter(
          c => c.id !== nameOrId && c.name !== nameOrId
        );
      }
      // 添加
      for (const cond of cc.add ?? []) {
        overlay.conditions.push({ ...cond, id: randomUUID() });
      }
    }

    gameState.lastUpdated = Date.now();
  }

  private serializeCurrentConditions(gameState: GameState): string {
    const lines: string[] = [];
    for (const [charId, overlay] of gameState.characterOverlays) {
      if (overlay.conditions.length > 0) {
        const condList = overlay.conditions.map(c => `${c.name}(${c.expires})`).join(', ');
        lines.push(`${charId}: ${condList}`);
      }
    }
    return lines.join('\n');
  }

  private parseResponse(content: string, _gameState: GameState): WorldContextPatch {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    try {
      return JSON.parse(jsonMatch[1] ?? jsonMatch[0]) as WorldContextPatch;
    } catch {
      return {};
    }
  }
}
```

### 5.3 `NarratorAgent`（重构后的 `ExplorationState`）

```typescript
// src/application/game/states/ExplorationState.ts（重构后结构）

export class ExplorationState implements IGameState {
  readonly name = 'exploration' as const;

  private mechanicsAgent: MechanicsAgent;

  constructor(gameEngine: GameEngine, private worldContextUpdater: WorldContextUpdater) {
    this.mechanicsAgent = new MechanicsAgent(gameEngine);
  }

  async *processActions(
    actions: PlayerAction[],
    ctx: GameSessionContext
  ): AsyncGenerator<SessionEvent> {
    // 阶段1：叙事 + 检定循环
    const narrative = yield* this.runNarrativeLoop(actions, ctx);

    // 阶段2：状态更新（异步，不阻塞叙事流）
    // turn_end 之前完成，确保 gameState 在 save 前已更新
    await this.worldContextUpdater.update(narrative, actions, ctx.gameState);

    yield { type: 'turn_end' };
  }

  private async *runNarrativeLoop(
    actions: PlayerAction[],
    ctx: GameSessionContext
  ): AsyncGenerator<SessionEvent, string> {
    const messages: LLMMessage[] = await ctx.contextBuilder.build(ctx.gameState);
    messages.push({ role: 'user', content: this.formatActions(actions) });

    let fullNarrative = '';
    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      const response = await ctx.llmClient.chat(messages, {
        tools: EXPLORATION_TOOLS,
        toolChoice: 'auto',
      });

      if (!response.toolCalls?.length) {
        if (response.content) {
          fullNarrative += response.content;
          yield { type: 'narrative_chunk', content: response.content };
        }
        break;
      }

      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls,
      });

      for (const call of response.toolCalls) {
        try {
          // 委托给 MechanicsAgent（含 GameState 副作用写入）
          for await (const { sessionEvent, toolResult } of this.mechanicsAgent.execute([call], ctx)) {
            if (sessionEvent) yield sessionEvent;
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(toolResult),
            });
          }
        } catch (error) {
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }),
          });
        }
      }

      rounds++;
    }

    return fullNarrative;
  }
}
```

> **注意**：`runNarrativeLoop` 的返回类型 `AsyncGenerator<SessionEvent, string>` 利用 Generator 的 return value 传递完整叙事文本给 `processActions`，避免额外的状态变量。

---

## 六、Context Provider 变更

### 6.1 废弃 `StatusBarProvider`，拆分为两个 Provider

**`WorldContextProvider`（替代 `StatusBarProvider`）**  
路径：`src/application/context/providers/WorldContextProvider.ts`

```typescript
export class WorldContextProvider implements ContextProvider {
  name = 'world-context';
  priority = 10;

  provide(state: GameState): ContextBlock | null {
    const wc = state.worldContext;
    const lines: string[] = ['[WORLD CONTEXT]'];

    // 全局状态标志
    for (const [key, value] of Object.entries(wc.flags)) {
      lines.push(`${key.toUpperCase()}: ${value}`);
    }

    // 近期事件
    if (wc.recentEvents.length > 0) {
      lines.push('RECENT:');
      wc.recentEvents.forEach(e => lines.push(`- ${e}`));
    }

    // 世界事实
    if (wc.worldFacts.length > 0) {
      lines.push('FACTS:');
      wc.worldFacts.forEach(f => lines.push(`- ${f}`));
    }

    if (lines.length === 1) return null;
    return { name: this.name, content: lines.join('\n'), priority: this.priority };
  }
}
```

**`CharacterStatusProvider`（新增）**  
路径：`src/application/context/providers/CharacterStatusProvider.ts`

```typescript
export class CharacterStatusProvider implements ContextProvider {
  name = 'character-status';
  priority = 15;  // 在 WorldContext 之后，CharacterProfile 之前

  provide(state: GameState): ContextBlock | null {
    if (state.characterOverlays.size === 0) return null;

    const lines: string[] = ['[CHARACTER CONDITIONS]'];
    let hasAny = false;

    for (const [charId, overlay] of state.characterOverlays) {
      if (overlay.conditions.length === 0) continue;
      hasAny = true;

      // 尝试找角色名（从 characterStates）
      const charState = state.characterStates.get(charId);
      const displayName = (charState as any)?.name ?? charId;

      const condList = overlay.conditions
        .map(c => {
          const effect = c.mechanicalEffect ? `(${c.mechanicalEffect})` : '';
          return `${c.name}${effect}[${c.expires}]`;
        })
        .join(', ');

      lines.push(`${displayName}: ${condList}`);
    }

    if (!hasAny) return null;
    return { name: this.name, content: lines.join('\n'), priority: this.priority };
  }
}
```

### 6.2 Provider 优先级排列（更新后）

| 优先级 | Provider | 内容 |
|---|---|---|
| 0 | `SystemPromptProvider` | 系统指令 |
| 10 | `WorldContextProvider` | DM 记忆（地点/时间/近期/事实）|
| 15 | `CharacterStatusProvider` | 角色叠加效果（中毒/魔法/装备）**新增** |
| 20 | `CharacterProfileProvider` | 角色数值（HP/属性）|
| 30 | `ConversationHistoryProvider` | 对话历史 |
| 40 | `GameRulesProvider` | 规则摘要 |
| 50 | `PlayerNotesProvider` | 玩家笔记 |
| 60 | `ModuleContextProvider` | 模组背景 |

---

## 七、`GameSession` 中的 Updater 注入

`WorldContextUpdater` 在 `GameSession` 的 constructor 中注入，不再由 `Room` 驱动：

```typescript
// src/application/game/GameSession.ts
export interface GameSessionDependencies {
  llmClient: ILLMClient;
  gameEngine: GameEngine;
  conversationHistory: IConversationHistory;
  contextBuilder: ContextBuilder;
  gameState: GameState;
  getRoomMembers: () => Promise<RoomMember[]>;
  worldContextUpdater: WorldContextUpdater;  // ← 新增
}
```

`ExplorationState` 在构造时接收 `WorldContextUpdater` 实例（由 `GameSession.createExplorationState()` 传入）：

```typescript
// GameSession 内部
private createExplorationState(): ExplorationState {
  return new ExplorationState(this.deps.gameEngine, this.deps.worldContextUpdater);
}
```

`Room.ts` 的 `turn_end` 处理：
- **删除** `extractStatusBarUpdates()` 调用
- **删除** `statusBarManager` 依赖注入
- `turn_end` 只做：`turnCount++`、`lastUpdated`、autosave

---

## 八、`Room` 简化后的依赖列表

```typescript
// src/application/room/Room.ts
export interface RoomDependencies {
  llmClient: ILLMClient;
  conversationHistory: IConversationHistory;
  contextBuilder: IContextBuilder;
  gameEngine: GameEngine;
  gameStateManager: GameStateManager;
  worldContextUpdater: WorldContextUpdater;  // ← 替代 statusBarManager
  messageRenderer: MessageRenderer;
  roomChat?: IRoomChat;
  roomMemberships?: { ... };
  userRepo?: { ... };
  characterRepo?: { ... };
  conversationHistoryRepo?: { ... };
  statusBarRepo?: { ... };  // ← 可废弃（数据迁移后改为 worldContextRepo）
}
```

---

## 九、存储层变更

### 9.1 数据库 Schema（`src/infrastructure/database/lowdb/connection.ts`）

```typescript
// 废弃字段（数据迁移后删除）：
// - statusBarEntries（原 shortTermMemory/longTermMemory/flags 存储）
// - statusBarFlags（原 flags 存储）

// 新增字段：
worldContexts: Array<{
  roomId: string;
  recentEvents: string[];
  worldFacts: string[];
  flags: Record<string, string>;
  updatedAt: number;
}>;

characterOverlays: Array<{
  roomId: string;
  characterId: string;
  conditions: ActiveCondition[];
  updatedAt: number;
}>;
```

### 9.2 Repository

- **废弃**：`StatusBarRepository`
- **新增**：`WorldContextRepository`（读写 `worldContexts`）
- **新增**：`CharacterOverlayRepository`（读写 `characterOverlays`）

---

## 十、文件变更清单

### 新增
```
src/domain/game/GameState.ts          (新增 WorldContext / ActiveCondition / CharacterOverlay 类型)
src/application/game/agents/
  MechanicsAgent.ts                   (从 ExplorationState 提取)
  WorldContextUpdater.ts              (替代 StatusBarExtractor)
src/application/context/providers/
  WorldContextProvider.ts             (替代 StatusBarProvider)
  CharacterStatusProvider.ts          (新增)
src/infrastructure/database/lowdb/
  WorldContextRepository.ts           (新增)
  CharacterOverlayRepository.ts       (新增)
```

### 重构（接口变更）
```
src/domain/game/GameState.ts          (新增字段，废弃 worldFlags)
src/domain/game/session.ts            (GameSessionContext 移除 statusBarManager)
src/application/game/GameSession.ts   (注入 WorldContextUpdater，构造 ExplorationState 时传入)
src/application/game/states/
  ExplorationState.ts                 (委托 MechanicsAgent，接收 WorldContextUpdater)
src/application/room/Room.ts          (移除 statusBarManager，移除 extractStatusBarUpdates)
src/infrastructure/room/RoomFactory.ts (更新依赖注入)
```

### 废弃（可在数据迁移完成后删除）
```
src/domain/room/types.ts              (StatusBar / IStatusBarManager / MemoryLimits)
src/infrastructure/room/StatusBarManager.ts
src/application/llm/StatusBarExtractor.ts
src/application/context/providers/StatusBarProvider.ts
src/infrastructure/database/lowdb/StatusBarRepository.ts（如有）
```

---

## 十一、已知边界问题

1. **`CharacterOverlay` 与 `CharacterState.conditions` 的重叠**  
   `GameState.characterStates[id].conditions` 现存字段存储 D&D 5e 标准状态枚举（如 `"Poisoned"`）。`CharacterOverlay` 存储叙事层的效果描述。两者可以共存：机制层用 `characterStates.conditions` 做检定计算，叙事层和 UI 用 `characterOverlays`。`MechanicsAgent` 在施加条件时同时写两处。

2. **`WorldContextUpdater` 提取延迟**  
   `update()` 是一个独立 LLM 调用（约 500-1500ms）。它在 `turn_end` 之前 `await`，意味着状态更新完成后再保存，但会延长每回合总耗时。如需优化，可在 `turn_end` yield 后改为 fire-and-forget，下一回合 `build()` 前确保完成。

3. **角色 ID 映射**  
   `WorldContextUpdater` 提取时，LLM 需要使用正确的 `characterId`。prompt 中需注入角色名→ID 映射表，与 `MechanicsAgent` 的解析逻辑一致。
