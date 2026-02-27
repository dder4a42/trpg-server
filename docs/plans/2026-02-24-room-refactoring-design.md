# Room & Routes Refactoring Design

**Date:** 2026-02-24
**Status:** Design Revised
**Author:** Claude Code

## Overview

Refactor `Room.ts` (793 lines) and `routes/rooms.ts` (609 lines) into smaller, focused modules using the **composition pattern**.

- Room becomes a lightweight coordinator (facade) delegating to manager classes.
- The action API is unified into one canonical turn-processing flow aligned with the existing **GameSession + TurnGate** design.
- Remove Room-level redundant context building: narrative generation always flows through GameSession states (e.g. `ExplorationState`) and `ContextBuilder` is invoked there.
- All data reads/writes go through a single room data gateway + managers (routes do not directly query the DB for room-scoped data).
- Player notes move to stable **ID-based** records (UUID) with backward-compatible adapters.
- Existing endpoints remain supported via thin adapters (no behavior-breaking change).

## Motivation

- **Better organization** - Split large files into focused, single-responsibility modules
- **Easier testing** - Managers can be unit tested in isolation
- **Improved maintainability** - Changes to notes/actions/members/saves are isolated
- **Unified action flow** - One canonical processing path matching GameSession semantics
- **Single I/O pathway** - Centralize persistence for consistency and easier debugging
- **Stable notes** - Notes are addressable by ID (avoids index-race and multi-client ordering issues)
- **No breaking changes** - Public `IRoom` interface remains; routes preserved via adapters

## Architecture

### Room Class (793 → ~200 lines)

Room becomes a facade/coordinator that owns managers and delegates operations:

```typescript
export class Room implements IRoom {
  // Core dependencies
  private llmClient: ILLMClient;
  private contextBuilder: IContextBuilder;
  private gameEngine: GameEngine;
  private gameSession: GameSession;

  // Composed managers
  private actionManager: ActionManager;
  private noteManager: NoteManager;
  private memberManager: MemberManager;
  private saveManager: SaveManager;
  private eventManager: EventManager;

  // State
  readonly id: string;
  readonly state: RoomState;
  private gameState: GameState;
  private turnCount: number;
}
```

### Key Principle: Engine-aligned boundaries

- **GameSession** owns the game-flow state machine, and emits `SessionEvent`.
- **Room** owns orchestration across managers and implements `IRoom`.
- Managers own *data coordination* and *persistence*; they do not embed game-flow logic.

### Key Principle: No Room-level message building

- `ContextBuilder.build(gameState)` is called inside game states (e.g. `ExplorationState`), not in Room.
- `Room.processPlayerInput()` / streaming variants become thin adapters that enqueue a single `PlayerAction` and call the canonical turn-processing flow.
- The only allowed extra LLM call outside turn processing is **status bar extraction**, which is best-effort.

### Room Data Gateway (Unified I/O)

To enforce “one way in/out” for persistence and room-scoped reads, Room receives a single gateway object used by managers.

```typescript
export interface RoomDataGateway {
  roomMemberships: {
    getRoomMembers(roomId: string): Promise<{ userId: string; joinedAt: Date; characterId?: string }[]>;
    getActiveMemberCount(roomId: string): Promise<number>;

    // Notes v2 (preferred)
    getPlayerNotes(roomId: string, userId: string): Promise<PlayerNote[]>;
    setPlayerNotes(roomId: string, userId: string, notes: PlayerNote[]): Promise<void>;

    // Legacy notes (for migration only)
    getNotes(roomId: string, userId: string): Promise<string[]>;
    updateNotes(roomId: string, userId: string, notes: string[]): Promise<void>;
  };

  userRepo: { findById(userId: string): Promise<{ id: string; username: string } | null> };
  characterRepo: { findById(id: string): CharacterData | null };

  conversationHistoryRepo?: {
    addTurnWithActions(roomId: string, playerActions: PlayerAction[], assistantResponse: string, additionalMetadata?: Record<string, unknown>): Promise<unknown>;
    getHistory(roomId: string, limit?: number, offset?: number): any[];
  };
  statusBarRepo?: {
    getStatusBarData(roomId: string): any;
    deleteAllForRoom(roomId: string): Promise<void>;
    addEntry(roomId: string, type: 'short_term' | 'long_term', content: string): Promise<any>;
    setFlag(roomId: string, key: string, value: string): Promise<void>;
  };

  gameStateManager: GameStateManager;
}
```

Rules:

- Routes must not read/write notes/members/history/statusBar directly via `DatabaseService`.
- Routes interact with Room methods only; Room delegates to managers; managers use `RoomDataGateway`.

### Manager Interfaces

#### ActionManager

**Responsibility:** Collect, queue, and manage player actions with TurnGate-aware completion.

