// LowDB connection and database instance management
// Replaces the SQLite connection for simple JSON-based storage

import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Database schema definition matching the SQL schema
export interface DatabaseSchema {
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

// User session for auth system
export interface UserSessionRecord {
  id: string;           // Session token (UUID)
  user_id: string;      // User ID
  created_at: string;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
}

// Default data for new database
const defaultData: DatabaseSchema = {
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
