# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Build TypeScript
npm run build

# Development server with hot reload
npm run dev

# Type checking only
npm run typecheck

# Clean build output
npm run clean

# Production server
npm start
```

## Architecture Overview

This is a Clean Architecture (Hexagonal) TypeScript web application for TRPG (Tabletop RPG) games with AI Dungeon Master integration. The architecture follows four layers:

### Domain Layer (`src/domain/`)
Pure business logic with **no external dependencies**. Contains interfaces and types that define contracts.

**Key interfaces:**
- `IRoom` - Room aggregate root interface with methods: `initialize()`, `close()`, `processPlayerInput()`, `streamProcessPlayerInput()`, `save()`, `load()`, `getMembers()`, etc.
- `ILLMClient` - LLM port interface with `chat()`, `streamChat()`, `getConfig()`
- `IConversationHistory` - Conversation management
- `IStatusBarManager` - Short/long-term memory for LLM context
- `IRoomChat` - Player chat functionality
- `IAuthService` - Authentication business logic

### Application Layer (`src/application/`)
Use case orchestration that coordinates domain objects. Implements domain interfaces with infrastructure dependencies.

- `Room` - Primary room orchestration, coordinates LLM, history, status bar, context builder
- `RoomService` - Legacy, minimal orchestration
- `AuthService` - User registration, login, logout, session management
- `ContextBuilder` - Provider pipeline for LLM context
- `GameEngine` - D&D 5e mechanics (dice, checks, combat base)
- `MessageRenderer` - Markdown rendering helpers
- Both accept dependencies via constructor (Dependency Injection)

### Infrastructure Layer (`src/infrastructure/`)
External I/O implementations (database, LLM client, repositories).

**Database (`src/infrastructure/database/lowdb/`):**
- Uses **LowDB** (JSON file-based storage)
- **DatabaseService** - Singleton with repositories: `characters`, `rooms`, `conversations`, `statusBar`, `users`, `userSessions`, `roomMemberships`, `gameStates`
- **connection.ts** - LowDB wrapper with `DatabaseConnection` class
- Schema types in `connection.ts` define the JSON structure

**LLM (`src/infrastructure/llm/`):**
- **OpenAIClient** - Implements `ILLMClient` using OpenAI SDK (supports custom baseURL for DeepSeek/etc.)

**Room Infrastructure:**
- `ConversationHistory` - In-memory conversation storage
- `StatusBarManager` - Manages short/long-term memory
- `RoomChat` - Room chat implementation
- `RoomRepository` - In-memory room storage

### API Layer (`src/api/`)
Express HTTP layer with routes, middleware, and template rendering.

- `app.ts` - Express composition, middleware setup, route registration
- `routes/web.ts` - Page routes (login, home, game, characters, lobby)
- `routes/rooms.ts` - API routes for room operations
- `routes/chat.ts` - Chat API routes
- `routes/streaming.ts` - SSE (Server-Sent Events) for real-time streaming
- `middleware/auth.ts` - Session validation middleware

## Key Architectural Patterns

### Room State Management

Rooms exist in two places:
1. **In-memory** (`src/api/routes/web.ts` exports `getRoomsMap()` returning `Map<string, IRoom>`)
2. **Persistent storage** via `DatabaseService.rooms` repository

When creating a room in `web.ts:ensureRoom()`, dependencies are wired:
- `OpenAIClient` - LLM client
- `ConversationHistory` - In-memory history
- `StatusBarManager` - Memory manager
- `RoomChat` - Chat functionality
- Repositories from `DatabaseService` - For member/character lookup

The in-memory rooms Map is shared between `web.ts`, `streaming.ts`, and `chat.ts` via `setRoomsMap()`.

### Authentication Flow

1. `AuthService` handles register/login/logout using `IUserRepository` and `IUserSessionRepository`
2. Session token (UUID) stored in HTTP cookie `sessionId`
3. `createAuthMiddleware()` validates sessions and attaches `req.user`
4. Web routes use inline `requireAuth()` middleware
5. API routes use `auth.validateSession` middleware

### Real-time Streaming

Two mechanisms:
1. **SSE (Server-Sent Events)** - `GET /api/stream/rooms/:roomId/stream`
   - Clients connect and receive real-time chunks
   - Used with HTMX-SSE extension

2. **Streaming via HTTP POST** - `POST /api/rooms/action` with `stream: true`
   - Returns chunks via HTTP response
   - Used by game UI for AI responses

### Database Schema (LowDB)

The JSON database (`data/trpg.json`) contains:
- `users` - User accounts with `password_hash`
- `rooms` - Room metadata
- `characters` - D&D 5e character data
- `roomCharacters` - Room-character junction (now superseded by roomMemberships)
- `conversationTurns` - Chat history
- `statusBarEntries` - Memory entries
- `statusBarFlags` - Key-value state
- `saveSlots` - Save game slots
- `userSessions` - Auth system sessions
- `gameStates` - Saved game state snapshots

## Important Implementation Notes

### RoomService vs Room
Two implementations exist:
- `src/application/room/RoomService.ts` - Legacy, uses dependencies object
- `src/application/room/Room.ts` - Primary, expanded member management + context builder

The web routes (`src/api/routes/web.ts`) use the `Room` class, not `RoomService`.

### Save/Load Not Implemented
Game state persistence is wired via `GameStateManager`, but API endpoints may return 501 until UI integration is complete.

### Path Aliases
TypeScript uses `@/*` path alias mapping to `src/*`. All imports use `.js` extension (ES modules).

### Environment Configuration
Build from environment variables in `src/utils/config.ts`:
- `buildAppConfig()` - Main config builder
- `validateConfig()` - Returns array of error strings
- Required: `OPENAI_API_KEY` or `DEEPSEEK_API_KEY`

### LLM Integration
- System prompt is in Chinese (TRPG game host instructions)
- Status bar context injected as system message with format `[STATUS_BAR]...[/STATUS_BAR]`
- Recent conversation history (last 5 turns) included in messages
