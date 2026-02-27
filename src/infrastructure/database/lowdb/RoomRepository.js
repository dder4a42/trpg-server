// Room Repository - LowDB implementation
// Handles room persistence and save slots with JSON storage
export class RoomRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Generate next save slot ID
     */
    getNextSaveSlotId() {
        const data = this.db.getData();
        const maxId = data.saveSlots.reduce((max, s) => Math.max(max, s.id), 0);
        return maxId + 1;
    }
    /**
     * Save room metadata
     */
    async saveRoom(room, saveName) {
        const data = this.db.getData();
        const existingIndex = data.rooms.findIndex((r) => r.id === room.id);
        const roomRecord = {
            id: room.id,
            module_name: room.state.config.moduleName ?? null,
            created_at: existingIndex >= 0
                ? data.rooms[existingIndex].created_at
                : new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
            is_active: room.state.isActive ? 1 : 0,
            max_players: room.state.config.maxPlayers,
            max_history_turns: room.state.config.maxHistoryTurns,
            save_name: saveName ?? null,
            auto_save: 1,
            // Preserve ready room fields if they exist
            owner_id: existingIndex >= 0 ? data.rooms[existingIndex].owner_id : null,
            game_started: existingIndex >= 0 ? data.rooms[existingIndex].game_started : 0,
            started_at: existingIndex >= 0 ? data.rooms[existingIndex].started_at : null,
            // Preserve lifecycle fields if they exist
            lifecycle_state: existingIndex >= 0 ? data.rooms[existingIndex].lifecycle_state : 'OPEN',
            initialized_at: existingIndex >= 0 ? data.rooms[existingIndex].initialized_at ?? null : null,
            suspended_at: existingIndex >= 0 ? data.rooms[existingIndex].suspended_at ?? null : null,
            bound_member_ids: existingIndex >= 0 ? data.rooms[existingIndex].bound_member_ids ?? [] : [],
        };
        if (existingIndex >= 0) {
            data.rooms[existingIndex] = roomRecord;
        }
        else {
            data.rooms.push(roomRecord);
        }
        await this.db.write();
    }
    /**
     * Load room metadata
     */
    getRoomById(id) {
        const room = this.db.getData().rooms.find((r) => r.id === id);
        return room ? this.rowToRoom(room) : null;
    }
    /**
     * List all rooms
     */
    listRooms(activeOnly = false) {
        let rooms = this.db.getData().rooms;
        if (activeOnly) {
            rooms = rooms.filter((r) => r.is_active === 1);
        }
        return rooms
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((r) => this.rowToRoom(r));
    }
    /**
     * Get room by save name
     */
    getRoomBySaveName(saveName) {
        const room = this.db
            .getData()
            .rooms.find((r) => r.save_name === saveName);
        return room ? this.rowToRoom(room) : null;
    }
    /**
     * List all save slots for a room
     */
    listSaveSlots(roomId) {
        const slots = this.db
            .getData()
            .saveSlots.filter((s) => s.room_id === roomId);
        return slots
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((s) => ({
            id: s.id,
            roomId: s.room_id,
            saveName: s.save_name,
            description: s.description ?? null,
            screenshotUrl: s.screenshot_url ?? null,
            createdAt: s.created_at,
            isAutoSave: s.is_auto_save === 1,
        }));
    }
    /**
     * Create a save slot
     */
    async createSaveSlot(roomId, saveName, description, isAutoSave = false) {
        const id = this.getNextSaveSlotId();
        const newSlot = {
            id,
            room_id: roomId,
            save_name: saveName,
            description: description ?? null,
            screenshot_url: null,
            created_at: new Date().toISOString(),
            is_auto_save: isAutoSave ? 1 : 0,
        };
        this.db.getData().saveSlots.push(newSlot);
        await this.db.write();
        return id;
    }
    /**
     * Create or update a save slot by name
     */
    async upsertSaveSlot(roomId, saveName, description, isAutoSave = false) {
        const data = this.db.getData();
        const existing = data.saveSlots.find((s) => s.room_id === roomId && s.save_name === saveName);
        if (existing) {
            existing.description = description ?? existing.description;
            existing.is_auto_save = isAutoSave ? 1 : existing.is_auto_save;
            existing.created_at = existing.created_at || new Date().toISOString();
            await this.db.write();
            return;
        }
        await this.createSaveSlot(roomId, saveName, description, isAutoSave);
    }
    /**
     * Delete a save slot by name
     */
    async deleteSaveSlotByName(roomId, saveName) {
        const data = this.db.getData();
        const before = data.saveSlots.length;
        data.saveSlots = data.saveSlots.filter((s) => !(s.room_id === roomId && s.save_name === saveName));
        await this.db.write();
        return data.saveSlots.length !== before;
    }
    /**
     * Delete a save slot
     */
    async deleteSaveSlot(slotId) {
        const idx = this.db
            .getData()
            .saveSlots.findIndex((s) => s.id === slotId);
        if (idx === -1)
            return false;
        this.db.getData().saveSlots.splice(idx, 1);
        await this.db.write();
        return true;
    }
    /**
     * Close room (mark inactive)
     */
    async closeRoom(id) {
        const room = this.db.getData().rooms.find((r) => r.id === id);
        if (!room)
            return false;
        room.is_active = 0;
        room.last_activity_at = new Date().toISOString();
        await this.db.write();
        return true;
    }
    /**
     * Delete room and all associated data
     */
    async deleteRoom(id) {
        const data = this.db.getData();
        const idx = data.rooms.findIndex((r) => r.id === id);
        if (idx === -1)
            return false;
        data.rooms.splice(idx, 1);
        // Also clean up related data
        data.saveSlots = data.saveSlots.filter((s) => s.room_id !== id);
        await this.db.write();
        return true;
    }
    /**
     * Clean up old inactive rooms
     */
    async cleanupInactiveRooms(olderThanDays = 30) {
        const data = this.db.getData();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
        const toDelete = data.rooms.filter((r) => r.is_active === 0 && new Date(r.last_activity_at) < cutoffDate);
        for (const room of toDelete) {
            await this.deleteRoom(room.id);
        }
        return toDelete.length;
    }
    /**
     * Get room statistics
     */
    getStats() {
        const data = this.db.getData();
        return {
            totalRooms: data.rooms.length,
            activeRooms: data.rooms.filter((r) => r.is_active === 1).length,
            totalSaves: data.saveSlots.length,
        };
    }
    rowToRoom(row) {
        return {
            id: row.id,
            moduleName: row.module_name,
            createdAt: row.created_at,
            lastActivityAt: row.last_activity_at,
            isActive: row.is_active === 1,
            maxPlayers: row.max_players,
            maxHistoryTurns: row.max_history_turns,
            saveName: row.save_name,
            autoSave: row.auto_save === 1,
            ownerId: row.owner_id || null,
            gameStarted: row.game_started === 1,
            startedAt: row.started_at || null,
            lifecycleState: row.lifecycle_state || (row.game_started === 1 ? 'IN_GAME' : 'OPEN'),
            initializedAt: row.initialized_at ?? null,
            suspendedAt: row.suspended_at ?? null,
            boundMemberIds: Array.isArray(row.bound_member_ids) ? row.bound_member_ids : [],
        };
    }
    /**
     * Set module name (owner only at route layer).
     */
    async setModuleName(roomId, moduleName) {
        const room = this.db.getData().rooms.find((r) => r.id === roomId);
        if (!room)
            return false;
        room.module_name = moduleName ?? null;
        await this.db.write();
        return true;
    }
    /**
     * Persist the bound team roster.
     */
    async setBoundMembers(roomId, userIds) {
        const room = this.db.getData().rooms.find((r) => r.id === roomId);
        if (!room)
            return false;
        room.bound_member_ids = Array.from(new Set(userIds));
        await this.db.write();
        return true;
    }
    /**
     * Set room owner
     */
    async setOwner(roomId, userId) {
        const room = this.db.getData().rooms.find((r) => r.id === roomId);
        if (!room)
            return false;
        room.owner_id = userId;
        await this.db.write();
        return true;
    }
    /**
     * Get room owner ID
     */
    getOwnerId(roomId) {
        const room = this.db.getData().rooms.find((r) => r.id === roomId);
        return room?.owner_id || null;
    }
    /**
     * Start game (mark as started)
     */
    async startGame(roomId) {
        const room = this.db.getData().rooms.find((r) => r.id === roomId);
        if (!room)
            return false;
        room.game_started = 1;
        room.started_at = new Date().toISOString();
        room.lifecycle_state = 'IN_GAME';
        room.initialized_at = room.initialized_at ?? room.started_at;
        room.suspended_at = null;
        await this.db.write();
        return true;
    }
    /**
     * End game (return to ready room)
     */
    async endGame(roomId) {
        const room = this.db.getData().rooms.find((r) => r.id === roomId);
        if (!room)
            return false;
        room.game_started = 0;
        room.started_at = null;
        // Default endGame to READY (initialized rooms) or OPEN (never initialized)
        room.lifecycle_state = room.initialized_at ? 'READY' : 'OPEN';
        await this.db.write();
        return true;
    }
    /**
     * Suspend room: owner returns to lobby, room becomes suspended.
     */
    async suspendRoom(roomId) {
        const room = this.db.getData().rooms.find((r) => r.id === roomId);
        if (!room)
            return false;
        room.game_started = 0;
        room.started_at = null;
        room.lifecycle_state = 'SUSPENDED';
        room.initialized_at = room.initialized_at ?? new Date().toISOString();
        room.suspended_at = new Date().toISOString();
        await this.db.write();
        return true;
    }
    /**
     * Owner resumes suspended room to READY state.
     */
    async setRoomReady(roomId) {
        const room = this.db.getData().rooms.find((r) => r.id === roomId);
        if (!room)
            return false;
        room.lifecycle_state = room.initialized_at ? 'READY' : 'OPEN';
        room.suspended_at = null;
        await this.db.write();
        return true;
    }
    /**
     * Check if game has started
     */
    getGameStarted(roomId) {
        const room = this.db.getData().rooms.find((r) => r.id === roomId);
        return room?.game_started === 1 || false;
    }
}
