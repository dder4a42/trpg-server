// Database Service - Main entry point for LowDB database operations
// Replaces the SQLite DatabaseService with JSON file-based storage

import {
  getDatabase,
  type DatabaseConfig,
  type DatabaseConnection,
} from './connection.js';
import { CharacterRepository } from './CharacterRepository.js';
import { RoomRepository } from './RoomRepository.js';
import { ConversationHistoryRepository } from './ConversationHistoryRepository.js';
import { UserRepository } from './UserRepository.js';
import { UserSessionRepository } from './UserSessionRepository.js';
import { RoomMembershipRepository } from './RoomMembershipRepository.js';

export class DatabaseService {
  // Repositories
  public readonly characters: CharacterRepository;
  public readonly rooms: RoomRepository;
  public readonly conversations: ConversationHistoryRepository;
  public readonly users: UserRepository;
  public readonly userSessions: UserSessionRepository;
  public readonly roomMemberships: RoomMembershipRepository;

  private constructor(db: DatabaseConnection) {
    // Initialize repositories
    this.characters = new CharacterRepository(db);
    this.rooms = new RoomRepository(db);
    this.conversations = new ConversationHistoryRepository(db);
    this.users = new UserRepository(db);
    this.userSessions = new UserSessionRepository(db);
    this.roomMemberships = new RoomMembershipRepository(db);
  }

  /**
   * Initialize the database
   */
  static async initialize(config: DatabaseConfig): Promise<DatabaseService> {
    const db = await getDatabase(config);
    if (!instance) {
      instance = new DatabaseService(db);
    }
    return instance;
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): DatabaseService {
    if (!instance) {
      throw new Error('DatabaseService not initialized. Call initialize() first.');
    }
    return instance;
  }

  /**
   * Close the database connection
   */
  static async close(): Promise<void> {
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
let instance: DatabaseService | null = null;

/**
 * Initialize database service with environment-based config
 */
export async function initDatabaseService(dbPath?: string): Promise<DatabaseService> {
  const config: DatabaseConfig = {
    path: dbPath || process.env.DB_PATH || './data/trpg.json',
  };

  return DatabaseService.initialize(config);
}

export default DatabaseService;
