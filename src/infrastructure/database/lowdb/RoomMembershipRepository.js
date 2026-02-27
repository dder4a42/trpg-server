// Room membership repository using LowDB
// Manages the many-to-many relationship between users and rooms
import { randomUUID } from 'crypto';
export class RoomMembershipRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    getNextId() {
        const data = this.db.getData();
        const maxId = data.roomCharacters.reduce((max, rc) => Math.max(max, rc.id), 0);
        return maxId + 1;
    }
    rowToMembership(record, userId) {
        return {
            id: record.id,
            roomId: record.room_id,
            userId,
            characterId: record.character_id,
            joinedAt: new Date(record.joined_at),
            isActive: record.is_active === 1,
            isReady: record.is_ready === 1,
            readyAt: record.ready_at ? new Date(record.ready_at) : undefined,
        };
    }
    async joinRoom(roomId, userId, characterId) {
        const data = this.db.getData();
        // Check if user is already in this room
        const existing = data.roomCharacters.find(rc => rc.room_id === roomId && rc.user_id === userId && rc.is_active === 1);
        if (existing) {
            // Update character if provided
            if (characterId && existing.character_id !== characterId) {
                existing.character_id = characterId;
                await this.db.write();
            }
            return this.rowToMembership(existing, userId);
        }
        // Create new membership
        const nextId = this.getNextId();
        const record = {
            id: nextId,
            room_id: roomId,
            user_id: userId,
            character_id: characterId,
            joined_at: new Date().toISOString(),
            is_active: 1,
            is_ready: 0, // Not ready by default
        };
        data.roomCharacters.push(record);
        await this.db.write();
        return this.rowToMembership(record, userId);
    }
    async leaveRoom(roomId, userId) {
        const data = this.db.getData();
        const membership = data.roomCharacters.find(rc => rc.room_id === roomId && rc.user_id === userId && rc.is_active === 1);
        if (!membership) {
            return false;
        }
        // Deactivate instead of delete
        membership.is_active = 0;
        await this.db.write();
        return true;
    }
    async getRoomMembers(roomId) {
        const data = this.db.getData();
        return data.roomCharacters
            .filter(rc => rc.room_id === roomId &&
            rc.is_active === 1
        // Note: Don't filter by session validity here
        // The hasValidSession check can cause issues when user sessions
        // are stored differently than expected
        )
            .map(rc => this.rowToMembership(rc, rc.user_id));
    }
    async getUserMembership(userId) {
        const data = this.db.getData();
        const membership = data.roomCharacters.find(rc => rc.user_id === userId && rc.is_active === 1);
        return membership ? this.rowToMembership(membership, userId) : null;
    }
    async isUserInRoom(roomId, userId) {
        const data = this.db.getData();
        return data.roomCharacters.some(rc => rc.room_id === roomId &&
            rc.user_id === userId &&
            rc.is_active === 1);
    }
    async getActiveMemberCount(roomId) {
        const data = this.db.getData();
        return data.roomCharacters.filter(rc => rc.room_id === roomId &&
            rc.is_active === 1).length;
    }
    async getUserRooms(userId) {
        const data = this.db.getData();
        return data.roomCharacters
            .filter(rc => rc.user_id === userId && rc.is_active === 1)
            .map(rc => this.rowToMembership(rc, userId));
    }
    /**
     * Get membership for a specific user in a room
     */
    async getMembership(roomId, userId) {
        const data = this.db.getData();
        const membership = data.roomCharacters.find(rc => rc.room_id === roomId && rc.user_id === userId && rc.is_active === 1);
        return membership ? this.rowToMembership(membership, userId) : null;
    }
    /**
     * Set user ready status
     */
    async setReady(roomId, userId, isReady) {
        const data = this.db.getData();
        const membership = data.roomCharacters.find(rc => rc.room_id === roomId && rc.user_id === userId && rc.is_active === 1);
        if (!membership)
            return false;
        membership.is_ready = isReady ? 1 : 0;
        await this.db.write();
        return true;
    }
    /**
     * Update ready timestamp
     */
    async updateReadyAt(roomId, userId, readyAt) {
        const data = this.db.getData();
        const membership = data.roomCharacters.find(rc => rc.room_id === roomId && rc.user_id === userId && rc.is_active === 1);
        if (!membership)
            return false;
        membership.ready_at = readyAt;
        await this.db.write();
        return true;
    }
    /**
     * Reset all ready status for a room (when ending game)
     */
    async resetReadyStatus(roomId) {
        const data = this.db.getData();
        let updated = false;
        for (const membership of data.roomCharacters) {
            if (membership.room_id === roomId && membership.is_active === 1) {
                membership.is_ready = 0;
                membership.ready_at = undefined;
                updated = true;
            }
        }
        if (updated) {
            await this.db.write();
        }
    }
    /**
     * Get all ready users in a room
     */
    async getReadyUsers(roomId) {
        const data = this.db.getData();
        return data.roomCharacters
            .filter(rc => rc.room_id === roomId &&
            rc.is_active === 1 &&
            rc.is_ready === 1)
            .map(rc => this.rowToMembership(rc, rc.user_id));
    }
    /**
     * Get users who are not ready yet
     */
    async getNotReadyUsers(roomId) {
        const data = this.db.getData();
        return data.roomCharacters
            .filter(rc => rc.room_id === roomId &&
            rc.is_active === 1 &&
            rc.is_ready === 0)
            .map(rc => this.rowToMembership(rc, rc.user_id));
    }
    /**
     * Remove users who aren't ready when game starts
     */
    async removeNonReadyUsers(roomId) {
        const data = this.db.getData();
        let removedCount = 0;
        for (const membership of data.roomCharacters) {
            if (membership.room_id === roomId && membership.is_active === 1 && membership.is_ready === 0) {
                membership.is_active = 0; // Deactivate instead of delete
                removedCount++;
            }
        }
        if (removedCount > 0) {
            await this.db.write();
        }
        return removedCount;
    }
    /**
     * Update character for a user's room membership
     */
    async updateCharacter(roomId, userId, characterId) {
        console.log('updateCharacter called with roomId:', roomId, 'userId:', userId, 'characterId:', characterId);
        const data = this.db.getData();
        const membership = data.roomCharacters.find(rc => rc.room_id === roomId && rc.user_id === userId && rc.is_active === 1);
        console.log('Found membership:', membership);
        if (!membership)
            return false;
        membership.character_id = characterId;
        console.log('Updated membership:', membership);
        await this.db.write();
        console.log('Write to database successful');
        return true;
    }
    async setPlayerNotes(roomId, userId, notes) {
        const data = this.db.getData();
        const membership = data.roomCharacters.find(rc => rc.room_id === roomId && rc.user_id === userId && rc.is_active === 1);
        if (!membership) {
            throw new Error(`User ${userId} not found in room ${roomId}`);
        }
        membership.player_notes = JSON.stringify(notes);
        await this.db.write();
    }
    async getPlayerNotes(roomId, userId) {
        const data = this.db.getData();
        const membership = data.roomCharacters.find(rc => rc.room_id === roomId && rc.user_id === userId && rc.is_active === 1);
        if (!membership || !membership.player_notes) {
            return [];
        }
        try {
            const parsed = JSON.parse(membership.player_notes);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed.map((note) => {
                if (typeof note === 'string') {
                    return {
                        id: randomUUID(),
                        content: note,
                        createdAt: new Date(),
                        userId,
                    };
                }
                const record = note;
                return {
                    id: record.id || randomUUID(),
                    content: record.content || '',
                    createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
                    userId: record.userId || userId,
                };
            });
        }
        catch (error) {
            console.error('Failed to parse player notes:', error);
            return [];
        }
    }
}
