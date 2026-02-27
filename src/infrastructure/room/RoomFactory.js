// Infrastructure layer: Room factory for dependency wiring
// Centralizes room dependency creation to eliminate duplication across routes
import { DatabaseService } from '@/infrastructure/database/DatabaseService.js';
import { buildLLMConfig, buildRoomDefaults } from '@/utils/config.js';
import { OpenAIClient } from '@/infrastructure/llm/OpenAIClient.js';
import { ConversationHistory } from '@/infrastructure/room/ConversationHistory.js';
import { StatusBarManager } from '@/infrastructure/room/StatusBarManager.js';
import { RoomChat } from '@/infrastructure/room/RoomChat.js';
import { StatusBarProvider } from '@/application/context/providers/StatusBarProvider.js';
import { ContextBuilder } from '@/application/context/ContextBuilder.js';
import { SystemPromptProvider } from '@/application/context/providers/SystemPromptProvider.js';
import { ModuleContextProvider } from '@/application/context/providers/ModuleContextProvider.js';
import { CharacterProfileProvider } from '@/application/context/providers/CharacterProfileProvider.js';
import { PlayerNotesProvider } from '@/application/context/providers/PlayerNotesProvider.js';
import { GameRulesProvider } from '@/application/context/providers/GameRulesProvider.js';
import { ConversationHistoryProvider } from '@/application/context/providers/ConversationHistoryProvider.js';
import { D20GameEngine } from '@/application/game/GameEngine.js';
import { GameStateManager } from '@/application/game/GameStateManager.js';
import { MessageRenderer } from '@/application/messages/MessageRenderer.js';
import { RandomDiceRoller } from '@/infrastructure/game/DiceRoller.js';
/**
 * Factory for creating room dependencies
 * Eliminates duplicate code between web.ts and rooms.ts
 */
export class RoomFactory {
    /**
     * Create all dependencies needed for a Room instance
     * @param roomId - Optional room ID for RoomChat creation
     * @returns Room dependencies object conforming to RoomDependencies
     */
    static createDependencies(roomId) {
        const llmConfig = buildLLMConfig();
        // Get database service instance (must be initialized first via DatabaseService.initialize())
        const dbService = DatabaseService.getInstance();
        // LLM Client
        const llmClient = new OpenAIClient({
            apiKey: llmConfig.apiKey,
            baseUrl: llmConfig.baseUrl,
            model: llmConfig.model,
            temperature: llmConfig.temperature,
            maxTokens: llmConfig.maxTokens,
            timeoutSeconds: llmConfig.timeoutSeconds,
        });
        // Infrastructure components
        const conversationHistory = new ConversationHistory();
        const statusBarManager = new StatusBarManager();
        // Game engine
        const diceRoller = new RandomDiceRoller();
        const gameEngine = new D20GameEngine(diceRoller, dbService.characters);
        // Context builder with all providers
        const contextBuilder = new ContextBuilder()
            .add(new SystemPromptProvider())
            .add(new StatusBarProvider(statusBarManager))
            .add(new ModuleContextProvider())
            .add(new CharacterProfileProvider(dbService.characters))
            .add(new PlayerNotesProvider())
            .add(new GameRulesProvider())
            .add(new ConversationHistoryProvider(conversationHistory));
        // State management
        const gameStateManager = new GameStateManager(dbService.gameStates, dbService.rooms);
        const messageRenderer = new MessageRenderer();
        // Conversation history repository adapter
        const conversationHistoryRepo = {
            addTurnWithActions: dbService.conversations.addTurnWithActions.bind(dbService.conversations),
            getHistory: dbService.conversations.getHistory.bind(dbService.conversations),
        };
        return {
            llmClient,
            conversationHistory,
            statusBarManager,
            contextBuilder,
            gameEngine,
            gameStateManager,
            messageRenderer,
            roomChat: roomId ? new RoomChat(roomId, 100) : undefined,
            roomMemberships: dbService.roomMemberships,
            userRepo: dbService.users,
            characterRepo: dbService.characters,
            conversationHistoryRepo,
            statusBarRepo: dbService.statusBar,
        };
    }
    /**
     * Get default room configuration
     */
    static getRoomDefaults() {
        return buildRoomDefaults();
    }
    /**
     * Get LLM configuration
     */
    static getLLMConfig() {
        return buildLLMConfig();
    }
}
