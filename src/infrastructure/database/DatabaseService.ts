// Database Service - Main entry point for database operations
// Provides access to all repositories and handles initialization
// Now uses LowDB for JSON file-based storage instead of SQLite

import {
  getDatabase,
  type DatabaseConfig,
  CharacterRepository,
  RoomRepository,
  ConversationHistoryRepository,
  UserRepository,
  UserSessionRepository,
  RoomMembershipRepository,
  GameStateRepository,
} from './lowdb/index.js';

export class DatabaseService {
  // Repositories
  public readonly characters: CharacterRepository;
  public readonly rooms: RoomRepository;
  public readonly conversations: ConversationHistoryRepository;
  public readonly users: UserRepository;
  public readonly userSessions: UserSessionRepository;
  public readonly roomMemberships: RoomMembershipRepository;
  public readonly gameStates: GameStateRepository;

  private constructor(db: Awaited<ReturnType<typeof getDatabase>>) {
    // Initialize repositories with LowDB connection
    this.characters = new CharacterRepository(db);
    this.rooms = new RoomRepository(db);
    this.conversations = new ConversationHistoryRepository(db);
    this.users = new UserRepository(db);
    this.userSessions = new UserSessionRepository(db);
    this.roomMemberships = new RoomMembershipRepository(db);
    this.gameStates = new GameStateRepository(db);
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
let instance: DatabaseService | null = null;

/**
 * Initialize database service with environment-based config
 * Now uses LowDB (JSON file storage) instead of SQLite
 */
export async function initDatabaseService(dbPath?: string): Promise<DatabaseService> {
  const config: DatabaseConfig = {
    path: dbPath || process.env.DB_PATH || './data/trpg.db',
  };

  return DatabaseService.initialize(config);
}

export default DatabaseService;
