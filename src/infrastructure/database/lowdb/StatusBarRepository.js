// Status Bar Repository - LowDB implementation
// Handles memory entries and flags with JSON storage
export class StatusBarRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Generate next entry ID
     */
    getNextEntryId() {
        const data = this.db.getData();
        const maxId = data.statusBarEntries.reduce((max, e) => Math.max(max, e.id), 0);
        return maxId + 1;
    }
    // ==================== Entry Operations ====================
    /**
     * Add a memory entry
     */
    async addEntry(roomId, memoryType, content, priority = 0) {
        const id = this.getNextEntryId();
        const entry = {
            id,
            room_id: roomId,
            memory_type: memoryType,
            content,
            priority,
            created_at: new Date().toISOString(),
        };
        this.db.getData().statusBarEntries.push(entry);
        await this.db.write();
        return this.rowToEntry(entry);
    }
    /**
     * Get entries for a room
     */
    getEntries(roomId, memoryType, limit) {
        let entries = this.db
            .getData()
            .statusBarEntries.filter((e) => e.room_id === roomId);
        if (memoryType) {
            entries = entries.filter((e) => e.memory_type === memoryType);
        }
        entries = entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (limit) {
            entries = entries.slice(0, limit);
        }
        return entries.map((e) => this.rowToEntry(e));
    }
    /**
     * Get entries by priority
     */
    getEntriesByPriority(roomId, memoryType, minPriority = 0) {
        return this.db
            .getData()
            .statusBarEntries.filter((e) => e.room_id === roomId &&
            e.memory_type === memoryType &&
            e.priority >= minPriority)
            .sort((a, b) => b.priority - a.priority)
            .map((e) => this.rowToEntry(e));
    }
    /**
     * Update entry priority
     */
    async updateEntryPriority(entryId, newPriority) {
        const entry = this.db
            .getData()
            .statusBarEntries.find((e) => e.id === entryId);
        if (!entry)
            return false;
        entry.priority = newPriority;
        await this.db.write();
        return true;
    }
    /**
     * Update entry content
     */
    async updateEntryContent(entryId, newContent) {
        const entry = this.db
            .getData()
            .statusBarEntries.find((e) => e.id === entryId);
        if (!entry)
            return false;
        entry.content = newContent;
        await this.db.write();
        return true;
    }
    /**
     * Delete an entry
     */
    async deleteEntry(entryId) {
        const data = this.db.getData();
        const idx = data.statusBarEntries.findIndex((e) => e.id === entryId);
        if (idx === -1)
            return false;
        data.statusBarEntries.splice(idx, 1);
        await this.db.write();
        return true;
    }
    /**
     * Delete all entries for a room
     */
    async deleteAllEntriesForRoom(roomId) {
        const data = this.db.getData();
        const beforeCount = data.statusBarEntries.length;
        data.statusBarEntries = data.statusBarEntries.filter((e) => e.room_id !== roomId);
        await this.db.write();
        return beforeCount - data.statusBarEntries.length;
    }
    // ==================== Flag Operations ====================
    /**
     * Set a flag
     */
    async setFlag(roomId, flagKey, flagValue) {
        const data = this.db.getData();
        const existingIndex = data.statusBarFlags.findIndex((f) => f.room_id === roomId && f.flag_key === flagKey);
        const flagRecord = {
            room_id: roomId,
            flag_key: flagKey,
            flag_value: flagValue,
            updated_at: new Date().toISOString(),
        };
        if (existingIndex >= 0) {
            data.statusBarFlags[existingIndex] = flagRecord;
        }
        else {
            data.statusBarFlags.push(flagRecord);
        }
        await this.db.write();
    }
    /**
     * Get a flag value
     */
    getFlag(roomId, flagKey) {
        const flag = this.db
            .getData()
            .statusBarFlags.find((f) => f.room_id === roomId && f.flag_key === flagKey);
        return flag?.flag_value ?? null;
    }
    /**
     * Get all flags for a room
     */
    getAllFlags(roomId) {
        const flags = this.db
            .getData()
            .statusBarFlags.filter((f) => f.room_id === roomId);
        return flags.reduce((acc, f) => {
            acc[f.flag_key] = f.flag_value;
            return acc;
        }, {});
    }
    /**
     * Delete a flag
     */
    async deleteFlag(roomId, flagKey) {
        const data = this.db.getData();
        const idx = data.statusBarFlags.findIndex((f) => f.room_id === roomId && f.flag_key === flagKey);
        if (idx === -1)
            return false;
        data.statusBarFlags.splice(idx, 1);
        await this.db.write();
        return true;
    }
    /**
     * Delete all flags for a room
     */
    async deleteAllFlagsForRoom(roomId) {
        const data = this.db.getData();
        const beforeCount = data.statusBarFlags.length;
        data.statusBarFlags = data.statusBarFlags.filter((f) => f.room_id !== roomId);
        await this.db.write();
        return beforeCount - data.statusBarFlags.length;
    }
    /**
     * Delete all data for a room (entries and flags)
     */
    async deleteAllForRoom(roomId) {
        const data = this.db.getData();
        data.statusBarEntries = data.statusBarEntries.filter((e) => e.room_id !== roomId);
        data.statusBarFlags = data.statusBarFlags.filter((f) => f.room_id !== roomId);
        await this.db.write();
    }
    // ==================== Combined Operations ====================
    /**
     * Get complete status bar data for a room
     */
    getStatusBarData(roomId) {
        return {
            entries: this.getEntries(roomId),
            flags: this.getAllFlags(roomId),
        };
    }
    rowToEntry(row) {
        return {
            id: row.id,
            roomId: row.room_id,
            memoryType: row.memory_type,
            content: row.content,
            priority: row.priority,
            createdAt: row.created_at,
        };
    }
}
