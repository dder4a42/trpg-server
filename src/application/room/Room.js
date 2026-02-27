// Application layer: Room aggregate root implementation
// Orchestrates domain objects to implement use cases
import { GameSession } from '@/application/game/GameSession.js';
import { ActionManager } from '@/application/room/managers/ActionManager.js';
import { EventManager } from '@/application/room/managers/EventManager.js';
import { MemberManager } from '@/application/room/managers/MemberManager.js';
import { NoteManager } from '@/application/room/managers/NoteManager.js';
import { SaveManager } from '@/application/room/managers/SaveManager.js';
export class Room {
    id;
    state;
    llmClient;
    conversationHistory;
    statusBarManager;
    contextBuilder;
    gameEngine;
    gameStateManager;
    messageRenderer;
    roomChat;
    roomMemberships;
    userRepo;
    characterRepo;
    conversationHistoryRepo;
    statusBarRepo;
    gameState;
    turnCount = 0;
    gameSession;
    actionManager;
    eventManager;
    memberManager;
    noteManager;
    saveManager;
    constructor(id, config, deps) {
        this.id = id;
        this.llmClient = deps.llmClient;
        this.conversationHistory = deps.conversationHistory;
        this.statusBarManager = deps.statusBarManager;
        this.contextBuilder = deps.contextBuilder;
        this.gameEngine = deps.gameEngine;
        this.gameStateManager = deps.gameStateManager;
        this.messageRenderer = deps.messageRenderer;
        this.roomChat = deps.roomChat;
        this.roomMemberships = deps.roomMemberships;
        this.userRepo = deps.userRepo;
        this.characterRepo = deps.characterRepo;
        this.conversationHistoryRepo = deps.conversationHistoryRepo;
        this.statusBarRepo = deps.statusBarRepo;
        this.actionManager = new ActionManager();
        this.eventManager = new EventManager();
        this.state = {
            id,
            createdAt: new Date(),
            lastActivityAt: new Date(),
            isActive: false,
            config,
        };
        this.gameState = {
            roomId: id,
            moduleName: config.moduleName,
            location: { name: 'Unknown' },
            characterStates: new Map(),
            worldFlags: {},
            activeEncounters: [],
            lastUpdated: Date.now(),
        };
        this.memberManager = new MemberManager({
            roomId: id,
            roomMemberships: this.roomMemberships,
            userRepo: this.userRepo,
            characterRepo: this.characterRepo,
            gameEngine: this.gameEngine,
            gameState: this.gameState,
        });
        this.noteManager = new NoteManager({
            roomId: id,
            roomMemberships: this.roomMemberships,
            gameState: this.gameState,
        });
        this.saveManager = new SaveManager({
            roomId: id,
            conversationHistory: this.conversationHistory,
            statusBarManager: this.statusBarManager,
            gameStateManager: this.gameStateManager,
            gameState: this.gameState,
            conversationHistoryRepo: this.conversationHistoryRepo,
            statusBarRepo: this.statusBarRepo,
        });
        // Create GameSession (extracted game logic coordinator)
        this.gameSession = new GameSession({
            llmClient: this.llmClient,
            gameEngine: this.gameEngine,
            conversationHistory: this.conversationHistory,
            contextBuilder: this.contextBuilder,
            gameState: this.gameState,
            getRoomMembers: async () => this.getMembers(),
        });
    }
    /**
     * Get the event emitter for this room.
     * SSE and other consumers can subscribe to 'game-event' to receive:
     * - 'dice_roll': { type, data }
     * - 'action_restriction': { allowedCharacterIds, reason }
     */
    getEventEmitter() {
        return this.eventManager.getEmitter();
    }
    /**
     * Emit a game event (dice roll, action restriction, etc.)
     */
    emitGameEvent(event) {
        this.eventManager.emitGameEvent(event);
    }
    async initialize() {
        this.state.isActive = true;
        this.updateActivity();
        await this.noteManager.loadAllNotes();
    }
    async close() {
        this.state.isActive = false;
        // Final save before closing
        await this.saveManager.saveRoomState();
    }
    async processPlayerInput(input, userId, username, characterId) {
        await this.addPlayerAction(userId || 'unknown', username || 'Unknown', input, characterId);
        return await this.processCombinedPlayerActions();
    }
    async *streamProcessPlayerInput(input, userId, username, characterId) {
        await this.addPlayerAction(userId || 'unknown', username || 'Unknown', input, characterId);
        for await (const chunk of this.streamProcessCombinedPlayerActions()) {
            yield chunk;
        }
    }
    async save() {
        await this.saveManager.saveRoomState();
    }
    async load() {
        await this.saveManager.loadRoomState();
    }
    getGameState() {
        return this.gameState;
    }
    setGameState(state) {
        this.gameState = state;
    }
    getConversationHistory() {
        return this.conversationHistory;
    }
    getStatusBarManager() {
        return this.statusBarManager;
    }
    getRoomChat() {
        return this.roomChat;
    }
    /**
     * Get all player notes for context building
     */
    getAllPlayerNotes() {
        return this.noteManager.getAllNotes();
    }
    /**
     * Get notes for a specific player
     */
    async getPlayerNotes(userId) {
        return await this.noteManager.getNotes(userId);
    }
    /**
     * Add a note for a specific player
     */
    async addPlayerNote(userId, note) {
        return await this.noteManager.addNote(userId, note);
    }
    /**
     * Delete a note at a specific index for a player
     */
    async deletePlayerNote(userId, noteId) {
        await this.noteManager.deleteNoteById(userId, noteId);
    }
    async getMembers() {
        return await this.memberManager.getMembers();
    }
    async getMemberCount() {
        return await this.memberManager.getMemberCount();
    }
    async addPlayerAction(userId, username, action, characterId) {
        this.updateActivity();
        // Get character name if characterId is provided
        let characterName;
        if (characterId && this.characterRepo) {
            const character = this.characterRepo.findById(characterId);
            characterName = character?.name;
        }
        this.actionManager.addAction({
            userId,
            username,
            characterId,
            characterName,
            action,
            timestamp: Date.now(),
        });
    }
    getCurrentPlayerActions() {
        return this.actionManager.getActions();
    }
    async hasAllPlayersActed() {
        const members = await this.getMembers();
        return this.actionManager.hasAllActed(members, this.gameSession.getTurnGate());
    }
    async processCombinedPlayerActions() {
        this.updateActivity();
        // Capture actions before processing
        const currentActions = this.actionManager.drainActions();
        await this.memberManager.ensureCharacterStatesLoaded();
        // Delegate to GameSession and collect response
        let fullResponse = '';
        for await (const event of this.gameSession.processActions(currentActions)) {
            switch (event.type) {
                case 'narrative_chunk':
                    fullResponse += event.content;
                    break;
                case 'dice_roll':
                    console.log('[Room] Dice roll:', event.data);
                    break;
                case 'action_restriction':
                    console.log('[Room] Action restriction:', event.allowedCharacterIds, event.reason);
                    break;
                case 'state_transition':
                    console.log('[Room] State transition to:', event.to);
                    break;
                case 'turn_end':
                    // Perform turn cleanup
                    this.turnCount += 1;
                    this.gameState.lastUpdated = Date.now();
                    this.saveManager.autosaveGameState(this.turnCount)
                        .catch((err) => {
                        console.error('[Room] Failed to save game state:', err);
                    });
                    this.saveManager.saveRoomState().catch((err) => {
                        console.error('[Room] Failed to save:', err);
                    });
                    await this.extractStatusBarUpdates(currentActions, fullResponse);
                    break;
            }
        }
        return fullResponse;
    }
    async *streamProcessCombinedPlayerActions() {
        this.updateActivity();
        // Capture actions before processing
        const currentActions = this.actionManager.drainActions();
        // Load character states for room members before processing
        // This ensures GameEngine can find character data when dice rolls are requested
        await this.memberManager.ensureCharacterStatesLoaded();
        // Delegate to GameSession and process events
        let fullResponse = '';
        for await (const event of this.gameSession.processActions(currentActions)) {
            switch (event.type) {
                case 'narrative_chunk':
                    fullResponse += event.content;
                    yield event.content;
                    break;
                case 'dice_roll':
                    // Emit for SSE clients to subscribe to
                    this.emitGameEvent(event);
                    console.log('[Room] Dice roll:', event.data);
                    break;
                case 'action_restriction':
                    // Emit for SSE clients to subscribe to
                    this.emitGameEvent(event);
                    console.log('[Room] Action restriction:', event.allowedCharacterIds, event.reason);
                    break;
                case 'state_transition':
                    // Already handled by GameSession
                    console.log('[Room] State transition to:', event.to);
                    break;
                case 'turn_end':
                    // Perform turn cleanup
                    this.turnCount += 1;
                    this.gameState.lastUpdated = Date.now();
                    // Save game state
                    this.saveManager.autosaveGameState(this.turnCount)
                        .catch((err) => {
                        console.error('[Room] Failed to save game state:', err);
                    });
                    this.saveManager.saveRoomState().catch((err) => {
                        console.error('[Room] Failed to save:', err);
                    });
                    // Extract status bar updates
                    await this.extractStatusBarUpdates(currentActions, fullResponse);
                    break;
            }
        }
    }
    async canAcceptMoreMembers() {
        return await this.memberManager.canAcceptMore(this.state.config.maxPlayers);
    }
    updateActivity() {
        this.state.lastActivityAt = new Date();
    }
    /**
     * Extract status bar updates from LLM response (background task)
     */
    async extractStatusBarUpdates(userInputs, assistantResponse) {
        // Dynamically import to avoid circular dependencies
        const { extractStatusBarUpdates } = await import('@/application/llm/StatusBarExtractor.js');
        try {
            await extractStatusBarUpdates(this.llmClient, userInputs, assistantResponse, this.statusBarManager);
            // Save state after status bar update
            await this.saveManager.saveRoomState();
        }
        catch (error) {
            console.error('[Room] Status bar extraction failed:', error);
        }
    }
}
