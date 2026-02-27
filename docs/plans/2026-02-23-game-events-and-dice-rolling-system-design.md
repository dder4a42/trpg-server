# Game Events & Dice Rolling System Design

**Date:** 2026-02-23
**Revised:** 2026-02-24
**Status:** Draft v0.2
**Author:** AI Design Team
**Document Type:** Architecture Design

---

## Executive Summary

This document outlines the design for an integrated dice rolling and game event system that enables the AI Dungeon Master to trigger and resolve game mechanics while maintaining narrative flow.

The system uses a **two-state state machine** (`ExplorationState` / `CombatState`) with **LLM native tool calling** for check detection and a **pipeline-based processing model** (no explicit event queues). The core architectural idea is: in Exploration mode, the DM LLM itself is the decision engine—it decides whether a check is needed via tool calling, and the server simply executes and feeds results back for narrative continuation.

**Key Decisions:**
- Two-state state machine (Exploration + Combat), no Dialogue state
- Pipeline processing with AsyncGenerator, no dual queues
- LLM native tool calling for check detection (zero parsing cost)
- GameSession extracted from Room to separate game logic from orchestration
- TurnGate abstraction for action permission control

---

## 1. Problem Statement

### Current State

The TRPG server has a fully-functional `D20GameEngine` (`src/application/game/GameEngine.ts`) that can roll dice, execute ability checks, handle combat, and manage character state. However, **none of this is connected to the web interface**:

| Feature | Status |
|---------|--------|
| Dice rolling API | Not implemented |
| Dice rolling UI | Not implemented |
| Turn order system | Not implemented |
| Game event system | Not implemented |
| LLM ↔ GameEngine integration | Not implemented |

Players can only send text messages. The AI DM cannot trigger dice rolls, and there's no way to display game mechanics results to players.

### Current Code Pain Points

The `Room` class (`src/application/room/Room.ts`, 653 lines) is overloaded with responsibilities:
- Player action collection (`addPlayerAction`, `currentPlayerActions`)
- LLM interaction (`processPlayerInput`, `streamProcessCombinedPlayerActions`)
- Persistence (`save`, `load`)
- Member management (`getMembers`, `getMemberCount`)
- Notes management (`playerNotes` series)
- Status bar extraction (`extractStatusBarUpdates`)

Adding game event logic directly to Room would push it past 1500+ lines. **Separation is mandatory.**

### User Pain Points

1. **No mechanical engagement:** Without dice, the game feels like "just chat."
2. **No combat structure:** D&D 5e combat requires strict turn order and initiative.
3. **No transparency:** "The door opens" vs "You rolled 18 and the door opens" are very different experiences.
4. **Chinese language support:** Our players are Chinese speakers. Keyword-based dice detection won't work.
5. **No action control:** In certain story beats, only specific characters should be allowed to act (e.g. party leader negotiation, solo stealth mission).

---

## 2. Goals & Success Criteria

### Primary Goals

1. **Enable AI DM to trigger dice rolls** via tool calling based on player actions
2. **Display dice results to players** via SSE events to sidebar log
3. **Support check chains** (failed lock-pick → trap → saving throw)
4. **Support action restrictions** (only specific characters may act)
5. **Extract game session logic from Room** into a clean GameSession class
6. **Leave CombatState interface** for future implementation

### Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| Dice roll visibility | Players see all rolls in Combat Log sidebar |
| Check accuracy | LLM correctly identifies check-worthy actions >90% |
| Chain support | Multi-step checks (lock→trap→save) work end-to-end |
| Action control | TurnGate correctly restricts/allows player actions |
| Code separation | Room.ts ≤ 350 lines, GameSession owns game flow |
| Backward compat | Existing API endpoints and ConversationHistory unchanged |

### Non-Goals (this version)

- [ ] Visual dice rolling animation
- [ ] Player-initiated dice rolls via UI buttons
- [ ] Full D&D 5e rules (cover core mechanics first)
- [ ] CombatState implementation (interface only)
- [ ] Undo/redo for dice rolls

---

## 3. Architectural Decision Record

### ADR-1: Two-State Machine (revised from three-state)

**Question:** How many game states do we need?

**Original proposal:** Three states — Exploration, Combat, Dialogue.

**Revised decision: Two states — Exploration + Combat.**

| State | Scope |
|-------|-------|
| **ExplorationState** | Free-form play, dialogue, checks, social encounters, persuasion, all non-combat gameplay |
| **CombatState** | D&D 5e turn-based combat with initiative order (interface only, defer implementation) |

