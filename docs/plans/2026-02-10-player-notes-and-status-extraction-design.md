# Player Notes and Status Extraction Design

**Goal:** Add player notes system and automatic LLM status extraction to enhance LLM context with both player and DM perspectives.

**Date:** 2026-02-10

---

## Overview

Two complementary systems for LLM context enhancement:

1. **Player Notes** - Manual, player's perspective: Players can add/delete short text notes
2. **LLM Status Bar** - Automatic, DM's perspective: LLM extracts world facts and events after each turn

Both systems inject content into LLM context, giving the AI a complete picture of game state.

---

## System Architecture

### Player Notes

**Data Structure:**
```
Map<playerId, string[]>  // Each player has array of note strings
```

**Storage:** `roomMemberships` table (Option A)
```typescript
interface RoomMembership {
  room_id: string;
  user_id: string;
  character_id?: string;
  player_notes?: string;  // JSON stringified array
  joined_at: string;
}
```

**Behavior:**
- Each player can only edit their own notes
- Notes are per-room, not global
- Persistence: Immediate save on add/delete
- Display: Grouped by player in Status tab

### LLM Status Extraction

**Trigger:** After each turn completes (background, non-blocking)

**Process:**
1. Send last turn transcript to LLM with `getStatusBarUpdatePrompt()`
2. Parse YAML output for scope, time, location, content
3. Update StatusBarManager:
   - `ST` → `addShortTerm()`
   - `LT` → `addLongTerm()`
   - `location` → `setFlag('location', location)`

**YAML Format:**
```yaml
- ST | Evening | Tavern | Players entered tavern
- LT | Year 1024 | World | King Neverember rules Neverwinter
```

---

## API Endpoints

### Player Notes

```
GET /api/rooms/:roomId/notes
Get current user's notes
Response: { success: true, notes: string[] }

POST /api/rooms/:roomId/notes
Add a note for current user
Body: { note: string (max 200 chars) }
Response: { success: true, notes: string[] }

DELETE /api/rooms/:roomId/notes/:index
Delete note at index
Response: { success: true, notes: string[] }
```

### Status Display (existing)

```
GET /partials/room/:roomId/status
Returns rendered status bar partial
```

---

## UI Design

### Status Tab Layout

```
┌─────────────────────────┐
│ Status                  │
├─────────────────────────┤
│ Current Location        │
│ Tavern                  │
├─────────────────────────┤
│ Player Notes            │
│ HeHe:                   │
│   • Found key behind bar│
│   • Need torches        │
│   [×] [×]              │
│                         │
│ [+ Add Note]            │
├─────────────────────────┤
│ Recent Events (DM)      │
│   • Players entered tavern│
│   • Met suspicious barkeep│
├─────────────────────────┤
│ World Facts (DM)        │
│   • Neverwinter ruled by│
│     Lord Neverember     │
└─────────────────────────┘
```

**Interactions:**
- `[+ Add Note]` → Opens small input/modal
- `[×]` → Deletes individual note
- Notes persist across reloads
- DM sections are read-only (auto-generated)

---

## LLM Context Integration

### New ContextProvider

**PlayerNotesProvider** (priority 300)

Position: Between CharacterProfile (200) and GameRules (500)

```typescript
provide(state: GameState): ContextBlock {
  const allNotes = room.getAllPlayerNotes();
  if (allNotes.isEmpty()) return null;

  const formatted = Array.from(allNotes.entries())
    .map(([playerId, notes]) => {
      const playerName = getCharacterName(playerId) || getUsername(playerId);
      const items = notes.map(n => `  - ${n}`).join('\n');
      return `${playerName}:\n${items}`;
    })
    .join('\n\n');

  return {
    name: 'player-notes',
    content: `[PLAYER_NOTES]\n${formatted}\n[/PLAYER_NOTES]`,
    priority: 300
  };
}
```

### Context Structure

```
[System Prompt]
[CHARACTER_PROFILES]
[PLAYER_NOTES]          ← New: Manual notes from all players
HeHe:
  - Found key behind bar
  - Need torches
GuGuGaGa:
  - Has a magic sword
[/PLAYER_NOTES]
[STATUS_BAR]            ← Existing: Auto-extracted DM view
Location: Tavern
Short-term: Players entered tavern
Long-term: King Neverember rules Neverwinter
[/STATUS_BAR]
[GAME_RULES]
[CONVERSATION_HISTORY]
User: [HeHe(Nagasaki)] I search the bar...
```

---

## Implementation Components

### Backend

1. **RoomMembershipRepository**
   - `updateNotes(roomId, userId, notes): Promise<void>`
   - `getNotes(roomId, userId): Promise<string[]>`

2. **Room class updates**
   - `playerNotes: Map<userId, string[]>`
   - `loadPlayerNotes(): Promise<void>`
   - `getAllPlayerNotes(): Map<userId, string[]>`
   - `addPlayerNote(userId, note): Promise<void>`
   - `deletePlayerNote(userId, index): Promise<void>`

3. **API routes** (new file or add to rooms.ts)
   - GET/POST/DELETE `/api/rooms/:roomId/notes`

4. **LLM extraction**
   - `extractStatusBarUpdates(userInputs, response): Promise<void>`
   - `parseAndApplyStatusUpdates(yamlContent): void`
   - Call after each turn (don't await)

5. **ContextBuilder**
   - Add `PlayerNotesProvider`

### Frontend

1. **Status tab UI**
   - Render player notes section with add/delete
   - Render Recent Events (last 3 short-term)
   - Render World Facts (last 3 long-term)

2. **JavaScript** (add to streaming.js or new file)
   - `PlayerNotesManager` class
   - `loadNotes()`, `addNote()`, `deleteNote()`
   - HTMX or fetch-based updates

3. **Partial template**
   - `partials/player-notes.pug` (or inline in game.pug)

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Empty note | Return error "Note cannot be empty" |
| Note > 200 chars | Return error "Note too long" |
| Invalid delete index | Return 404 |
| User not in room | Return 403 |
| DB write failure | Log error, return 500, don't update local state |
| LLM extraction fails | Log error, skip this turn (don't block game) |
| Invalid YAML from LLM | Log error, skip this turn |
| Status bar full | Let StatusBarManager handle trimming (built-in) |

---

## Testing Considerations

- Add/delete note persists across page reload
- Notes appear correctly in LLM context (check debug endpoint)
- Multiple players' notes don't interfere
- LLM extraction parses valid YAML correctly
- LLM extraction handles malformed YAML gracefully
- Empty notes state renders correctly
- Status bar displays location, recent events, world facts
