# Game Engine and Context Management Design

**Date:** 2026-02-09
**Status:** Draft
**Author:** Design Session

## Overview

This document describes the design for three interconnected systems to enhance the TRPG server:

1. **Context Management System** - Structured, observable pipeline for building LLM context
2. **Game Engine (D&D 5e)** - Dice rolling, ability checks, combat mechanics
3. **Message Rendering System** - Markdown parsing and proper message display

Additionally, it defines a three-layer character state model and persistence strategy for game saves.

---

## Architecture

### High-Level Structure

```
┌─────────────────────────────────────────────────────────────┐
│                      Room (Application)                      │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │ContextBuilder│→ │ GameEngine    │→ │MessageRenderer   │  │
│  └──────────────┘  └───────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Module Structure

```
src/
├── domain/
│   ├── llm/
│   │   ├── types.ts              # Existing LLM types
│   │   └── context.ts            # NEW: ContextBuilder, ContextProvider interfaces
│   ├── game/
│   │   ├── types.ts              # NEW: GameEngine interface, dice types
│   │   ├── dnd5e/
│   │   │   ├── abilities.ts      # Ability, Skill enums
│   │   │   ├── conditions.ts     # Condition definitions
│   │   │   └── rules.ts          # D&D 5e rule constants
│   ├── messages/
│   │   └── types.ts              # NEW: GameMessage, DiceRoll, etc.
│   └── character/
│       └── types.ts              # Existing - will extend
├── application/
│   ├── context/
│   │   ├── ContextBuilder.ts     # Implements ContextBuilder
│   │   └── providers/
│   │       ├── SystemPromptProvider.ts
│   │       ├── ModuleContextProvider.ts
│   │       ├── CharacterProfileProvider.ts
│   │       ├── GameRulesProvider.ts
│   │       └── ConversationHistoryProvider.ts
│   ├── game/
│   │   ├── GameEngine.ts         # Implements GameEngine
│   │   └── GameStateManager.ts   # Manages GameState persistence
│   └── messages/
│       └── MessageRenderer.ts    # Message rendering logic
├── infrastructure/
│   ├── game/
│   │   └── DiceRoller.ts         # RNG implementation (testable)
│   └── database/lowdb/
│       └── GameStateRepository.ts  # NEW: Save/load GameState
└── utils/
    ├── dice.ts                   # NEW: Dice parsing utilities
    └── markdown.ts               # NEW: Markdown wrapper around marked
```

---

## Frontend Architecture

### HTMX Retention Decision

**Decision:** Keep HTMX. The current issues are bugs, not architectural limitations.

**Rationale:**
- HTMX handles form submissions (actions) well
- SSE handles streaming perfectly
- The only missing piece is markdown rendering (simple add-on)

### Fixes Required

1. **Duplicate message bug** - Don't render individual action if rendering all
2. **Markdown parsing** - Use `marked` library (already in dependencies)
3. **Proper history rendering** - Store and display player names

---

## Character State Architecture

### Three-Layer Model

```
┌─────────────────────┐
│  CharacterTemplate  │ (database: characters)
│  - Never changes    │
│  - Reusable         │
└─────────────────────┘
           ↓ (referenced by)
┌─────────────────────┐
│   CharacterState    │ (database: saveSlots.roomId.characters)
│  - Per-save data    │
│  - HP, conditions   │
└─────────────────────┘
           ↓ (part of)
