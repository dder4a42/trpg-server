// Application layer: Save manager
// Handles persistence of conversation history and status bar state
export class SaveManager {
    roomId;
    conversationHistory;
    statusBarManager;
    gameStateManager;
    gameState;
    conversationHistoryRepo;
    statusBarRepo;
    constructor(deps) {
        this.roomId = deps.roomId;
        this.conversationHistory = deps.conversationHistory;
        this.statusBarManager = deps.statusBarManager;
        this.gameStateManager = deps.gameStateManager;
        this.gameState = deps.gameState;
        this.conversationHistoryRepo = deps.conversationHistoryRepo;
        this.statusBarRepo = deps.statusBarRepo;
    }
    async autosaveGameState(turnCount) {
        await this.gameStateManager.save(this.roomId, this.gameState, 'autosave', `Auto-save after turn ${turnCount}`);
    }
    async saveRoomState() {
        if (this.conversationHistoryRepo) {
            const allTurns = this.conversationHistory.getAll();
            if (allTurns.length > 0) {
                const savedTurns = this.conversationHistoryRepo.getHistory(this.roomId, 1000, 0);
                const lastSavedTimestamp = savedTurns.length > 0
                    ? new Date(savedTurns[savedTurns.length - 1].timestamp).getTime()
                    : 0;
                let savedCount = 0;
                for (const turn of allTurns) {
                    if (turn.timestamp > lastSavedTimestamp) {
                        await this.conversationHistoryRepo.addTurnWithActions(this.roomId, turn.userInputs, turn.assistantResponse, turn.metadata);
                        savedCount++;
                    }
                }
                if (savedCount > 0) {
                    console.log(`[Room] Saved ${savedCount} new turns for room ${this.roomId}`);
                }
            }
        }
        if (this.statusBarRepo) {
            const statusBar = this.statusBarManager.getStatusBar();
            await this.statusBarRepo.deleteAllForRoom(this.roomId);
            for (const content of statusBar.shortTermMemory) {
                await this.statusBarRepo.addEntry(this.roomId, 'short_term', content);
            }
            for (const content of statusBar.longTermMemory) {
                await this.statusBarRepo.addEntry(this.roomId, 'long_term', content);
            }
            for (const [key, value] of Object.entries(statusBar.flags)) {
                await this.statusBarRepo.setFlag(this.roomId, key, value);
            }
            console.log(`[Room] Saved status bar state for room ${this.roomId}`);
        }
    }
    async loadRoomState() {
        if (this.conversationHistoryRepo) {
            const { ConversationHistory } = await import('@/infrastructure/room/ConversationHistory.js');
            if ('loadFromDatabase' in this.conversationHistory) {
                await this.conversationHistory.loadFromDatabase(this.roomId, this.conversationHistoryRepo);
                console.log(`[Room] Loaded conversation history for room ${this.roomId}`);
            }
            else {
                console.warn('[Room] Conversation history does not support loading from database');
            }
        }
        if (this.statusBarRepo) {
            const data = this.statusBarRepo.getStatusBarData(this.roomId);
            if (data) {
                const statusBar = {
                    shortTermMemory: data.entries
                        .filter((e) => e.memoryType === 'short_term')
                        .map((e) => e.content),
                    longTermMemory: data.entries
                        .filter((e) => e.memoryType === 'long_term')
                        .map((e) => e.content),
                    flags: data.flags || {},
                };
                this.statusBarManager.setStatusBar(statusBar);
                console.log(`[Room] Loaded status bar for room ${this.roomId}`);
            }
        }
    }
}
