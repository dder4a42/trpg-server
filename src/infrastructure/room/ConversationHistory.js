// Infrastructure: In-memory conversation history
// Implements IConversationHistory from domain
export class ConversationHistory {
    turns = [];
    add(turn) {
        this.turns.push({
            ...turn,
            timestamp: turn.timestamp ?? Date.now(),
        });
    }
    getRecent(turns) {
        if (turns <= 0)
            return [];
        const maxMessages = turns * 2;
        return this.turns.slice(-maxMessages);
    }
    toLLMMessages() {
        const messages = [];
        for (const turn of this.turns) {
            // Format all player actions as a single user message
            const userMessage = turn.userInputs.map(action => {
                if (action.characterName) {
                    return `[${action.characterName}] ${action.action}`;
                }
                else {
                    return `[${action.username}] ${action.action}`;
                }
            }).join('\n');
            messages.push({ role: 'user', content: userMessage });
            messages.push({ role: 'assistant', content: turn.assistantResponse });
        }
        return messages;
    }
    clear() {
        this.turns = [];
    }
    getAll() {
        return this.turns;
    }
    /**
     * Load conversation history from database repository
     * Parses metadata to restore PlayerAction[]
     */
    async loadFromDatabase(roomId, repository) {
        // Explicitly pass a large limit to ensure we get all turns
        const dbTurns = repository.getHistory(roomId, 1000, 0);
        console.log(`[ConversationHistory] Loading ${dbTurns.length} turns for room ${roomId}`);
        for (const dbTurn of dbTurns) {
            // Parse metadata to get PlayerAction[]
            let playerActions = [];
            let metadata;
            if (dbTurn.metadata) {
                // Handle metadata that might be a string (JSON) or already an object
                if (typeof dbTurn.metadata === 'string') {
                    try {
                        metadata = JSON.parse(dbTurn.metadata);
                    }
                    catch (e) {
                        console.error('[ConversationHistory] Failed to parse metadata:', e);
                        metadata = undefined;
                    }
                }
                else if (typeof dbTurn.metadata === 'object' && dbTurn.metadata !== null) {
                    // Metadata is already an object (parsed by repository)
                    metadata = dbTurn.metadata;
                }
                // Extract playerActions from metadata if available
                if (metadata?.playerActions && Array.isArray(metadata.playerActions)) {
                    playerActions = metadata.playerActions;
                }
            }
            // If no playerActions in metadata, create a dummy action from userInput
            if (playerActions.length === 0 && dbTurn.userInput) {
                // The userInput field contains a summary (e.g., "Nagasaki, GuGuGaGa")
                // Use a generic "Player" instead of the raw summary as username
                // The actual content is preserved in the action field
                playerActions = [{
                        userId: 'unknown',
                        username: 'Player',
                        action: dbTurn.userInput,
                        timestamp: new Date(dbTurn.timestamp).getTime(),
                    }];
            }
            this.turns.push({
                userInputs: playerActions,
                assistantResponse: dbTurn.assistantResponse,
                timestamp: new Date(dbTurn.timestamp).getTime(),
                metadata,
            });
        }
        console.log(`[ConversationHistory] Loaded ${this.turns.length} turns into memory`);
    }
}