┌─────────────────────┐
│     GameState       │ (database: saveSlots.roomId.gameState)
│  - Party location   │
│  - World flags      │
└─────────────────────┘
```

### Layer 1: CharacterTemplate (Static)

```typescript
interface CharacterTemplate {
  id: string;
  name: string;
  race: string;
  class: CharacterClass;
  level: number;
  abilityScores: AbilityScores;
  alignment: string;
  appearance: string;
  backstory: string;
  personalityTraits: string;
  baseMaxHp: number;
  baseArmorClass: number;
}
```

**Storage:** `characters` collection
**Usage:** Character selection screen
**Mutability:** Never modified during gameplay

### Layer 2: CharacterState (Dynamic, per-save)

```typescript
interface CharacterState {
  instanceId: string;      // Runtime ID
  characterId: string;     // References template
  currentHp: number;
  temporaryHp: number;
  conditions: Condition[];
  activeBuffs: Buff[];
  currentThoughts: string;
  knownSpells: SpellSlot[];
  equipmentState: {
    worn: string[];
    wielded: string[];
  };
}
```

**Storage:** `gameStates[].characterStates`
**Usage:** During gameplay
**Mutability:** Modified continuously

### Layer 3: GameState (Party/World, per-save)

```typescript
interface GameState {
  roomId: string;
  moduleName?: string;
  location: Location;
  characterStates: Map<string, CharacterState>;
  worldFlags: Record<string, string>;
  activeEncounters: Encounter[];
  lastUpdated: number;
}
```

**Storage:** `gameStates` array
**Usage:** Room state persistence
**Mutability:** Modified each turn

---

## Context Management System

### Core Interfaces

```typescript
interface ContextBlock {
  name: string;
  content: string;
  priority: number;
  metadata?: Record<string, unknown>;
}

interface ContextProvider {
  name: string;
  priority: number;
  provide(state: GameState): ContextBlock | ContextBlock[] | null;
}

interface ContextBuilder {
  add(provider: ContextProvider): this;
  build(state: GameState): Promise<LLMMessage[]>;
  getContextSnapshot(): ContextSnapshot;
}
```

### Provider Pipeline

```typescript
class ContextBuilderImpl implements ContextBuilder {
  private providers: ContextProvider[] = [];
  private buildLog: BuildLogEntry[] = [];

  async build(state: GameState): Promise<LLMMessage[]> {
    // Sort by priority, execute providers, log results
    // Combine blocks into LLM messages
  }

  getContextSnapshot(): ContextSnapshot {
    // Return debug info with build log and token estimate
  }
}
```

### Built-in Providers

| Provider | Priority | Purpose |
|----------|----------|---------|
| SystemPromptProvider | 0 | Base DM system prompt |
| ModuleContextProvider | 100 | Module-specific rules/lore |
| CharacterProfileProvider | 200 | All character stats + current states |
| GameRulesProvider | 300 | D&D 5e rules (conditional) |
| ConversationHistoryProvider | 400 | Last 5 turns |

### Observability

```typescript
// Debug endpoint
router.get('/rooms/:roomId/context-debug', (req, res) => {
  const snapshot = room.getContextSnapshot();
  res.json({
    snapshot,
    fullContext: await room.contextBuilder.build(gameState)
  });
});
```

---

## Message Rendering System

### Message Structure

```typescript
interface GameMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  content: string;
  sender?: {
    userId: string;
    username: string;
    characterId?: string;
    characterName?: string;
  };
  mechanics?: {
    diceRolls?: DiceRoll[];
    checks?: AbilityCheck[];
    combat?: CombatEvent;
  };
}

interface DiceRoll {
  formula: string;
  rolls: number[];
  modifier: number;
  total: number;
  reason: string;
}
```

### Message Renderer

```typescript
class MessageRenderer {
  // Server-side rendering for initial load
  renderMessageHtml(message: GameMessage): string;

  // Render dice rolls with formatting
  private renderDiceRoll(roll: DiceRoll): string;

  // For SSE streaming
  renderStreamingChunk(chunk: string): string;

  // Finalize streaming with markdown
  finalizeStreamingContent(content: string): string;
}
```

### Markdown Integration

Uses `marked` library (already in dependencies):
```typescript
import { marked } from 'marked';

export function parseMarkdown(text: string): string {
  return marked.parse(text);
}
```

---

## Game Engine (D&D 5e)

### Core Interface

```typescript
interface GameEngine {
  // Dice rolling
  roll(formula: string): DiceRoll;
  rollDamage(dice: string, modifier: number): DiceRoll;

