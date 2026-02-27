# TRPG Server - Multi-Agent AI Dungeon Master

Complete TRPG game server with TypeScript, Express, Pug templates, and multi-agent AI DM architecture with streaming updates.

## Quick Start

```bash
cd trpg-server
npm install

# Set environment variables
export OPENAI_API_KEY=your_key
export DEEPSEEK_API_KEY=your_key  # Optional

# Run development server
npm run dev
```

Open http://localhost:3000

## Architecture Overview

```
trpg-server/
├── src/
│   ├── domain/                    # Pure business logic (no external deps)
│   │   ├── game/
│   │   │   ├── session.ts         # Game session types & state machine
│   │   │   └── GameState.ts       # Unified game state model
│   │   ├── llm/
│   │   │   ├── types.ts           # LLM interfaces
│   │   │   └── context.ts         # Context builder types
│   │   └── room/
│   │       └── types.ts           # Room aggregate root interfaces
│   │
│   ├── application/               # Use cases & orchestration
│   │   ├── game/
│   │   │   ├── agents/
│   │   │   │   ├── WorldContextUpdater.ts  # Extracts state from narrative
│   │   │   │   └── MechanicsAgent.ts       # Executes dice/mechanics
│   │   │   ├── states/
│   │   │   │   └── ExplorationState.ts    # Narrator agent (LLM tool loop)
│   │   │   ├── GameEngine.ts              # D&D 5e mechanics
│   │   │   ├── GameStateManager.ts        # State persistence
│   │   │   └── GameSession.ts             # State machine coordinator
│   │   ├── room/
│   │   │   ├── Room.ts                    # Main room orchestration
│   │   │   └── managers/
│   │   │       ├── SaveManager.ts         # Conversation history persistence
│   │   │       ├── NoteManager.ts          # Player notes CRUD
│   │   │       ├── ActionManager.ts        # Player action collection
│   │   │       ├── MemberManager.ts        # Room membership
│   │   │       └── EventManager.ts         # Game event emission
│   │   ├── context/
│   │   │   ├── ContextBuilder.ts           # Provider pipeline
│   │   │   └── providers/
│   │   │       ├── SystemPromptProvider.ts
│   │   │       ├── WorldContextProvider.ts     # DM memory (facts+events+flags)
│   │   │       ├── CharacterStatusProvider.ts  # Active conditions overlay
│   │   │       ├── ModuleContextProvider.ts
│   │   │       ├── CharacterProfileProvider.ts
│   │   │       ├── ConversationHistoryProvider.ts
│   │   │       ├── GameRulesProvider.ts
│   │   │       └── PlayerNotesProvider.ts
│   │   └── messages/
│   │       └── MessageRenderer.ts         # Markdown rendering
│   │
│   ├── infrastructure/            # External I/O implementations
│   │   ├── llm/
│   │   │   └── OpenAIClient.ts
│   │   ├── room/
│   │   │   ├── ConversationHistory.ts
│   │   │   └── RoomChat.ts
│   │   ├── game/
│   │   │   └── DiceRoller.ts
│   │   └── database/
│   │       └── lowdb/
│   │           ├── DatabaseService.ts
│   │           ├── connection.ts
│   │           └── repositories/
│   │
│   ├── api/                       # Express HTTP layer
│   │   ├── routes/
│   │   │   ├── web.ts              # Page routes
│   │   │   ├── streaming.ts        # SSE endpoints
│   │   │   ├── rooms/
│   │   │   │   └── actions.ts       # Action processing
│   │   │   ├── chat.ts
│   │   │   ├── saves.ts
│   │   │   └── ready-room.ts
│   │   ├── middleware/
│   │   └── app.ts
│   │
│   └── utils/
│       ├── config.ts
│       ├── prompts.ts
│       └── markdown.ts
│
├── views/                          # Pug templates
│   ├── layout.pug
│   ├── index.pug
│   ├── login.pug
│   ├── lobby.pug
│   ├── game/
│   │   └── index.pug              # Main game interface
│   ├── ready-room/
│   │   └── index.pug
│   ├── characters/
│   └── partials/
│       ├── status-bar.pug
│       └── ...
│
├── public/                         # Static assets
│   ├── js/
│   │   ├── modules/
│   │   │   ├── sseBus.js           # SSE event bus
│   │   │   ├── game.js             # TRPGClient game logic
│   │   │   ├── game-client.js      # Game client manager
│   │   │   ├── notes.js            # Player notes
│   │   │   ├── combatEvents.js     # Combat log
│   │   │   └── ...
│   │   └── dist/
│   │       ├── game-client.js      # Built JS (esbuild)
│   │       └── main.js
│   └── css/
│
├── data/
│   └── trpg.db                     # JSON database (auto-created)
├── data/prompts/
│   ├── system_prompt.md            # DM system prompt (SCENE framework)
│   └── status_update.md            # WorldContextUpdater prompt
│
├── docs/
│   └── plans/                      # Design & implementation docs
│       ├── 2026-02-09-game-engine-and-context-design.md
│       ├── 2026-02-10-player-notes-and-status-extraction-design.md
│       ├── 2026-02-13-frontend-modularization-design.md
│       ├── 2026-02-23-game-events-and-dice-rolling-system-design.md
│       ├── 2026-02-24-room-refactoring-design.md
│       ├── 2026-02-24-frontend-refactoring-design.md
│       ├── 2026-02-24-system-prompt-polishing-design.md
│       └── 2026-02-25-multi-agent-runtime-design.md
│
├── CLAUDE.md                       # Development guide
├── package.json
└── tsconfig.json
```

