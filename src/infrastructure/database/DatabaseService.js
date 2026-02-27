// Database Service - Main entry point for database operations
// Provides access to all repositories and handles initialization
// Now uses LowDB for JSON file-based storage instead of SQLite
import { getDatabase, CharacterRepository, RoomRepository, ConversationHistoryRepository, StatusBarRepository, UserRepository, UserSessionRepository, RoomMembershipRepository, GameStateRepository, } from './lowdb/index.js';
export class DatabaseService {
    // Repositories
    characters;
    rooms;
    conversations;
    statusBar;
    users;
    userSessions;
    roomMemberships;
    gameStates;
    constructor(db) {
        // Initialize repositories with LowDB connection
        this.characters = new CharacterRepository(db);
        this.rooms = new RoomRepository(db);
        this.conversations = new ConversationHistoryRepository(db);
        this.statusBar = new StatusBarRepository(db);
        this.users = new UserRepository(db);
        this.userSessions = new UserSessionRepository(db);
        this.roomMemberships = new RoomMembershipRepository(db);
        this.gameStates = new GameStateRepository(db);
    }
    /**
     * Initialize the database
     */
    static async initialize(config) {
        const db = await getDatabase(config);
        if (!instance) {
            instance = new DatabaseService(db);
        }
        return instance;
    }
    /**
     * Get the singleton instance
     */
    static getInstance() {
        if (!instance) {
            throw new Error('DatabaseService not initialized. Call initialize() first.');
        }
        return instance;
    }
    /**
     * Close the database connection
     */
    static async close() {
        const { closeDatabase } = await import('./lowdb/index.js');
        await closeDatabase();
        instance = null;
    }
    /**
     * Get database statistics
     */
    getStats() {
        return {
            users: this.users.getStats(),
            rooms: this.rooms.getStats(),
        };
    }
}
// Singleton instance
let instance = null;
/**
 * Initialize database service with environment-based config
 * Now uses LowDB (JSON file storage) instead of SQLite
 */
export async function initDatabaseService(dbPath) {
    const config = {
        path: dbPath || process.env.DB_PATH || './data/trpg.db',
    };
    return DatabaseService.initialize(config);
}
export default DatabaseService;
