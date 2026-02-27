// Conversation History Repository - LowDB implementation
// Handles conversation turn persistence with JSON storage
export class ConversationHistoryRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Generate next turn ID
     */
    getNextId() {
        const data = this.db.getData();
        const maxId = data.conversationTurns.reduce((max, t) => Math.max(max, t.id), 0);
        return maxId + 1;
    }
    /**
     * Get the next turn number for a room
     */
    getNextTurnNumber(roomId) {
        const turns = this.db.getData().conversationTurns.filter((t) => t.room_id === roomId);
        if (turns.length === 0)
            return 1;
        return Math.max(...turns.map((t) => t.turn_number)) + 1;
    }
    /**
     * Add a conversation turn
     */
    async addTurn(roomId, userInput, assistantResponse, metadata) {
        const id = this.getNextId();
        const turnNumber = this.getNextTurnNumber(roomId);
        const record = {
            id,
            room_id: roomId,
            turn_number: turnNumber,
            user_input: userInput,
            assistant_response: assistantResponse,
            timestamp: new Date().toISOString(),
            metadata: metadata ? JSON.stringify(metadata) : null,
        };
        this.db.getData().conversationTurns.push(record);
        await this.db.write();
        return this.rowToTurn(record);
    }
    /**
     * Add a conversation turn with player actions
     * Stores PlayerAction[] in metadata field for persistence
     */
    async addTurnWithActions(roomId, playerActions, assistantResponse, additionalMetadata) {
        // Build metadata with player actions
        const turnMetadata = {
            playerActions,
            turnType: playerActions.length > 1 ? 'combined' : 'single',
            actionCount: playerActions.length,
            processedAt: Date.now(),
            ...additionalMetadata,
        };
        // Generate summary for user_input field (for display)
        const summary = playerActions
            .map((a) => a.characterName || a.username)
            .join(', ');
        return this.addTurn(roomId, summary, assistantResponse, turnMetadata);
    }
    /**
     * Get conversation history for a room
     */
    getHistory(roomId, limit = 50, offset = 0) {
        const turns = this.db
            .getData()
            .conversationTurns.filter((t) => t.room_id === roomId)
            .sort((a, b) => a.turn_number - b.turn_number)
            .slice(offset, offset + limit)
            .map((t) => this.rowToTurn(t));
        return turns;
    }
    /**
     * Get all turns for a room
     */
    getAllTurns(roomId) {
        return this.db
            .getData()
            .conversationTurns.filter((t) => t.room_id === roomId)
            .sort((a, b) => a.turn_number - b.turn_number)
            .map((t) => this.rowToTurn(t));
    }
    /**
     * Get a specific turn by ID
     */
    getTurnById(turnId) {
        const turn = this.db
            .getData()
            .conversationTurns.find((t) => t.id === turnId);
        return turn ? this.rowToTurn(turn) : null;
    }
    /**
     * Get the last N turns for a room
     */
    getRecentTurns(roomId, count = 10) {
        const turns = this.db
            .getData()
            .conversationTurns.filter((t) => t.room_id === roomId)
            .sort((a, b) => b.turn_number - a.turn_number)
            .slice(0, count)
            .map((t) => this.rowToTurn(t));
        return turns.reverse();
    }
    /**
     * Count total turns for a room
     */
    countTurns(roomId) {
        return this.db.getData().conversationTurns.filter((t) => t.room_id === roomId).length;
    }
    /**
     * Delete all turns for a room
     */
    async deleteAllTurns(roomId) {
        const data = this.db.getData();
        const beforeCount = data.conversationTurns.length;
        data.conversationTurns = data.conversationTurns.filter((t) => t.room_id !== roomId);
        await this.db.write();
        return beforeCount - data.conversationTurns.length;
    }
    /**
     * Get summary statistics for conversations
     */
    getStats() {
        const data = this.db.getData();
        const roomIds = new Set(data.conversationTurns.map((t) => t.room_id));
        return {
            totalTurns: data.conversationTurns.length,
            roomsWithConversation: roomIds.size,
        };
    }
    rowToTurn(row) {
        return {
            id: row.id,
            roomId: row.room_id,
            turnNumber: row.turn_number,
            userInput: row.user_input,
            assistantResponse: row.assistant_response,
            timestamp: row.timestamp,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        };
    }
}
