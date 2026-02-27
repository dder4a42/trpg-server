// Application layer: Player notes provider
// Provides player notes for LLM context
export class PlayerNotesProvider {
    name = 'player-notes';
    priority = 300;
    provide(state) {
        const allNotes = state.playerNotes;
        if (!allNotes || allNotes.size === 0) {
            return null;
        }
        const formatted = Array.from(allNotes.entries())
            .map(([playerId, notes]) => {
            const characterState = state.characterStates.get(playerId);
            const characterName = characterState?.characterId ? `Player ${playerId.slice(0, 4)}` : `Player ${playerId.slice(0, 4)}`;
            const items = notes.map(n => `  - ${n.content}`).join('\n');
            return `${characterName}:\n${items}`;
        })
            .join('\n\n');
        return {
            name: this.name,
            content: `[PLAYER_NOTES]\n${formatted}\n[/PLAYER_NOTES]`,
            priority: this.priority,
        };
    }
}
