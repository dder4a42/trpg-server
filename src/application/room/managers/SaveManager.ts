// Application layer: Save manager
// Handles persistence of conversation history and game state snapshots

import type { ConversationTurn, IConversationHistory, PlayerAction } from '@/domain/index.js';
import type { GameState } from '@/domain/game/GameState.js';
import type { GameStateManager } from '@/application/game/GameStateManager.js';

export interface SaveManagerDeps {
  roomId: string;
  conversationHistory: IConversationHistory;
  gameStateManager: GameStateManager;
  gameState: GameState;
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

export class SaveManager {
  private roomId: string;
  private conversationHistory: IConversationHistory;
  private gameStateManager: GameStateManager;
  private gameState: GameState;
  private conversationHistoryRepo?: SaveManagerDeps['conversationHistoryRepo'];

  constructor(deps: SaveManagerDeps) {
    this.roomId = deps.roomId;
    this.conversationHistory = deps.conversationHistory;
    this.gameStateManager = deps.gameStateManager;
    this.gameState = deps.gameState;
    this.conversationHistoryRepo = deps.conversationHistoryRepo;
  }

  async autosaveGameState(turnCount: number): Promise<void> {
    await this.gameStateManager.save(
      this.roomId,
      this.gameState,
      'autosave',
      `Auto-save after turn ${turnCount}`
    );
  }

  async saveRoomState(): Promise<void> {
    if (this.conversationHistoryRepo) {
      const allTurns = (this.conversationHistory as any).getAll() as ConversationTurn[];

      if (allTurns.length > 0) {
        const savedTurns = this.conversationHistoryRepo.getHistory(this.roomId, 1000, 0);
        const lastSavedTimestamp = savedTurns.length > 0
          ? new Date((savedTurns[savedTurns.length - 1] as any).timestamp).getTime()
          : 0;

        let savedCount = 0;
        for (const turn of allTurns) {
          if (turn.timestamp > lastSavedTimestamp) {
            await this.conversationHistoryRepo.addTurnWithActions(
              this.roomId,
              turn.userInputs,
              turn.assistantResponse,
              turn.metadata
            );
            savedCount++;
          }
        }

        if (savedCount > 0) {
          console.log(`[Room] Saved ${savedCount} new turns for room ${this.roomId}`);
        }
      }
    }

  }

  async loadRoomState(): Promise<void> {
    if (this.conversationHistoryRepo) {
      const { ConversationHistory } = await import('@/infrastructure/room/ConversationHistory.js');

      if ('loadFromDatabase' in this.conversationHistory) {
        await (this.conversationHistory as any).loadFromDatabase(
          this.roomId,
          this.conversationHistoryRepo
        );
        console.log(`[Room] Loaded conversation history for room ${this.roomId}`);
      } else {
        console.warn('[Room] Conversation history does not support loading from database');
      }
    }

  }
}