```typescript
interface ActionManager {
  addAction(userId: string, username: string, action: string, characterId?: string): Promise<void>;
  getActions(): PlayerAction[];
  drainActions(): PlayerAction[];
  hasAllActed(members: RoomMember[], turnGate: TurnGate): boolean;
}
```

**Dependencies:** None (in-memory)
**Notes:** Must align with `TurnGate.canAdvance()` semantics; do not rely on member count alone.

#### MemberManager

**Responsibility:** Member list/count, character association enrichment, and *engine state hydration*.

```typescript
interface MemberManager {
  getMembers(): Promise<RoomMember[]>;
  getMemberCount(): Promise<number>;
  canAcceptMore(maxPlayers: number): Promise<boolean>;

  // Hydration for engine correctness
  ensureCharacterStatesLoaded(): Promise<void>;
}
```

**Dependencies:** roomMemberships, userRepo, characterRepo, gameEngine, gameState
**Notes:** CharacterState construction must be centralized (prefer GameEngine/Factory).

#### NoteManager

**Responsibility:** Player notes CRUD + persistence with stable IDs; keeps GameState notes view updated.

```typescript
interface NoteManager {
  listNotes(userId: string): Promise<PlayerNote[]>;
  addNote(userId: string, content: string): Promise<PlayerNote>;
  deleteNoteById(userId: string, noteId: string): Promise<void>;
  loadAllNotes(): Promise<void>; // includes legacy migration
}
```

**Dependencies:** roomMemberships, gameState
**Notes:**

- Storage is `PlayerNote[]` with UUID `id`.
- Migration: if repo returns legacy `string[]`, NoteManager upgrades to `PlayerNote[]` (assigning new UUIDs, `createdAt` = now with stable ordering), then persists via `setPlayerNotes`.
- StatusBar extraction remains separate from notes to avoid feature coupling.

#### SaveManager

**Responsibility:** Save/load orchestration for conversation history, status bar, and game state snapshots.

```typescript
interface SaveManager {
  saveTurn(turn: ConversationTurn): Promise<void>;
  saveRoomState(): Promise<void>; // status bar, conversation history diff, etc.
  loadRoomState(): Promise<void>;
}
```

**Dependencies:** gateway (conversationHistoryRepo, statusBarRepo, gameStateManager)
**Notes:** Must avoid duplicates and support partial failures with clear error codes.

#### EventManager

**Responsibility:** Typed wrapper around EventEmitter to broadcast game events.

```typescript
interface EventManager {
  onGameEvent(handler: (event: SessionEvent) => void): void;
  offGameEvent(handler: (event: SessionEvent) => void): void;
  emitGameEvent(event: SessionEvent): void;
}
```

**Dependencies:** None
**Notes:** Keep event names internal; routes should subscribe via a stable method.

## File Structure

### Application Layer

```
src/application/room/
├── Room.ts
├── managers/
│   ├── ActionManager.ts
│   ├── NoteManager.ts
│   ├── MemberManager.ts
│   ├── SaveManager.ts
│   └── EventManager.ts
└── types.ts
```

### Routes Layer

```
src/api/routes/rooms/
├── index.ts
├── create.ts
├── actions.ts
├── notes.ts
├── state.ts
└── debug.ts
```

## Data Flow

### Unified Turn Processing Flow

```
Route → Room.processTurn({ stream, mode })
    ↓
ActionManager.drainActions()
    ↓
MemberManager.ensureCharacterStatesLoaded()
    ↓
GameSession.processActions(actions) → yields SessionEvents
    ↓
EventManager.emitGameEvent(event) → SSE/UI
    ↓
Room.turnCleanup() → persist + status extraction
```

### Initialization Order (Room.initialize)

1. EventManager ready
2. MemberManager prefetch members (optional cache)
3. SaveManager.loadRoomState() (conversation history + status bar)
4. NoteManager.loadAllNotes() (and reflect into GameState)
5. MemberManager.ensureCharacterStatesLoaded() (engine correctness for tool calls)

### Turn Cleanup (Room.turnCleanup)

Single place to enforce consistency:

- increment turnCount
- update GameState timestamp
- persist autosave snapshot (GameStateManager)
- persist conversation history/status bar (SaveManager)
- trigger status bar extraction (async; best-effort)

## Context Building (Revised)

Decision: remove redundant context building inside Room.

- All narrative generation uses `GameSession.processActions()`.
- `ContextBuilder` is called inside game state implementations (e.g. `ExplorationState`).
- Room must not have `buildMessages()` / `buildMessagesForCombinedActions()`.
- `processPlayerInput()` becomes an adapter:
  - builds a single `PlayerAction` (userId/username/characterId/characterName)
  - enqueues via ActionManager
  - calls `processTurn({ mode: 'single', stream })`

