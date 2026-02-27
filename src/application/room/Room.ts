// Application layer: Room aggregate root implementation
// Orchestrates domain objects to implement use cases

import type { EventEmitter } from 'events';
import type {
  IConversationHistory,
  ILLMClient,
  IRoom,
  IRoomChat,
  RoomConfig,
  RoomState,
  ConversationTurn,
  RoomMember,
  PlayerAction,
  PlayerNote,
} from '@/domain/index.js';
import type { CharacterData } from '@/domain/character/types.js';
import type { ContextBuilder as IContextBuilder } from '@/domain/llm/context.js';
import type { GameEngine } from '@/domain/game/types.js';
import type { GameState } from '@/domain/game/GameState.js';
import type { GameStateManager } from '@/application/game/GameStateManager.js';
import type { MessageRenderer } from '@/application/messages/MessageRenderer.js';
import type { WorldContextUpdater } from '@/application/game/agents/WorldContextUpdater.js';
import { GameSession } from '@/application/game/GameSession.js';
import type { SessionEvent } from '@/domain/game/session.js';
import { ActionManager } from '@/application/room/managers/ActionManager.js';
import { EventManager } from '@/application/room/managers/EventManager.js';
import { MemberManager } from '@/application/room/managers/MemberManager.js';
import { NoteManager } from '@/application/room/managers/NoteManager.js';
import { SaveManager } from '@/application/room/managers/SaveManager.js';

export interface RoomDependencies {
  llmClient: ILLMClient;
  conversationHistory: IConversationHistory;
  contextBuilder: IContextBuilder;
  gameEngine: GameEngine;
  gameStateManager: GameStateManager;
  worldContextUpdater: WorldContextUpdater;
  messageRenderer: MessageRenderer;
  roomChat?: IRoomChat;
  roomMemberships?: {
    getRoomMembers(roomId: string): Promise<{ userId: string; joinedAt: Date; characterId?: string }[]>;
    getActiveMemberCount(roomId: string): Promise<number>;
    setPlayerNotes(roomId: string, userId: string, notes: PlayerNote[]): Promise<void>;
    getPlayerNotes(roomId: string, userId: string): Promise<PlayerNote[]>;
  };
  userRepo?: {
    findById(userId: string): Promise<{ id: string; username: string } | null>;
  };
  characterRepo?: {
    findById(id: string): CharacterData | null;
  };
  conversationHistoryRepo?: {
    addTurnWithActions(
      roomId: string,
      playerActions: PlayerAction[],
      assistantResponse: string,
      additionalMetadata?: Record<string, unknown>
    ): Promise<unknown>;
    getHistory(roomId: string, limit?: number, offset?: number): any[];
  };
}

export class Room implements IRoom {
  readonly id: string;
  state: RoomState;

  private llmClient: ILLMClient;
  private conversationHistory: IConversationHistory;
  private contextBuilder: IContextBuilder;
  private gameEngine: GameEngine;
  private gameStateManager: GameStateManager;
  private worldContextUpdater: WorldContextUpdater;
  private messageRenderer: MessageRenderer;
  private roomChat?: IRoomChat;
  private roomMemberships?: RoomDependencies['roomMemberships'];
  private userRepo?: RoomDependencies['userRepo'];
  private characterRepo?: RoomDependencies['characterRepo'];
  private conversationHistoryRepo?: RoomDependencies['conversationHistoryRepo'];
  private gameState: GameState;
  private turnCount = 0;
  private gameSession: GameSession;
  private actionManager: ActionManager;
  private eventManager: EventManager;
  private memberManager: MemberManager;
  private noteManager: NoteManager;
  private saveManager: SaveManager;