**Why Dialogue was merged into Exploration:**

1. Dialogue checks (persuasion, intimidation, deception) are mechanically identical to exploration checks (lock-picking, perception). Both follow the same pattern: player acts → LLM decides if check needed → execute → narrate result.
2. Dialogue "focus" (only one character talks to NPC) is an **action permission** concern, not a **state** concern. This is handled by `TurnGate.restrict(characterIds)` within ExplorationState.
3. If Dialogue gets its own state, then Shopping, Rest, Puzzle, etc. all need separate states too — state explosion with no structural benefit.
4. **The structural difference between Exploration and Combat is real** (free-form vs strict turns). The difference between Exploration and Dialogue is not — they share the same processing pipeline.

**State transitions:**

```
ExplorationState ←→ CombatState
       │                    │
       │  start_combat()    │
       ├───────────────────→│
       │                    │
       │  combat ends       │
       │←───────────────────┤
```

---

### ADR-2: Pipeline Processing, No Dual Queues (revised)

**Question:** How should we handle messages vs game events?

**Original proposal:** Dual queues (MessageQueue + EventQueue) with QueueManager.

**Revised decision: No explicit queues. Use a pipeline with AsyncGenerator.**

**Why dual queues are unnecessary for Exploration:**

1. The "MessageQueue" already exists — it's `ConversationHistory` + `ContextBuilder`. These are working, tested components. Building a new MessageQueue would duplicate them.
2. The "EventQueue" in exploration mode degenerates to a single synchronous operation: LLM says "do a check" → we do the check → feed result back. There's nothing to queue — it's a function call, not a deferred job.
3. The event loop analogy (microtask/macrotask) doesn't apply because each turn is fundamentally sequential: collect actions → process → respond.

**What we use instead:**

```
Pipeline (AsyncGenerator<SessionEvent>)
─────────────────────────────────────────────
  PlayerActions
    → TurnGate.validate()
    → ContextBuilder.build()
    → LLM call (with tools)
    → [if tool_call: execute check → inject result → LLM again] ← loop
    → yield narrative chunks + dice events
    → post-process (StatusBar extraction, persistence)
```

The `AsyncGenerator<SessionEvent>` is itself an event stream. The caller (Room / SSE endpoint) consumes events as they're yielded, routing narrative chunks to the story panel and dice events to the sidebar. **No queue needed — `yield` IS the event mechanism.**

**When an event queue IS appropriate:** CombatState will need a local event queue to manage multi-actor round resolution (initiative order, reactions, opportunity attacks, legendary actions). This is deferred to CombatState implementation. The `IEventQueue` interface is defined now for forward compatibility.

**Trade-offs accepted:**
- Exploration flow is strictly sequential per turn (fine — it already is)
- CombatState will need its own queue later (acceptable — cleaner than forcing a queue on both states)

---

### ADR-3: LLM Tool Calling, Not Separate Analysis Call (revised)

**Question:** How should the system detect when dice rolls are needed?

**Original proposal:** Separate LLM call per player action to analyze and detect dice needs.

**Revised decision: Integrate check detection into the main DM LLM call via native tool calling.**

**What is tool calling?**