This keeps “one canonical prompt path” and ensures tooling/dice/events work identically for single-player and combined actions.

## Routes Structure

### Canonical Action Endpoints

- `POST /api/rooms/actions/collect`
  - Adds/replaces one player action in the current turn queue.
- `POST /api/rooms/actions/process`
  - Processes the current turn using the canonical flow; supports streaming.

### Legacy Adapters (preserved)

- `POST /api/rooms/collect-action` → adapter to `/actions/collect`
- `POST /api/rooms/process-actions` → adapter to `/actions/process`
- `POST /api/rooms/action` → adapter preserving “single message” semantics

### Turn Completion Rule (TurnGate-aligned)

- Determine completion with `ActionManager.hasAllActed(members, gameSession.getTurnGate())`
- Do not use member count alone; must respect `RestrictedGate` / `InitiativeGate`.

### routes/rooms/index.ts

```typescript
import { Router } from 'express';
import { createRoutes } from './create.js';
import { actionRoutes } from './actions.js';
import { notesRoutes } from './notes.js';
import { stateRoutes } from './state.js';
import { debugRoutes } from './debug.js';

const router = Router();

router.use('/', createRoutes);
router.use('/', actionRoutes);
router.use('/', notesRoutes);
router.use('/', stateRoutes);
router.use('/', debugRoutes);

let getRoomsMap: () => Map<string, IRoom>;
let rooms: Map<string, IRoom>;

export function setRoomsMap(getRoomsFn: () => Map<string, IRoom>): void {
  getRoomsMap = getRoomsFn;
  rooms = getRoomsFn();
}

export function getRoomsMapRef() {
  return getRoomsMap;
}

export default router;
```

## Error Handling

| Area | Error Cases | Handling |
|------|-------------|----------|
| Action | Duplicate action from same user | Replace existing action |
| Action | Action not allowed by TurnGate | Return 400 `ACTION_NOT_ALLOWED` |
| Notes | Invalid index, empty note | 400 with clear message |
| Notes | Unknown noteId | 404 `NOTE_NOT_FOUND` |
| Members | Character not found | Log warning, skip that character |
| Save | Repo unavailable/corrupt | Throw with error code; do not crash room |
| Events | No listeners | No-op |

Route-level:

- All routes use `asyncHandler`
- Standardized codes: `ROOM_NOT_FOUND`, `ROOM_INACTIVE`, `INVALID_REQUEST`, `ACTION_NOT_ALLOWED`

## Migration Safety

No breaking changes:

- `IRoom` interface stays identical
- Existing route behavior preserved via adapters
- SSE streaming logic remains in routes/
- GameSession/GameEngine integration unchanged

## Implementation Strategy

### Phase 1: Extract Managers (Room still owns flow)

1. Add `src/application/room/managers/`
2. Extract EventManager first (mechanical)
3. Extract ActionManager and switch Room action queue to it
4. Extract MemberManager with `ensureCharacterStatesLoaded()` and remove duplicate state building from Room
5. Extract NoteManager (load + CRUD + reflect into GameState)
  - Implement legacy `string[]` → `PlayerNote[]` migration inside NoteManager
6. Extract SaveManager (save/load status bar + history diff)
7. Refactor Room to delegate, keep public surface unchanged

### Phase 2: Unify Action Flow + Split Routes

1. Introduce `Room.processTurn({ stream, mode })` + `Room.turnCleanup()`
2. Update Room to use `GameSession.processActions()` exclusively for turn processing
  - Convert `processPlayerInput()` and streaming variant into adapters to `processTurn`
  - Remove Room-level `buildMessages*` and direct `llmClient.chat()` usage for narrative
3. Create `src/api/routes/rooms/` directory
4. Extract `actions.ts` first (highest blast radius: streaming + SSE)
5. Extract `notes.ts`, `create.ts`, `state.ts`, `debug.ts`
6. Add legacy endpoint adapters to preserve behavior
7. Replace `routes/rooms.ts` with a thin re-export of the sub-router

### Phase 3: Testing

1. Unit tests for ActionManager (TurnGate cases)
2. Unit tests for MemberManager hydration (character not found, partial load)
3. Integration tests for Room.processTurn streaming and turnCleanup
4. Route-level tests (HTMX + JSON + streaming; behavior unchanged)

## Additional Refactoring Recommendations (Engine-aligned)

These are not new features; they reduce coupling and align Room responsibilities with the existing engine design.

### 1) Member/CharacterState hydration: remove duplication

- Today Room builds CharacterState itself; GameEngine also has initialization logic.
- Centralize CharacterState creation in one place:
  - Option A: add `gameEngine.ensureCharacterState(characterId, template)`
  - Option B: create `CharacterStateFactory` used by MemberManager and GameEngine
- MemberManager should sync to engine via `gameEngine.syncCharacterStates(gameState.characterStates)` exactly once per turn or upon membership change.