  // Ability checks
  abilityCheck(characterId: string, ability: Ability, advantage?: RollType): AbilityCheckResult;
  savingThrow(characterId: string, ability: Ability, advantage?: RollType): SavingThrowResult;

  // Combat
  attackRoll(attackerId: string, weapon: Weapon, advantage?: RollType): AttackResult;
  applyDamage(targetId: string, damage: number, damageType: DamageType): DamageResult;

  // State management
  getCharacterState(characterId: string): CharacterState | null;
  updateCharacterState(characterId: string, updates: Partial<CharacterState>): void;

  // Conditions & effects
  applyCondition(targetId: string, condition: Condition): void;
  removeCondition(targetId: string, conditionName: string): void;
}
```

### Implementation

```typescript
class D20GameEngine implements GameEngine {
  constructor(
    private diceRoller: DiceRoller,
    private characterRepo: CharacterRepository
  ) {}

  roll(formula: string): DiceRoll {
    const parsed = parseDiceFormula(formula);
    const rolls = parsed.count.map(() => this.diceRoller.roll(parsed.sides));
    const total = rolls.reduce((a, b) => a + b, 0) + parsed.modifier;
    return { formula, rolls, modifier: parsed.modifier, total };
  }

  abilityCheck(characterId: string, ability: Ability, advantage: RollType): AbilityCheckResult {
    // Calculate modifier from ability score
    // Roll with advantage/disadvantage
    // Return result
  }
}
```

### Dice Roller (Testable)

```typescript
interface DiceRoller {
  roll(sides: number): number;
}

class RandomDiceRoller implements DiceRoller {
  roll(sides: number): number {
    return Math.floor(Math.random() * sides) + 1;
  }
}

// For testing
class FixedDiceRoller implements DiceRoller {
  constructor(private values: number[]) {}
  roll(sides: number): number {
    return this.values.shift() ?? 1;
  }
}
```

---

## Data Flow

### Multi-Player Turn Flow

```
Player actions → Room.addPlayerAction()
     ↓
Check: hasAllPlayersActed()?
     ├─ NO → Return "waiting" indicator
     └─ YES → Continue
          ↓
Room.streamProcessCombinedPlayerActions()
     ↓
1. Build Context (ContextBuilder)
   - System prompt
   - Module context
   - Character profiles
   - Game rules (if combat)
   - Conversation history
     ↓
2. Call LLM (streaming)
   - Broadcast chunks via SSE
   - Client appends to DOM
     ↓
3. Streaming Complete
   - Client fetches markdown rendering
   - Final HTML replaces streaming container
     ↓
4. Update Game State
   - conversationHistory.add()
   - gameStateManager.updateFromResponse()
   - Auto-save
   - Reset player actions
```

### Key Integration Points

**Room.ts** orchestrates everything:
- Uses ContextBuilder for LLM messages
- Uses GameEngine for mechanics
- Uses GameStateManager for persistence
- Uses MessageRenderer for display

---

## Persistence Strategy

### Database Schema Updates

```typescript
interface DatabaseSchema {
  // NEW: Game states
  gameStates: GameStateRecord[];

  // MODIFIED: Extended with mechanics
  conversationTurns: (ConversationTurnRecord & {
    mechanics?: {
      diceRolls?: DiceRoll[];
      checks?: AbilityCheck[];
      combat?: CombatEvent;
    };
  })[];

  // NEW: Save slots
  saveSlots: SaveSlotRecord[];
}
```

### Save/Load Flow

```typescript
class GameStateManager {
  async save(slotName?: string, description?: string): Promise<SaveResult> {
    // Save state with timestamp
    // Generate description from state
    // Update save slot metadata
  }

  async load(slotName: string): Promise<LoadResult> {
    // Load save slot metadata
    // Load game state
    // Validate and restore
    // Reinitialize game engine
  }

