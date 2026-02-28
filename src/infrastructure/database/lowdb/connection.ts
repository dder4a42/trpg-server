// LowDB connection and database instance management
// Replaces the SQLite connection for simple JSON-based storage

import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Database schema definition with version field for optimistic locking
export interface DatabaseSchema {
  _version: number;           // Version for optimistic locking (incremented on write)
  _lastCleanup?: string;      // Last cleanup timestamp for maintenance jobs
  users: UserRecord[];
  rooms: RoomRecord[];
  characters: CharacterRecord[];
  roomCharacters: RoomCharacterRecord[];
  conversationTurns: ConversationTurnRecord[];
  saveSlots: SaveSlotRecord[];
  userSessions: UserSessionRecord[];
  gameStates: GameStateRecord[];
}

// Type definitions matching the SQL schema
export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  email?: string;
  created_at: string;
  last_login?: string;
  is_active: number;
  is_admin?: number;
  // Security fields for account lockout
  failed_login_attempts: number;
  locked_until?: string;
}

export interface RoomRecord {
  id: string;
  module_name?: string;
  created_at: string;
  last_activity_at: string;
  is_active: number;
  max_players: number;
  max_history_turns: number;
  save_name?: string;
  auto_save: number;
  // Ready room fields
  owner_id?: string | null;        // Room owner user ID
  game_started: number;            // 0 = in ready room, 1 = in game
  started_at?: string;              // When game was started
  // Lifecycle fields
  lifecycle_state?: 'OPEN' | 'READY' | 'IN_GAME' | 'SUSPENDED';
  initialized_at?: string | null;   // First time owner entered game
  suspended_at?: string | null;     // When owner suspended the room
  // Bound team (fixed roster after first initialization)
  bound_member_ids?: string[];
}

export interface CharacterRecord {
  id: string;
  user_id?: string;
  name: string;
  race: string;
  character_class: string;
  level: number;
  background?: string;
  alignment?: string;
  ability_scores: string;
  max_hp: number;
  current_hp: number;
  temp_hp: number;
  armor_class: number;
  initiative: number;
  speed: number;
  death_save_successes: number;
  death_save_failures: number;
  is_dead: number;
  is_stable: number;
  skill_proficiencies: string;
  saving_throw_proficiencies: string;
  tool_proficiencies: string;
  language_proficiencies: string;
  inventory: string;
  equipped_weapon?: string;
  equipped_armor?: string;
  gold: number;
  spell_slots: string;
  current_spell_slots: string;
  known_spells: string;
  prepared_spells: string;
  status_effects: string;
  exhaustion_level: number;
  appearance?: string;
  personality_traits?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
  backstory?: string;
  position: string;
  stage?: string;
  thoughts?: string;
  created_at: string;
  updated_at: string;
}

export interface RoomCharacterRecord {
  id: number;
  room_id: string;
  user_id: string;
  character_id?: string;
  joined_at: string;
  is_active: number;
  // Ready room fields
  is_ready: number;                // 0 = not ready, 1 = ready
  ready_at?: string;               // When user clicked ready
  player_notes?: string;           // JSON stringified array of player notes
}

export interface ConversationTurnRecord {
  id: number;
  room_id: string;
  turn_number: number;
  user_input: string;
  assistant_response: string;
  timestamp: string;
  metadata?: string;
}

export interface SaveSlotRecord {
  id: number;
  room_id: string;
  save_name: string;
  description?: string;
  screenshot_url?: string;
  created_at: string;
  is_auto_save: number;
}

// NEW: Game states for save/load functionality
export interface GameStateRecord {
  room_id: string;
  slot_name: string;
  module_name?: string;
  location_name: string;
  location_description?: string;
  character_states: string;
  world_context: string;
  character_overlays: string;
  active_encounters: string;
  last_updated: number;
  created_at: string;
  updated_at: string;
}

// Character state within a game save
export interface CharacterStateRecord {
  instance_id: string;
  character_id: string;
  current_hp: number;
  temporary_hp: number;
  conditions: string;
  active_buffs: string;
  current_thoughts: string;
  known_spells: string;
  equipment_worn: string;
  equipment_wielded: string;
}

// User session for auth system (enhanced with expiration tracking)
export interface UserSessionRecord {
  id: string;                    // Session token (UUID)
  user_id: string;               // User ID
  created_at: string;
  expires_at: string;
  last_activity_at?: string;     // For sliding expiration
  ip_address?: string;
  user_agent?: string;
  refresh_token?: string;        // For dual-token system (future)
  refresh_expires_at?: string;   // Refresh token expiration (future)
  family_id?: string;            // Token family for rotation (future)
  device_name?: string;          // User-friendly device name
  device_fingerprint?: string;   // Device fingerprint for tracking
  status?: 'active' | 'revoked' | 'expired';  // Session status (future)
  revoked_at?: string;           // When session was revoked (future)
  revoked_reason?: string;       // Reason for revocation (future)
}