OpenAI/DeepSeek APIs support [function calling](https://platform.openai.com/docs/guides/function-calling) natively. When you pass `tools` to the API, the model can choose to invoke a function instead of (or in addition to) generating text. The response comes back with structured `tool_calls` — no text parsing needed.

```typescript
// Current code (OpenAIClient.ts):
const response = await this.client.chat.completions.create({
  model, messages, temperature, max_tokens
});
// Only reads: response.choices[0].message.content

// With tool calling:
const response = await this.client.chat.completions.create({
  model, messages, temperature, max_tokens,
  tools: EXPLORATION_TOOLS,    // ← new
  tool_choice: 'auto',         // ← LLM decides
});

const message = response.choices[0].message;
if (message.tool_calls?.length) {
  // Structured: { name: "request_ability_check", arguments: '{"ability":"dexterity","dc":15,...}' }
  // Just JSON.parse(arguments) — zero parsing cost
} else {
  // Normal narrative text
}
```

**Why this is better than a separate analysis call:**

| Aspect | Separate Analysis Call | Integrated Tool Calling |
|--------|----------------------|------------------------|
| Latency | 2× LLM calls per action | 1× (only extra calls when check actually needed) |
| Cost | 2× API cost always | 1× normally, 2× only on checks |
| Parsing | Need regex/JSON extraction from text | Structured `tool_calls` field, `JSON.parse()` only |
| Context | Analysis LLM lacks full game context | Same LLM has full context, better decisions |
| Chinese support | ✓ | ✓ (same LLM, native) |

**How check chains work (the key insight):**

This is the standard OpenAI multi-turn tool calling protocol. When the LLM returns `tool_calls`, we:
1. Execute the function (e.g., roll dice via `D20GameEngine`)
2. Append the result as a `role: 'tool'` message
3. Call the LLM again with the updated messages
4. LLM sees the result and decides: more tool calls? or generate narrative?

This **naturally supports chain checks** because the LLM is the decision engine:

```
Player: "I try to pick the lock"
  → LLM → tool_call: request_ability_check(dex, dc=15, "撬锁")
  → Execute: rolled 8 + 3 = 11, FAIL
  → tool_result: { success: false, total: 11, dc: 15 }
  → LLM → tool_call: request_saving_throw(dex, dc=13, "闪避毒针陷阱")  ← CHAIN!
  → Execute: rolled 14 + 3 = 17, SUCCESS
  → tool_result: { success: true, total: 17, dc: 13 }
  → LLM → "锁没有打开，反而触发了暗藏的毒针！但你反应极快，侧身闪过..."
```

We don't need to design chain logic — the LLM does it. We just need:
1. Provide tools
2. Execute tool_calls and return results
3. Loop until LLM produces narrative text (set `MAX_TOOL_ROUNDS = 5` as safety)

---

### ADR-4: Dice Results Display — Sidebar Log (unchanged)

**Decision: Sidebar Log.** Same rationale as v0.1.

Dice results are delivered via SSE `SessionEvent` of type `dice_roll`. The frontend routes these to the sidebar Combat Log panel. The narrative panel stays clean.

**Mitigation for missed events:** Highlight sidebar on new events. Include brief inline summary in narrative ("你成功了！" / "检定失败...").

---

## 4. System Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Room (Thin Orchestrator)                     │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Member Mgmt   │  │ Persistence  │  │ Notes / StatusBar    │  │
│  └───────────────┘  └──────────────┘  └──────────────────────┘  │
│                              │                                    │
│                    delegates │ game flow                          │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    GameSession                              │  │
│  │                                                              │  │
│  │  ┌──────────┐    ┌──────────────────────────────────────┐  │  │
│  │  │TurnGate  │    │  currentState: IGameState            │  │  │
│  │  │(who can  │    │                                      │  │  │
│  │  │ act)     │    │  ┌────────────────┐  ┌────────────┐  │  │  │
│  │  └──────────┘    │  │ExplorationState│  │CombatState │  │  │  │
│  │                  │  │  (active)      │  │ (reserved) │  │  │  │
│  │                  │  └───────┬────────┘  └────────────┘  │  │  │
│  │                  └──────────┼────────────────────────────┘  │  │
│  │                             │                                │  │
│  │  processActions() pipeline: │                                │  │
│  │    validate → build ctx → LLM(tools) → [tool loop] → yield │  │
│  │                             │                                │  │
│  │                  ┌──────────▼──────────┐                    │  │
│  │                  │  AsyncGenerator     │                    │  │
│  │                  │  <SessionEvent>     │                    │  │
│  │                  └──────────┬──────────┘                    │  │
│  └─────────────────────────────┼──────────────────────────────┘  │
│                                │                                  │
│          SSE broadcast ────────┤                                  │
│            ┌───────────────────┼────────────────┐                │
│            ▼                   ▼                ▼                │
│     narrative_chunk       dice_roll      action_restriction     │
│     → Story Panel         → Sidebar      → UI update            │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Lines (est.) |
|-----------|---------------|-------------|
| **Room** | Member management, persistence, notes, delegates game flow to GameSession | ~350 |
| **GameSession** | State machine dispatch, TurnGate management, owns game state | ~150 |
| **ExplorationState** | Tool calling pipeline, check execution, narrative generation | ~200 |
| **CombatState** | (Interface only) Turn order, initiative, combat actions | deferred |
| **TurnGate** | Controls who can submit actions and when to advance | ~80 |
| **D20GameEngine** | Pure game mechanics: dice, checks, damage (existing) | existing |
| **ContextBuilder** | LLM context pipeline (existing) | existing |
| **OpenAIClient** | LLM API with tool calling support (extended) | existing + ~50 |

### Data Flow: Exploration Turn

```
1. Player submits action via API
2. Room.addPlayerAction() — stores action
3. TurnGate.canAdvance() → true when gate condition met
4. Room delegates to GameSession.processActions(actions)
5. GameSession delegates to currentState.processActions(actions, context)
6. ExplorationState:
   a. ContextBuilder.build(gameState) → LLM messages
   b. Append formatted player actions as user message
   c. Call LLM with tools (request_ability_check, request_saving_throw, etc.)
   d. If tool_calls returned:
      i.   Execute each tool via D20GameEngine
      ii.  yield SessionEvent { type: 'dice_roll', data }
      iii. Append tool results to messages
      iv.  Call LLM again (may return more tool_calls → loop, max 5 rounds)
   e. LLM returns narrative text
   f. yield SessionEvent { type: 'narrative_chunk', content }
7. Room consumes SessionEvents:
   - narrative_chunk → SSE to story panel
   - dice_roll → SSE to sidebar log
   - action_restriction → update TurnGate
   - state_transition → GameSession switches state
8. Post-processing: ConversationHistory.add(), StatusBar extraction, auto-save
```

---

## 5. Detailed Component Design

### 5.1 ILLMClient Extension (backward-compatible)

The existing `ILLMClient` interface needs minimal extension to support tool calling. All existing call sites remain unchanged (the `options` parameter is optional).

```typescript
// New types in domain/llm/types.ts

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;  // JSON Schema
  };
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;  // JSON string, just JSON.parse()
  };
}

export interface ChatOptions {
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
}

// Extended (backward-compatible):
export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];         // ← new, undefined when no tools
  usage?: LLMUsage;
  model?: string;
  id?: string;
}

// Extended signature (backward-compatible):
export interface ILLMClient {
  chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse>;
  streamChat(messages: LLMMessage[], options?: ChatOptions): AsyncGenerator<LLMStreamChunk>;
  getConfig(): Readonly<LLMConfig>;
}
```

**LLMMessage extension for tool results:**

```typescript
// The role: 'tool' message type for feeding tool results back to LLM
export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMMessage {
  role: LLMRole;
  content: string;
  timestamp?: number;
  // For assistant messages with tool calls
  tool_calls?: ToolCall[];
  // For tool result messages
  tool_call_id?: string;
}
```

### 5.2 SessionEvent Type

```typescript
// domain/game/session.ts — event types yielded by state processing

export type SessionEvent =
  | NarrativeChunkEvent
  | DiceRollEvent
  | StateTransitionEvent
  | ActionRestrictionEvent
  | TurnEndEvent;

export interface NarrativeChunkEvent {
  type: 'narrative_chunk';
  content: string;
}

export interface DiceRollEvent {
  type: 'dice_roll';
  data: {
    checkType: 'ability_check' | 'saving_throw' | 'attack_roll' | 'group_check';
    characterId: string;
    characterName?: string;
    ability: string;
    dc: number;
    roll: { formula: string; rolls: number[]; modifier: number; total: number };
    success: boolean;
    reason: string;
  };
}

export interface StateTransitionEvent {
  type: 'state_transition';
  to: 'exploration' | 'combat';
  reason: string;
}

export interface ActionRestrictionEvent {
  type: 'action_restriction';
  allowedCharacterIds: string[];  // empty = all allowed
  reason: string;
}

export interface TurnEndEvent {
  type: 'turn_end';
}
```

### 5.3 IGameState Interface

```typescript
// domain/game/session.ts

export interface IGameState {
  readonly name: 'exploration' | 'combat';

  /**
   * Process player actions and yield events.
   * The AsyncGenerator pattern replaces explicit event queues:
   * - yield narrative chunks as they stream from LLM
   * - yield dice roll events as checks are executed
   * - yield state transition events when mode changes
   */
  processActions(
    actions: PlayerAction[],
    context: GameSessionContext
  ): AsyncGenerator<SessionEvent>;

  /** Called when entering this state */
  onEnter?(context: GameSessionContext): Promise<void>;

  /** Called when leaving this state */
  onExit?(context: GameSessionContext): Promise<void>;
}

export interface GameSessionContext {
  llmClient: ILLMClient;
  gameEngine: GameEngine;
  conversationHistory: IConversationHistory;
  contextBuilder: ContextBuilder;
  gameState: GameState;
  turnGate: TurnGate;
  roomMembers: RoomMember[];
}
```

### 5.4 TurnGate

Controls who can act and when to advance the turn. Covers all scenarios:

| Scenario | Gate Type | Behavior |
|----------|-----------|----------|
| Normal exploration | `AllPlayerGate` | All players act → advance |
| Specific character focus | `RestrictedGate` | Only named characters can act |
| Check pending | `PausedGate` | No new actions accepted until check resolves |
| Combat turn | `InitiativeGate` | Only current-turn character can act |

```typescript
// domain/game/turnGate.ts

export interface TurnGate {
  /** Check if a specific user/character is allowed to submit an action */
  canAct(userId: string, characterId?: string): boolean;

  /** Check if enough actions collected to advance the turn */
  canAdvance(currentActions: PlayerAction[], totalMembers: number): boolean;

  /** Get description of current gate state (for UI display) */
  getStatus(): TurnGateStatus;
}

export interface TurnGateStatus {
  type: 'all_players' | 'restricted' | 'paused' | 'initiative';
  allowedCharacterIds?: string[];  // undefined = all allowed
  reason?: string;
}

// Implementation examples:

export class AllPlayerGate implements TurnGate {
  canAct(_userId: string): boolean { return true; }
  canAdvance(actions: PlayerAction[], totalMembers: number): boolean {
    return actions.length >= totalMembers;
  }
  getStatus(): TurnGateStatus { return { type: 'all_players' }; }
}

export class RestrictedGate implements TurnGate {
  constructor(
    private allowedCharacterIds: string[],
    private reason: string
  ) {}

  canAct(_userId: string, characterId?: string): boolean {
    return !!characterId && this.allowedCharacterIds.includes(characterId);
  }

  canAdvance(actions: PlayerAction[]): boolean {
    // Advance when all allowed characters have acted
    const actedIds = new Set(actions.map(a => a.characterId).filter(Boolean));
    return this.allowedCharacterIds.every(id => actedIds.has(id));
  }

  getStatus(): TurnGateStatus {
    return {
      type: 'restricted',
      allowedCharacterIds: this.allowedCharacterIds,
      reason: this.reason
    };
  }
}
```

### 5.5 GameSession

The central coordinator extracted from Room. Owns the state machine and TurnGate.

```typescript
// application/game/GameSession.ts

export class GameSession {
  private currentState: IGameState;
  private turnGate: TurnGate;
  private context: GameSessionContext;

  constructor(deps: GameSessionDependencies) {
    this.currentState = new ExplorationState();
    this.turnGate = new AllPlayerGate();
    this.context = { /* wire deps */ };
  }

  getTurnGate(): TurnGate { return this.turnGate; }
  setTurnGate(gate: TurnGate): void { this.turnGate = gate; }
  getCurrentStateName(): string { return this.currentState.name; }

  /**
   * Main entry point: process collected player actions.
   * Yields SessionEvents for the caller to route to SSE/UI.
   */
  async *processActions(actions: PlayerAction[]): AsyncGenerator<SessionEvent> {
    this.context.turnGate = this.turnGate;

    for await (const event of this.currentState.processActions(actions, this.context)) {
      // Intercept state transition events
      if (event.type === 'state_transition') {
        await this.transitionTo(event.to, event.reason);
      }

      // Intercept action restriction events
      if (event.type === 'action_restriction') {
        if (event.allowedCharacterIds.length === 0) {
          this.turnGate = new AllPlayerGate();
        } else {
          this.turnGate = new RestrictedGate(event.allowedCharacterIds, event.reason);
        }
      }

      yield event;
    }
  }

  private async transitionTo(stateName: string, reason: string): Promise<void> {
    await this.currentState.onExit?.(this.context);

    switch (stateName) {
      case 'exploration':
        this.currentState = new ExplorationState();
        this.turnGate = new AllPlayerGate();
        break;
      case 'combat':
        // CombatState is interface-only for now
        throw new Error('CombatState not yet implemented');
        break;
    }

    await this.currentState.onEnter?.(this.context);
  }
}
```

### 5.6 ExplorationState — Tool Calling Pipeline

This is the core of the system: the pipeline that replaces dual queues.

```typescript
// application/game/states/ExplorationState.ts

const MAX_TOOL_ROUNDS = 5;

export class ExplorationState implements IGameState {
  readonly name = 'exploration' as const;

  async *processActions(
    actions: PlayerAction[],
    ctx: GameSessionContext
  ): AsyncGenerator<SessionEvent> {

    // 1. Build LLM context
    const messages: LLMMessage[] = await ctx.contextBuilder.build(ctx.gameState);
    messages.push({ role: 'user', content: this.formatActions(actions) });

    // 2. Tool calling loop
    let rounds = 0;
    while (rounds < MAX_TOOL_ROUNDS) {
      const response = await ctx.llmClient.chat(messages, {
        tools: EXPLORATION_TOOLS,
        toolChoice: 'auto',
      });

      // No tool calls → LLM produced narrative, we're done
      if (!response.toolCalls?.length) {
        yield { type: 'narrative_chunk', content: response.content };
        break;
      }

      // Has tool calls → execute each one
      // Append assistant message (with tool_calls, no content)
      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls,
      });

      for (const call of response.toolCalls) {
        const result = await this.executeTool(call, ctx);

        // Yield dice event to frontend sidebar
        if (result.sessionEvent) {
          yield result.sessionEvent;
        }

        // Append tool result for next LLM round
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result.toolResult),
        });
      }

      rounds++;
    }

    // 3. Check for state transitions or action restrictions in tool calls
    // (handled by tool executors returning special events)

    yield { type: 'turn_end' };
  }

  private async executeTool(
    call: ToolCall,
    ctx: GameSessionContext
  ): Promise<{ toolResult: unknown; sessionEvent?: SessionEvent }> {
    const args = JSON.parse(call.function.arguments);

    switch (call.function.name) {
      case 'request_ability_check':
        return this.executeAbilityCheck(args, ctx);
      case 'request_saving_throw':
        return this.executeSavingThrow(args, ctx);
      case 'request_group_check':
        return this.executeGroupCheck(args, ctx);
      case 'start_combat':
        return {
          toolResult: { acknowledged: true },
          sessionEvent: { type: 'state_transition', to: 'combat', reason: args.reason },
        };
      case 'restrict_action':
        return {
          toolResult: { acknowledged: true },
          sessionEvent: {
            type: 'action_restriction',
            allowedCharacterIds: args.characterIds,
            reason: args.reason,
          },
        };
      default:
        return { toolResult: { error: `Unknown tool: ${call.function.name}` } };
    }
  }

  private executeAbilityCheck(args: any, ctx: GameSessionContext) {
    const result = ctx.gameEngine.abilityCheck(
      args.characterId,
      args.ability,
      args.rollType || 'normal'
    );
    const success = result.roll.total >= (args.dc || 10);

    return {
      toolResult: {
        characterId: args.characterId,
        ability: args.ability,
        roll: result.roll,
        dc: args.dc,
        success,
        reason: args.reason,
      },
      sessionEvent: {
        type: 'dice_roll' as const,
        data: {
          checkType: 'ability_check' as const,
          characterId: args.characterId,
          ability: args.ability,
          dc: args.dc,
          roll: result.roll,
          success,
          reason: args.reason,
        },
      },
    };
  }

  // Similar for executeSavingThrow, executeGroupCheck...

  private formatActions(actions: PlayerAction[]): string {
    return actions
      .map(a => a.characterName ? `[${a.characterName}] ${a.action}` : `[${a.username}] ${a.action}`)
      .join('\n');
  }
}
```

### 5.7 Exploration Tool Definitions

```typescript
// application/game/tools/explorationTools.ts

export const EXPLORATION_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'request_ability_check',
      description: '当玩家的行动需要能力检定时调用（如开锁、攀爬、说服、偷窃、感知等）',
      parameters: {
        type: 'object',
        properties: {
          characterId: {
            type: 'string',
            description: '需要进行检定的角色ID',
          },
          ability: {
            type: 'string',
            enum: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
            description: '检定使用的属性',
          },
          dc: {
            type: 'number',
            description: '难度等级(DC)，5=极易 10=简单 15=中等 20=困难 25=极难',
          },
          reason: {
            type: 'string',
            description: '检定原因的简短描述',
          },
          rollType: {
            type: 'string',
            enum: ['normal', 'advantage', 'disadvantage'],
            description: '投骰方式，默认normal',
          },
        },
        required: ['characterId', 'ability', 'dc', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_saving_throw',
      description: '当角色需要进行豁免检定时调用（如闪避陷阱、抵抗毒素、对抗魔法等）',
      parameters: {
        type: 'object',
        properties: {
          characterId: { type: 'string' },
          ability: {
            type: 'string',
            enum: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
          },
          dc: { type: 'number' },
          reason: { type: 'string' },
          rollType: {
            type: 'string',
            enum: ['normal', 'advantage', 'disadvantage'],
          },
        },
        required: ['characterId', 'ability', 'dc', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_group_check',
      description: '要求多个角色或全队进行同一检定（如全队感知检定、集体隐匿）',
      parameters: {
        type: 'object',
        properties: {
          ability: { type: 'string', enum: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] },
          dc: { type: 'number' },
          reason: { type: 'string' },
          characterIds: {
            type: 'array',
            items: { type: 'string' },
            description: '指定角色ID列表。留空则全队检定',
          },
        },
        required: ['ability', 'dc', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_combat',
      description: '当遭遇敌对生物或冲突需要进入战斗时调用',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: '进入战斗的原因' },
          enemies: {
            type: 'array',
            description: '敌方生物列表（预留，CombatState实现后使用）',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                count: { type: 'number' },
              },
            },
          },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'restrict_action',
      description: '限制下一轮仅允许指定角色行动（如仅队长可与国王对话，仅盗贼可尝试潜行）。传空数组解除限制。',
      parameters: {
        type: 'object',
        properties: {
          characterIds: {
            type: 'array',
            items: { type: 'string' },
            description: '允许行动的角色ID列表。空数组 = 解除限制，所有人可行动',
          },
          reason: { type: 'string', description: '限制原因' },
        },
        required: ['characterIds', 'reason'],
      },
    },
  },
];
```

### 5.8 Room Refactoring Plan

The existing `Room` class loses its game processing logic to `GameSession`. The remaining Room is a thin orchestrator:

**Methods that stay in Room:**
- `initialize()`, `close()`
- `addPlayerAction()`, `getCurrentPlayerActions()`, `hasAllPlayersActed()`
- `save()`, `load()`
- `getMembers()`, `getMemberCount()`, `canAcceptMoreMembers()`
- `getPlayerNotes()`, `addPlayerNote()`, `deletePlayerNote()`
- `getConversationHistory()`, `getStatusBarManager()`

**Methods that move to GameSession:**
- `processPlayerInput()` → `GameSession.processActions()`
- `streamProcessPlayerInput()` → `GameSession.processActions()` (AsyncGenerator)
- `processCombinedPlayerActions()` → `GameSession.processActions()`
- `streamProcessCombinedPlayerActions()` → `GameSession.processActions()`
- `buildMessages()` → `ExplorationState` (via ContextBuilder)
- `buildMessagesForCombinedActions()` → `ExplorationState`
- `extractStatusBarUpdates()` → post-processing in Room after consuming SessionEvents

**Room's new processing flow:**
```typescript
// In Room (simplified)
async *streamProcessCombinedPlayerActions(): AsyncGenerator<string> {
  const actions = [...this.currentPlayerActions];
  this.currentPlayerActions = [];

  let fullResponse = '';

  for await (const event of this.gameSession.processActions(actions)) {
    switch (event.type) {
      case 'narrative_chunk':
        fullResponse += event.content;
        yield event.content;  // SSE to client
        break;
      case 'dice_roll':
        this.broadcastDiceEvent(event.data);  // SSE dice event
        break;
      case 'action_restriction':
        // TurnGate already updated by GameSession
        this.broadcastRestriction(event);
        break;
    }
  }

  // Post-processing (unchanged from current code)
  this.conversationHistory.add({ userInputs: actions, assistantResponse: fullResponse, timestamp: Date.now() });
  this.turnCount += 1;
  this.extractStatusBarUpdates(actions, fullResponse);
  this.save();
}
```

---

## 6. CombatState Interface (reserved)

CombatState is not implemented in this phase but the interface is defined for forward compatibility.

```typescript
// domain/game/session.ts

export interface ICombatState extends IGameState {
  readonly name: 'combat';

  // Combat-specific interface (to be designed)
  getInitiativeOrder(): CombatParticipant[];
  getCurrentTurn(): CombatParticipant | null;
  // ...
}

export interface CombatParticipant {
  id: string;
  name: string;
  initiative: number;
  isPlayer: boolean;
  characterId?: string;
}

// Placeholder for future event queue within CombatState
export interface IEventQueue<T> {
  enqueue(event: T): void;
  dequeue(): T | undefined;
  peek(): T | undefined;
  isEmpty(): boolean;
  clear(): void;
}
```

---

## 7. Implementation Plan

### Phase 1: Foundation — ILLMClient Extension + Types (Week 1)
- [ ] Add `ToolDefinition`, `ToolCall`, `ChatOptions` to `domain/llm/types.ts`
- [ ] Extend `LLMMessage` with `tool_calls` and `tool_call_id` fields
- [ ] Extend `LLMResponse` with optional `toolCalls`
- [ ] Modify `OpenAIClient.chat()` to accept and pass tools
- [ ] Modify `OpenAIClient.streamChat()` to accumulate tool_call chunks
- [ ] Add `SessionEvent` types to `domain/game/session.ts`
- [ ] Add `IGameState` interface
- [ ] Verify all existing call sites still compile (backward compat)

### Phase 2: GameSession + TurnGate (Week 1-2)
- [ ] Implement `TurnGate` interface and `AllPlayerGate`, `RestrictedGate`
- [ ] Implement `GameSession` class with state machine skeleton
- [ ] Define `GameSessionContext` and wire dependencies

### Phase 3: ExplorationState + Tool Calling Pipeline (Week 2-3)
- [ ] Define `EXPLORATION_TOOLS` constant
- [ ] Implement `ExplorationState.processActions()` with tool loop
- [ ] Implement tool executors (`executeAbilityCheck`, `executeSavingThrow`, `executeGroupCheck`)
- [ ] Implement `restrict_action` and `start_combat` tool handlers
- [ ] Integration test: player action → check → narrative

### Phase 4: Room Refactoring (Week 3)
- [ ] Create `GameSession` instance in `RoomFactory`
- [ ] Refactor Room to delegate `processPlayerInput` → `GameSession.processActions`
- [ ] Refactor Room to delegate `streamProcessCombinedPlayerActions` → `GameSession.processActions`
- [ ] Remove `buildMessages` / `buildMessagesForCombinedActions` from Room
- [ ] Keep `extractStatusBarUpdates` as Room post-processing
- [ ] Verify all API routes still work

### Phase 5: SSE Extension + Frontend (Week 3-4)
- [ ] Extend SSE endpoint to broadcast `dice_roll` events
- [ ] Extend SSE endpoint to broadcast `action_restriction` events
- [ ] Create Combat Log sidebar UI component
- [ ] Add dice result display formatting
- [ ] Add TurnGate status display (who can act)

### Phase 6: Testing & Polish (Week 4)
- [ ] Unit tests for ExplorationState tool loop
- [ ] Unit tests for TurnGate implementations
- [ ] Integration test for chain checks (lock → trap → save)
- [ ] Integration test for action restriction flow
- [ ] Edge cases: LLM returns invalid tool args, tool execution fails, max rounds exceeded
- [ ] Documentation update

---

## 8. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| LLM tool calls are wrong/excessive | Wrong checks, wasted rounds | Medium | `MAX_TOOL_ROUNDS = 5`; system prompt instructions for when to check; admin override |
| LLM ignores tools entirely | No checks ever triggered | Low | Tune system prompt; set `tool_choice: 'auto'`; manual `/roll` command as fallback |
| DeepSeek tool calling quality | Weaker than OpenAI | Medium | Test with both providers; may need provider-specific prompt tuning |
| Tool calling adds latency | Slower turn processing | Medium | Each tool round is fast (GameEngine is sync); main cost is LLM round-trips. Acceptable for check-heavy turns |
| Room refactoring breaks API | Existing features regress | Low | Room's public interface (`IRoom`) unchanged; only internal delegation changes |
| Players miss sidebar events | Key info not seen | Medium | Highlight sidebar on new events; brief inline summary in narrative |

---

## 9. Open Questions

1. **Streaming with tool calls:** When using `streamChat`, we need to detect tool_call chunks mid-stream. Should we switch to non-streaming for tool-enabled calls, or accumulate tool_call deltas? (Recommend: non-streaming for tool rounds, streaming for final narrative)
2. **Character ID resolution:** LLM needs to reference characters by ID in tool calls. How do we provide the ID mapping? (Recommend: include character roster with IDs in system prompt via ContextBuilder)
3. **Cost monitoring:** Tool calling rounds multiply LLM API costs per turn. Should we add per-room cost tracking? (Recommend: log token usage per turn, alert if average > threshold)
4. **`restrict_action` UX:** When LLM restricts action to specific characters, how do other players know? (Recommend: SSE event + UI banner "等待 [角色名] 行动...")

---

## Document History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-02-23 | 0.1 | Initial draft: three-state, dual queues, separate LLM analysis | AI Design Team |
| 2026-02-24 | 0.2 | Major revision: two-state, pipeline model, LLM tool calling, GameSession extraction, TurnGate | AI Design Team |

**Revision 0.2 summary:**
- Removed DialogueState (merged into Exploration via TurnGate)
- Removed dual queues (replaced with AsyncGenerator pipeline)
- Replaced separate LLM analysis call with integrated tool calling
- Added GameSession extraction plan from Room
- Added TurnGate abstraction for action permission control
- Added chain check design (multi-round tool calling loop)
- Added CombatState interface reservation
- Added detailed component designs and code sketches
