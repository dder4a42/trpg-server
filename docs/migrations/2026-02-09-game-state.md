# Migration: Game State Persistence (2026-02-09)

## Summary
Adds game state persistence via the new `gameStates` collection and extends save slot handling.

## Data Changes
- New collection: `gameStates`
- Existing collection: `saveSlots` reused for slot metadata

## Backward Compatibility
- Existing rooms and conversations remain unchanged.
- New saves will create entries in `gameStates` and `saveSlots`.

## Manual Migration Steps
1. Backup the current LowDB file (default: `data/trpg.json`).
2. Ensure the database schema includes `gameStates` (empty array if missing).
3. Restart the server; new saves will populate the collection.

## Notes
- `gameStates` stores serialized character state maps and world flags.
- Slot metadata remains in `saveSlots` for UI listing.
