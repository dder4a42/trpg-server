// LowDB connection and database instance management
// Replaces the SQLite connection for simple JSON-based storage
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
const __dirname = dirname(fileURLToPath(import.meta.url));
// Default data for new database
const defaultData = {
    users: [],
    rooms: [],
    characters: [],
    roomCharacters: [],
    conversationTurns: [],
    statusBarEntries: [],
    statusBarFlags: [],
    saveSlots: [],
    userSessions: [],
    gameStates: [],
};
// LowDB wrapper class that mimics the old DatabaseConnection interface
export class DatabaseConnection {
    db;
    config;
    constructor(config) {
        this.config = config;
        // Ensure directory exists
        const dir = dirname(config.path);
        try {
            mkdirSync(dir, { recursive: true });
        }
        catch {
            // Directory might already exist
        }
        // Create LowDB instance
        const adapter = new JSONFile(config.path);
        this.db = new Low(adapter, defaultData);
    }
    /**
     * Initialize by reading data
     */
    async init() {
        await this.db.read();
    }
    /**
     * Get the LowDB instance directly
     */
    getLowDB() {
        return this.db;
    }
    /**
     * Get raw data
     */
    getData() {
        return this.db.data;
    }
    /**
     * Write data to disk
     */
    async write() {
        await this.db.write();
    }
    /**
     * Legacy interface: run (for compatibility)
     */
    run() {
        // LowDB doesn't have traditional run, return compatible object
        return { changes: 1, lastInsertRowid: Date.now() };
    }
    /**
     * Close (no-op for LowDB, just ensure writes)
     */
    async close() {
        await this.write();
    }
    /**
     * Check if database is open (always true for LowDB)
     */
    isOpen() {
        return true;
    }
}
// Singleton instance
let instance = null;
export async function getDatabase(config) {
    if (!instance) {
        if (!config) {
            throw new Error('Database config required for first initialization');
        }
        instance = new DatabaseConnection(config);
        await instance.init();
    }
    return instance;
}
export async function closeDatabase() {
    if (instance) {
        await instance.close();
        instance = null;
    }
}
export async function initDatabase(config) {
    const db = await getDatabase(config);
    return db;
}