Acceptance (DoD):

- Exploration tool calls (`request_ability_check`, `request_saving_throw`, `request_group_check`) never fail due to missing CharacterState for any active member.
- No CharacterState construction logic remains in Room (single source of truth).
- Hydration is triggered deterministically (turn start or membership/character change), not scattered.

### 2) Save/load boundaries: make turn persistence explicit

- Split “saving a turn” (conversation turn + metadata) from “saving room state” (status bar + snapshots).
- Keep dedupe logic inside SaveManager so Room stays thin.
- Prefer a single `turnCleanup()` call site (avoid saving in multiple places).

Acceptance (DoD):

- Exactly one persistence entry point per turn (`turnCleanup()`), regardless of streaming/non-streaming.
- Conversation history persistence is idempotent (no duplicate turns on restart/reload).
- Partial failures (e.g. statusBarRepo unavailable) do not break turn completion.

### 3) Status bar extraction: make it best-effort and isolated

- Status extraction is an extra LLM call; treat it as asynchronous best-effort.
- Encapsulate it as `StatusBarUpdateService` (or keep function) called from `turnCleanup()`.
- Ensure failures never block the turn response.

Acceptance (DoD):

- Turn narrative response is returned/streamed even if status extraction fails.
- Status extraction executes at most once per completed turn.
- Any extraction error is logged with roomId/turnCount for debugging.

### 4) ContextBuilder usage: enforce one canonical context build per engine turn

- Remove Room-level `buildMessages*` paths after GameSession exists.
- Canonical context assembly should happen inside game states (e.g., ExplorationState) through `ctx.contextBuilder.build(ctx.gameState)`.

Acceptance (DoD):

- Room no longer calls `contextBuilder.build()` for narrative generation.
- Single-player input and combined actions share the same prompt/tooling pipeline (via GameSession).
- All dice/tool events continue to be emitted as `SessionEvent` during turns.

### 5) Notes: adopt stable IDs now (with adapters)

- Domain defines `PlayerNote { id, content, createdAt, userId }` but current persistence uses legacy `string[]`.
- Implement migration in NoteManager:
  - Read legacy `string[]` via gateway
  - Convert to `PlayerNote[]` with UUID IDs
  - Persist back via `setPlayerNotes` (preferred)
- Keep API compatibility:
  - Routes accept `:indexOrId` during transition
  - Internally resolve index → noteId by current ordering, then delete by ID

Acceptance (DoD):

- New notes always receive a UUID and remain deletable by ID across reloads.
- Legacy delete-by-index continues to work during the transition period.
- Routes do not generate fake IDs from index (`note-${index}`) except for compatibility mapping.

### 6) Eventing: type and route only SessionEvents

- Keep route/SSE payload derived from `SessionEvent` only.
- Avoid emitting ad-hoc strings; update EventManager to publish typed events.
- This aligns with future CombatState/InitiativeGate where more event types will appear.

Acceptance (DoD):

- Routes subscribe via EventManager stable methods (no raw `'game-event'` string usage outside Room/EventManager).
- SSE payloads are derivable from `SessionEvent` without `any` branching on unknown shapes.

### 7) Chat: keep chat transport outside Room

- Room should expose minimal hooks (`getRoomChat()` or chat service port) but not manage transport.
- Routes remain responsible for HTTP/SSE concerns; Room remains application orchestration.

Acceptance (DoD):

- No Express/HTMX/SSE-specific logic exists in Room or managers.
- Room does not format HTML; routes own presentation.

## Notes API (Revised)

Canonical behavior:

- `GET /:roomId/notes` returns `{ id, content, createdAt }[]`
- `POST /:roomId/notes` returns the created note (and optionally the full list)
- `DELETE /:roomId/notes/:noteId` deletes by noteId

Compatibility behavior:

- `DELETE /:roomId/notes/:indexOrId` may accept a numeric index (legacy). The handler resolves it to the current note ordering and deletes the corresponding noteId.


## Sizing Estimates

| Component | Before | After |
|-----------|--------|-------|
| Room.ts | 793 lines | ~200 lines |
| routes/rooms.ts | 609 lines | ~50 lines (index) + 6×100 (sub-routes) |
| Total | 1402 lines | ~1050 lines (spread across files) |

## Open Questions

None.

## ADRs

### ADR-001: Composition over Inheritance

**Decision:** Use composition (delegation to managers) rather than inheritance.

**Rationale:**

- Easier testing via explicit dependencies
- Avoid rigid hierarchy

### ADR-002: Keep Routes Separate from Managers

**Decision:** Routes stay in `src/api/routes/rooms/`, managers in `src/application/room/managers/`.

**Rationale:**

- Clean architecture layering
- Routes are HTTP/streaming-specific
- Managers are reusable application logic
