// Database Service - Main entry point for LowDB database operations
// Replaces the SQLite DatabaseService with JSON file-based storage
import { getDatabase, } from './connection.js';
import { CharacterRepository } from './CharacterRepository.js';
import { RoomRepository } from './RoomRepository.js';
import { ConversationHistoryRepository } from './ConversationHistoryRepository.js';
import { StatusBarRepository } from './StatusBarRepository.js';
import { UserRepository } from './UserRepository.js';
import { UserSessionRepository } from './UserSessionRepository.js';
import { RoomMembershipRepository } from './RoomMembershipRepository.js';
export class DatabaseService {
    // Repositories
    characters;
    rooms;
    conversations;
    statusBar;
    users;
    userSessions;
    roomMemberships;
    constructor(db) {
        // Initialize repositories
        this.characters = new CharacterRepository(db);
        this.rooms = new RoomRepository(db);
        this.conversations = new ConversationHistoryRepository(db);
        this.statusBar = new StatusBarRepository(db);
        this.users = new UserRepository(db);
        this.userSessions = new UserSessionRepository(db);
        this.roomMemberships = new RoomMembershipRepository(db);
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
        const { closeDatabase } = await import('./connection.js');
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
 */
export async function initDatabaseService(dbPath) {
    const config = {
        path: dbPath || process.env.DB_PATH || './data/trpg.json',
    };
    return DatabaseService.initialize(config);
}
export default DatabaseService;