  private generateDescription(state: GameState): string {
    // "Location: Tavern | Party: Fighter (12/20 HP), Wizard (8/12 HP)"
  }
}
```

### Auto-Save

After each turn:
```typescript
await this.gameStateManager.save('autosave', `Auto-save after turn ${this.turnCount}`);
```

---

## Error Handling

### Custom Error Types

```typescript
class GameEngineError extends Error {
  constructor(message: string, public code: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

class ContextBuildError extends Error {
  constructor(message: string, public provider: string, public cause?: Error) {
    super(message);
  }
}

class SaveLoadError extends Error {
  constructor(message: string, public slotName: string, public operation: 'save' | 'load' | 'delete') {
    super(message);
  }
}
```

### Error Handling Strategy

- **Context Builder**: Log non-critical provider failures, continue with others
- **Game Engine**: Validate inputs, throw descriptive errors
- **API**: Return appropriate status codes with JSON/HTMX responses
- **Client**: Show user-friendly errors, retry buttons where appropriate

---

## Implementation Plan

### Phase 1: Foundation (Context & Character State) - CRITICAL

| Task | File | Effort |
|------|------|--------|
| Create domain interfaces | `src/domain/llm/context.ts` | 2h |
| Create game state types | `src/domain/game/GameState.ts` | 2h |
| Create game engine types | `src/domain/game/types.ts` | 1h |
| Create D&D 5e rule constants | `src/domain/game/dnd5e/*.ts` | 2h |
| Extend Character types | `src/domain/character/types.ts` | 1h |
| Create Message types | `src/domain/messages/types.ts` | 1h |
| Create utility functions | `src/utils/dice.ts`, `markdown.ts` | 1h |

### Phase 2: Infrastructure & Repositories - HIGH

| Task | File | Effort |
|------|------|--------|
| DiceRoller implementation | `src/infrastructure/game/DiceRoller.ts` | 1h |
| Update database schema | `src/infrastructure/database/lowdb/connection.ts` | 2h |
| GameStateRepository | `src/infrastructure/database/lowdb/GameStateRepository.ts` | 3h |
| Update DatabaseService | `src/infrastructure/database/DatabaseService.ts` | 1h |

### Phase 3: Context Management - HIGH

| Task | File | Effort |
|------|------|--------|
| ContextBuilderImpl | `src/application/context/ContextBuilder.ts` | 3h |
| SystemPromptProvider | `src/application/context/providers/` | 1h |
| CharacterProfileProvider | `src/application/context/providers/` | 2h |
| GameRulesProvider | `src/application/context/providers/` | 2h |
| ConversationHistoryProvider | `src/application/context/providers/` | 1h |
| ModuleContextProvider | `src/application/context/providers/` | 1h |

### Phase 4: Game Engine (Core) - HIGH

| Task | File | Effort |
|------|------|--------|
| D20GameEngine base | `src/application/game/GameEngine.ts` | 3h |
| Dice rolling methods | `src/application/game/GameEngine.ts` | 2h |
| Ability checks | `src/application/game/GameEngine.ts` | 2h |
| Saving throws | `src/application/game/GameEngine.ts` | 1h |
| Combat basics | `src/application/game/GameEngine.ts` | 3h |
| Condition system | `src/application/game/GameEngine.ts` | 2h |
| Character state management | `src/application/game/GameEngine.ts` | 2h |

### Phase 5: GameStateManager & Persistence - HIGH

| Task | File | Effort |
|------|------|--------|
| GameStateManager base | `src/application/game/GameStateManager.ts` | 2h |
| Save implementation | `src/application/game/GameStateManager.ts` | 2h |
| Load implementation | `src/application/game/GameStateManager.ts` | 2h |
| Auto-save integration | `src/application/room/Room.ts` | 1h |
| Save API routes | `src/api/routes/saves.ts` | 2h |
| Save UI (HTMX) | `views/partials/save-menu.pug` | 2h |

### Phase 6: Message Rendering & Frontend Fixes - MEDIUM

| Task | File | Effort |
|------|------|--------|
| MessageRenderer class | `src/application/messages/MessageRenderer.ts` | 2h |
| Fix duplicate message bug | `src/api/routes/rooms.ts` | 1h |
| Markdown parsing endpoint | `src/api/routes/messages.ts` | 1h |
| Update streaming.js | `public/js/streaming.js` | 2h |
| CSS for dice rolls/conditions | `public/css/*.css` | 2h |

### Phase 7: Room Integration - HIGH

| Task | File | Effort |
|------|------|--------|
| Update Room constructor | `src/application/room/Room.ts` | 2h |
| Replace buildMessages | `src/application/room/Room.ts` | 2h |
| Update streaming methods | `src/application/room/Room.ts` | 2h |
| Update web.ts initialization | `src/api/routes/web.ts` | 1h |
| Error handling integration | All files | 2h |

### Phase 8: Testing - MEDIUM

| Task | File | Effort |
|------|------|--------|
| DiceRoller tests | `test/infrastructure/game/DiceRoller.test.ts` | 1h |
| GameEngine tests | `test/application/game/GameEngine.test.ts` | 3h |
| ContextBuilder tests | `test/application/context/ContextBuilder.test.ts` | 2h |
| MessageRenderer tests | `test/application/messages/MessageRenderer.test.ts` | 1h |
| Integration test | `test/integration/room-turn.test.ts` | 3h |

### Phase 9: Error Handling - LOW

| Task | File | Effort |
|------|------|--------|
| Custom error types | `src/utils/errors.ts` | 1h |
| Error handler middleware | `src/api/middleware/errorHandler.ts` | 2h |
| Client error handling | `public/js/*.js` | 1h |
| Error logging | `src/utils/logger.ts` | 1h |

### Phase 10: Documentation & Cleanup - LOW

| Task | Effort |
|------|--------|
| Update CLAUDE.md | 2h |
| Update README.md | 1h |
| Add JSDoc comments | 3h |
| Remove deprecated code | 2h |
| Database migration guide | 1h |

### Implementation Schedule

**Sprint 1 (Week 1): Foundation**
- Phase 1 → Phase 2 → Phase 3
- Goal: Context system working

**Sprint 2 (Week 2): Core Mechanics**
- Phase 4 → Phase 5
- Goal: Save/load working, dice rolling working

**Sprint 3 (Week 3): Integration & Fixes**
- Phase 6 → Phase 7 → Phase 9
- Goal: All bugs fixed, full integration

**Sprint 4 (Week 4): Polish**
- Phase 8 → Phase 10
- Goal: Tests, documentation, cleanup

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Comprehensive integration tests before changes |
| Database migration issues | Migration script, backup strategy |
| LLM context too large | Token counting, context pruning |
| Performance degradation | Profiling, lazy loading |
| Multi-player race conditions | Proper async handling, state locking |

---

## Appendix: Key Type Definitions

### Abilities and Skills

```typescript
type Ability = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';

type Skill = 'acrobatics' | 'animal-handling' | 'arcana' | 'athletics' | 'deception'
          | 'history' | 'insight' | 'intimidation' | 'investigation' | 'medicine'
          | 'nature' | 'perception' | 'performance' | 'persuasion' | 'religion'
          | 'sleight-of-hand' | 'stealth' | 'survival';

type RollType = 'normal' | 'advantage' | 'disadvantage';

type DamageType = 'acid' | 'cold' | 'fire' | 'force' | 'lightning' | 'necrotic'
               | 'piercing' | 'poison' | 'psychic' | 'radiant' | 'slashing' | 'thunder';
```

### Conditions

```typescript
interface Condition {
  name: string;
  source: string;
  appliedAt: number;
  expiresAt?: number;
}
```

### Buffs

```typescript
interface Buff {
  name: string;
  source: string;
  duration?: number; // in rounds
  statAdjustments?: Record<string, number>;
  grantedBy?: string; // spell or item ID
}
```

---

**Document Version:** 1.0
**Last Updated:** 2026-02-09
