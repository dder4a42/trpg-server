# 游戏引擎架构导航指南

快速查找游戏引擎各个组件的位置和功能。

---

## 🗂️ 文件结构速查表

### Domain Layer（纯业务逻辑）

| 文件 | 功能 | 提供者 |
|------|------|---------|
| `src/domain/llm/types.ts` | LLM 工具调用类型定义 | `ToolDefinition`, `ToolCall`, `ChatOptions` |
| `src/domain/game/session.ts` | 游戏会话类型与接口 | `SessionEvent`, `IGameState`, `TurnGate`, `GameSessionContext` |
| `src/domain/game/GameState.ts` | 游戏状态数据结构 | `GameState` 接口 |

### Application Layer（业务逻辑实现）

| 文件 | 功能 | 核心类 |
|------|------|--------|
| `src/application/game/GameSession.ts` | 状态机协调器，驱动游戏流程 | `GameSession` |
| `src/application/game/TurnGate.ts` | 玩家行动权限控制 | `AllPlayerGate`, `RestrictedGate`, `PausedGate`, `InitiativeGate` |
| `src/application/game/states/ExplorationState.ts` | 探索模式（工具调用循环） | `ExplorationState` |
| `src/application/room/Room.ts` | 房间聚合根（已重构） | `Room` |

### Infrastructure Layer（外部集成）

| 文件 | 功能 | 修改 |
|------|------|------|
| `src/infrastructure/llm/OpenAIClient.ts` | OpenAI API 适配器 | 添加工具调用支持 |
| `src/api/routes/rooms.ts` | 房间 API 路由 | 游戏事件订阅 |
| `src/api/routes/streaming.ts` | SSE 流处理 | 骰子结果广播 |

### Frontend（客户端）

| 文件 | 功能 | 功能类/函数 |
|------|------|-----------|
| `public/js/streaming.js` | SSE 连接与事件处理 | `SSEConnection`, `DiceRollManager`, `ActionRestrictionManager` |
| `public/js/game-client.js` | 游戏页面初始化 | `createGameEventAreas()` |
| `public/css/game.css` | 样式（骰子、限制） | `.dice-roll-entry`, `.restriction-notice` |

---

## 🔄 数据流关键路径

### 1. 玩家行动 → 游戏事件处理

```
Player Action
    ↓
Room.addPlayerAction()
    ↓
Room.streamProcessCombinedPlayerActions()
    ↓
GameSession.processActions()  [← EventEmitter subscription starts here]
    ↓
ExplorationState.processActions()
    ↓
[LLM Tool Call Loop]
  - Chat with tools: ability_check, saving_throw, etc
  - Yield: narrative_chunk, dice_roll, action_restriction events
    ↓
Room.emitGameEvent()  [← EventEmitter.emit('game-event')]
    ↓
SSE Handler (rooms.ts:setImmediate)
    ↓
broadcastToRoom(roomId, 'message', { type: 'dice-roll' | 'action-restriction' })
    ↓
Frontend SSE Listener (streaming.js)
    ↓
Display: DiceRollManager.displayRoll() or ActionRestrictionManager.displayRestriction()
```

### 2. LLM 工具调用详细流程

```
ExplorationState.processActions()
    ↓
Build context & messages with EXPLORATION_TOOLS
    ↓
LLM Chat Request (with tools param)
    ↓
OpenAI API
    ↓
Response with tool_calls[]
    ↓
ExplorationState.executeTool(toolCall)
    ↓
Switch (toolCall.function.name):
  case 'ability_check':
    → GameEngine.rollAbilityCheck()
    → Yield DiceRollEvent
  case 'saving_throw':
    → GameEngine.rollSavingThrow()
    → Yield DiceRollEvent
  case 'group_check':
    → GameEngine.rollGroupCheck()
    → Yield DiceRollEvent
  case 'start_combat':
    → Yield StateTransitionEvent
  case 'restrict_action':
    → GameSession.setTurnGate(RestrictedGate)
    → Yield ActionRestrictionEvent
    ↓
Max 5 tool rounds, then return final LLM response
```

---

## 🎯 常见开发任务

### 添加新的工具