  constructor(id: string, config: RoomConfig, deps: RoomDependencies) {
    this.id = id;
    this.llmClient = deps.llmClient;
    this.conversationHistory = deps.conversationHistory;
    this.contextBuilder = deps.contextBuilder;
    this.gameEngine = deps.gameEngine;
    this.gameStateManager = deps.gameStateManager;
    this.worldContextUpdater = deps.worldContextUpdater;
    this.messageRenderer = deps.messageRenderer;
    this.roomChat = deps.roomChat;
    this.roomMemberships = deps.roomMemberships;
    this.userRepo = deps.userRepo;
    this.characterRepo = deps.characterRepo;
    this.conversationHistoryRepo = deps.conversationHistoryRepo;
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
      characterOverlays: new Map(),
      worldContext: {
        recentEvents: [],
        worldFacts: [],
        flags: {},
      },
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
      gameStateManager: this.gameStateManager,
      gameState: this.gameState,
      conversationHistoryRepo: this.conversationHistoryRepo,
    });

    // Create GameSession (extracted game logic coordinator)
    this.gameSession = new GameSession({
      llmClient: this.llmClient,
      gameEngine: this.gameEngine,
      conversationHistory: this.conversationHistory,
      contextBuilder: this.contextBuilder,
      gameState: this.gameState,
      getRoomMembers: async () => this.getMembers(),
      worldContextUpdater: this.worldContextUpdater,
    });
  }

  /**
   * Get the event emitter for this room.
   * SSE and other consumers can subscribe to 'game-event' to receive:
   * - 'dice_roll': { type, data }
   * - 'action_restriction': { allowedCharacterIds, reason }
   */
  getEventEmitter(): EventEmitter {
    return this.eventManager.getEmitter();
  }

  /**
   * Emit a game event (dice roll, action restriction, etc.)
   */
  private emitGameEvent(event: SessionEvent): void {
    this.eventManager.emitGameEvent(event);
  }

  async initialize(): Promise<void> {
    this.state.isActive = true;
    this.updateActivity();
    await this.noteManager.loadAllNotes();
  }

  async close(): Promise<void> {
    this.state.isActive = false;

    // Final save before closing
    await this.saveManager.saveRoomState();
  }

  async processPlayerInput(input: string, userId?: string, username?: string, characterId?: string): Promise<string> {
    await this.addPlayerAction(
      userId || 'unknown',
      username || 'Unknown',
      input,
      characterId
    );
    return await this.processCombinedPlayerActions();
  }

  async *streamProcessPlayerInput(
    input: string,
    userId?: string,
    username?: string,
    characterId?: string
  ): AsyncGenerator<string> {
    await this.addPlayerAction(
      userId || 'unknown',
      username || 'Unknown',
      input,
      characterId
    );
    for await (const chunk of this.streamProcessCombinedPlayerActions()) {
      yield chunk;
    }
  }

  async save(): Promise<void> {
    await this.saveManager.saveRoomState();
  }

  async load(): Promise<void> {
    await this.saveManager.loadRoomState();
  }

  getGameState(): GameState {
    return this.gameState;
  }

  setGameState(state: GameState): void {
    this.gameState = state;
  }

  getConversationHistory(): IConversationHistory {
    return this.conversationHistory;
  }

  getRoomChat(): IRoomChat | undefined {
    return this.roomChat;
  }

  /**
   * Get all player notes for context building
   */
  getAllPlayerNotes(): Map<string, PlayerNote[]> {
    return this.noteManager.getAllNotes();
  }

  /**
   * Get notes for a specific player
   */
  async getPlayerNotes(userId: string): Promise<PlayerNote[]> {
    return await this.noteManager.getNotes(userId);
  }

  /**
   * Add a note for a specific player
   */
  async addPlayerNote(userId: string, note: string): Promise<PlayerNote> {
    return await this.noteManager.addNote(userId, note);
  }

  /**
   * Delete a note at a specific index for a player
   */
  async deletePlayerNote(userId: string, noteId: string): Promise<void> {
    await this.noteManager.deleteNoteById(userId, noteId);
  }

  async getMembers(): Promise<RoomMember[]> {
    return await this.memberManager.getMembers();
  }

  async getMemberCount(): Promise<number> {
    return await this.memberManager.getMemberCount();
  }

  async addPlayerAction(userId: string, username: string, action: string, characterId?: string): Promise<void> {
    this.updateActivity();

    // Get character name if characterId is provided
    let characterName: string | undefined;
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

  getCurrentPlayerActions(): PlayerAction[] {
    return this.actionManager.getActions();
  }

  async hasAllPlayersActed(): Promise<boolean> {
    const members = await this.getMembers();
    return this.actionManager.hasAllActed(members, this.gameSession.getTurnGate());
  }

  async processCombinedPlayerActions(): Promise<string> {
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
          // Add this turn to conversation history BEFORE saving
          this.conversationHistory.add({
            userInputs: currentActions,
            assistantResponse: fullResponse,
            timestamp: Date.now(),
            metadata: {
              turnType: currentActions.length === 1 ? 'single' : 'combined',
              actionCount: currentActions.length,
            },
          });

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

          break;
      }
    }

    return fullResponse;
  }

  async *streamProcessCombinedPlayerActions(): AsyncGenerator<string> {
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
          // Add this turn to conversation history BEFORE saving
          this.conversationHistory.add({
            userInputs: currentActions,
            assistantResponse: fullResponse,
            timestamp: Date.now(),
            metadata: {
              turnType: currentActions.length === 1 ? 'single' : 'combined',
              actionCount: currentActions.length,
            },
          });

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

          break;
      }
    }
  }

  async canAcceptMoreMembers(): Promise<boolean> {
    return await this.memberManager.canAcceptMore(this.state.config.maxPlayers);
  }

  private updateActivity(): void {
    this.state.lastActivityAt = new Date();
  }

}