// Error class for version conflicts
export class VersionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VersionConflictError';
  }
}

// Default data for new database
const defaultData: DatabaseSchema = {
  _version: 1,
  _lastCleanup: undefined,
  users: [],
  rooms: [],
  characters: [],
  roomCharacters: [],
  conversationTurns: [],
  saveSlots: [],
  userSessions: [],
  gameStates: [],
};

export type { defaultData };

// Database configuration
export interface DatabaseConfig {
  path: string;
  readonly?: boolean;
}

// LowDB wrapper class that mimics the old DatabaseConnection interface
export class DatabaseConnection {
  private db: Low<DatabaseSchema>;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;

    // Ensure directory exists
    const dir = dirname(config.path);
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    // Create LowDB instance
    const adapter = new JSONFile<DatabaseSchema>(config.path);
    this.db = new Low(adapter, defaultData);
  }

  /**
   * Initialize by reading data
   */
  async init(): Promise<void> {
    await this.db.read();

    // Initialize version field for existing databases that don't have it
    // This ensures optimistic locking works for databases created before _version was introduced
    if (this.db.data._version === undefined) {
      this.db.data._version = 1;
      await this.db.write();
    }
  }

  /**
   * Get the LowDB instance directly
   */
  getLowDB(): Low<DatabaseSchema> {
    return this.db;
  }

  /**
   * Get raw data
   */
  getData(): DatabaseSchema {
    return this.db.data;
  }

  /**
   * Write data to disk
   */
  async write(): Promise<void> {
    await this.db.write();
  }

  /**
   * Read data from disk (explicit read-before-write pattern)
   * Ensures we have the latest data before making modifications
   */
  async read(): Promise<void> {
    await this.db.read();
  }

  /**
   * Write with version check for optimistic locking
   * Throws VersionConflictError if version has changed
   */
  async writeWithVersionCheck(expectedVersion: number): Promise<void> {
    const currentVersion = this.db.data._version;
    if (currentVersion !== expectedVersion) {
      throw new VersionConflictError(
        `Version conflict: expected ${expectedVersion}, got ${currentVersion}`
      );
    }
    // Increment version and write
    this.db.data._version = currentVersion + 1;
    await this.db.write();
  }

  /**
   * Atomic update with optimistic locking and retry
   * Use this for complex updates that need to be atomic
   */
  async atomicUpdate<T>(
    updater: (data: DatabaseSchema) => T,
    options?: { maxRetries?: number }
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Read current state
      await this.read();
      const data = this.getData();
      const version = data._version;

      try {
        // Apply update
        const result = updater(data);

        // Write with version check
        await this.writeWithVersionCheck(version);
        return result;
      } catch (e) {
        if (e instanceof VersionConflictError && attempt < maxRetries - 1) {
          // Retry with fresh data
          continue;
        }
        throw e;
      }
    }

    throw new Error('Max retries exceeded in atomicUpdate');
  }

  /**
   * Get current version
   */
  getVersion(): number {
    return this.db.data._version;
  }

  /**
   * Update cleanup timestamp
   */
  updateCleanupTimestamp(): void {
    this.db.data._lastCleanup = new Date().toISOString();
  }

  /**
   * Get last cleanup timestamp
   */
  getLastCleanup(): Date | null {
    return this.db.data._lastCleanup ? new Date(this.db.data._lastCleanup) : null;
  }

  /**
   * Legacy interface: run (for compatibility)
   */
  run(): { changes: number; lastInsertRowid: number | bigint } {
    // LowDB doesn't have traditional run, return compatible object
    return { changes: 1, lastInsertRowid: Date.now() };
  }

  /**
   * Close (no-op for LowDB, just ensure writes)
   */
  async close(): Promise<void> {
    await this.write();
  }

  /**
   * Check if database is open (always true for LowDB)
   */
  isOpen(): boolean {
    return true;
  }
}

// Singleton instance
let instance: DatabaseConnection | null = null;

export async function getDatabase(config?: DatabaseConfig): Promise<DatabaseConnection> {
  if (!instance) {
    if (!config) {
      throw new Error('Database config required for first initialization');
    }
    instance = new DatabaseConnection(config);
    await instance.init();
  }
  return instance;
}

export async function closeDatabase(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}

export async function initDatabase(config: DatabaseConfig): Promise<DatabaseConnection> {
  const db = await getDatabase(config);
  return db;
}