**步骤：**
1. 在 [src/application/game/states/ExplorationState.ts](src/application/game/states/ExplorationState.ts#L30) 中的 `EXPLORATION_TOOLS` 常量添加定义
2. 在 `executeTool()` 方法中添加 case
3. 在 GameEngine 中实现对应方法（如需）
4. 更新系统提示词，指导 LLM 何时使用新工具

**示例：添加 `attack_roll` 工具**
```typescript
// 1. 添加到 EXPLORATION_TOOLS
{
  name: 'attack_roll',
  description: '执行攻击检查',
  parameters: { ... }
}

// 2. 添加 case
case 'attack_roll':
  const rollResult = this.context.gameEngine.rollDice('d20 + ' + weaponBonus);
  yield { type: 'dice_roll', data: { ... } };
  break;
```

### 添加新的游戏状态（如 CombatState）

**步骤：**
1. 创建 `src/application/game/states/CombatState.ts`
2. 实现 `IGameState` 接口
3. 在 [GameSession.transitionTo()](src/application/game/GameSession.ts#L78) 中添加转换逻辑
4. 在系统提示词中添加 Combat 场景指导

### 修改行动权限规则

**示例：仅限 1 个角色在战斗中行动**
```typescript
// 在某个时刻
gameSession.setTurnGate(new InitiativeGate(currentCharacterId));

// 现在只有 currentCharacterId 的玩家能行动
// TurnGate 自动生成 ActionRestrictionEvent，通知其他玩家
```

### 调试工具调用

**关键日志位置：**
- `src/utils/logger.ts` - LLMDebugLog 包含 tools 和 toolCalls
- `logs/llm-debug.jsonl` - 保存每个 LLM 交互的详细记录
- 浏览器控制台 - SSE 事件日志（streaming.js）

**检查工具调用：**
```bash
# 查看最后的工具调用
tail logs/llm-debug.jsonl | jq '.tools, .toolCalls'
```

---

## 📊 类型系统网络

```
ILLMClient
├─ chat(messages, options?: ChatOptions)
│  └─ options.tools?: ToolDefinition[]
│
└─ streamChat(messages, options?: ChatOptions)

ToolDefinition
├─ name: string
├─ description: string
└─ parameters: JSONSchema

ChatOptions  ← 向后兼容（可选参数）
├─ tools?: ToolDefinition[]
├─ tool_choice?: 'auto' | 'required' | 'none'
└─ (other OpenAI options)

SessionEvent  ← AsyncGenerator yield
├─ narrative_chunk
├─ dice_roll
├─ action_restriction
├─ state_transition
└─ turn_end

TurnGate  ← 状态机控制
├─ canAct(action: PlayerAction): boolean
├─ getAllowedCharacterIds(): string[]
└─ getDescription(): string
```

---

## 🧪 测试覆盖范围

### 单元测试

| 文件 | 覆盖范围 |
|------|---------|
| `ExplorationState.test.ts` | 工具调用循环、链式检查、MAX_TOOL_ROUNDS |
| `TurnGate.test.ts` | 4 种门票实现、转换逻辑 |

### 集成测试

| 文件 | 场景 |
|------|------|
| `ChainChecks.integration.test.ts` | 端到端流程、状态管理、边界情况 |

---

## 🔗 关键代码片段

### 启动游戏会话

```typescript
const session = new GameSession({
  llmClient,
  gameEngine,
  conversationHistory,
  contextBuilder,
  gameState,
  getRoomMembers: async () => room.getMembers(),
});

// 处理玩家行动
for await (const event of session.processActions(playerActions)) {
  if (event.type === 'dice_roll') console.log('骰子结果:', event.data);
  if (event.type === 'action_restriction') session.setTurnGate(...);
}
```

### 订阅房间事件（在 SSE 处理程序中）

```typescript
const gameEventHandler = (event) => {
  if (event.type === 'dice_roll') {
    broadcastToRoom(roomId, 'message', {
      type: 'dice-roll',
      data: event.data,
    });
  }
};

room.getEventEmitter().on('game-event', gameEventHandler);
```

### 显示骰子结果（前端）

```typescript
window.diceRollManager.displayRoll({
  checkType: 'ability_check',
  characterName: 'Fighter',
  ability: 'strength',
  dc: 15,
  roll: { formula: 'd20+2', rolls: [15], modifier: 2, total: 17 },
  success: true,
  reason: 'Pull the rope',
});
```

---

## 📚 相关文档

- [设计文档（完整技术规范）](docs/plans/2026-02-23-game-events-and-dice-rolling-system-design.md)
- [实现摘要（各 Phase 概览）](docs/IMPLEMENTATION_SUMMARY.md)
- [系统提示词（LLM 指导）](data/prompts/system_prompt.md)
- [CLAUDE.md（全局架构概览）](CLAUDE.md)

---

## 🆘 常见问题

**Q: 如何调试为什么 LLM 没有调用工具？**
A: 检查 logs/llm-debug.jsonl，查看 `tools` 字段是否被传递；如果为空，检查 EXPLORATION_TOOLS 定义

**Q: 骰子结果为什么没有显示到 UI？**
A: 检查浏览器网络标签页的 SSE 连接，确保 'dice-roll' 消息被接收

**Q: 如何测试新添加的工具？**
A: 运行对应的单元测试，或在开发服务器中测试，查看 logs/llm-debug.jsonl

---

**最后更新：2026-02-24**  
**维护者：AI Design Team**