## Multi-Agent Architecture

The system uses a multi-agent runtime for game processing:

```
Player Input → NarratorAgent (ExplorationState)
                ├─ LLM Chat (streaming)
                ├─ Tool Calls → MechanicsAgent
                └─ SessionEvents (dice_roll, etc.)
                              ↓
                       WorldContextUpdater
                              ↓
                         Updated GameState
                              ↓
                         Database Persistence
```

### Agents

| Agent | Responsibility | Prompt |
|-------|---------------|--------|
| **NarratorAgent** | Narrative generation, NPC dialogue, SCENE framework | `system_prompt.md` (~1,100 words) |
| **MechanicsAgent** | Execute tool calls (dice, checks, combat) | Built-in logic |
| **WorldContextUpdater** | Extract state updates from narrative | `status_update.md` |

### State Model (Unified)

```typescript
interface GameState {
  roomId: string;
  worldContext: {
    recentEvents: string[];    // Short-term memory (max 12)
    worldFacts: string[];      // Long-term memory (max 50)
    flags: Record<string, string>;  // Global state (location, time, etc.)
  };
  characterOverlays: Map<string, {
    characterId: string;
    conditions: ActiveCondition[];  // Status effects (poison, magic, etc.)
  }>;
  characterStates: Map<string, CharacterState>;
}
```

**Note:** WorldContext and CharacterOverlay are **bound to GameState** (save slot system). No standalone repositories needed.

## Key Features

| Feature | Implementation |
|---------|---------------|
| **AI DM** | Multi-agent runtime with streaming responses |
| **Streaming** | Server-Sent Events (SSE) + smart chunk detection |
| **Memory** | WorldContext (DM facts + events + flags) auto-extracted |
| **Conditions** | CharacterOverlay system (poison, magic effects) |
| **Player Notes** | Per-user notes with server-side rendering |
| **Combat Log** | SessionEvent system for dice rolls & combat |
| **State Persistence** | Conversation history + GameState save slots |
| **Frontend** | Modular JavaScript with SSE event bus |
| **Routing** | Ready room → Game page flow with lifecycle states |

## Room Lifecycle

| State | Description | User Action |
|-------|-------------|-------------|
| **OPEN** | Room created, waiting for players | Lobby → "Create Room" |
| **READY** | Players ready up, selecting characters | Ready room |
| **IN_GAME** | Active gameplay | Game page |
| **SUSPENDED** | Paused by owner (can be resumed) | Owner only |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `DEEPSEEK_API_KEY` | DeepSeek API key | Optional |
| `PORT` | Server port | `3000` |
| `DB_PATH` | JSON database path | `./data/trpg.db` |
| `LLM_MODEL` | Model name | `gpt-4o` |
| `LLM_TEMPERATURE` | Model temperature | `0.7` |
| `LLM_MAX_TOKENS` | Max tokens per response | `800` |

## Development Commands

```bash
# Type checking
npm run typecheck

# Development server with hot reload
npm run dev

# Build TypeScript
npm run build

# Run tests
node --test --import tsx

# Production server
npm start
```

## System Prompt (SCENE Framework)

The DM uses an enhanced ~1,100 word system prompt with:

- **Materiality Principle** - Physical descriptions over abstract adjectives
- **Negative Constraints** - Prohibited:定性形容词, 代行意志, 平滑过渡
- **SCENE Framework** - Setting, Characters, Event, Next, End Hook
- **NPC Dialogue Guidelines** - Pre-action cues + speech domains
- **Consequence Visualization** - Show physical results, not abstract outcomes

Located at: `data/prompts/system_prompt.md`

## Recent Changes

### 2026-02-25: Multi-Agent Runtime
- Extracted game logic into `GameSession` state machine
- `NarratorAgent` (ExplorationState) handles LLM interaction
- `MechanicsAgent` executes tool calls independently
- `WorldContextUpdater` extracts state from narrative

### 2026-02-24: System Prompt Enhancement
- Added SCENE framework for narrative structure
- Added negative constraints (no定性形容词, no代行意志)
- Added materiality principle with examples
- Added NPC pre-action cues and speech domains

### 2026-02-24: Frontend Refactoring
- Modular JavaScript (`modules/` directory)
- SSE event bus pattern
- Improved streaming chunk detection
- Player notes server-side rendering

### 2026-02-23: Game Events System
- SessionEvent emission for dice rolls
- Combat log UI with filtering
- SSE broadcasting of game events

## Documentation

| Document | Description |
|----------|-------------|
| `CLAUDE.md` | Development guide for Claude Code |
| `docs/plans/2026-02-25-multi-agent-runtime-design.md` | Multi-agent architecture |
| `docs/plans/2026-02-24-system-prompt-polishing-design.md` | SCENE framework design |
| `docs/plans/2026-02-24-room-refactoring-design.md` | Room refactoring |
| `docs/plans/2026-02-13-frontend-modularization-design.md` | Frontend architecture |

## License

MIT
