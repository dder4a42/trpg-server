// Application layer: Note manager
// Handles player notes CRUD and syncing into GameState
import { randomUUID } from 'crypto';
export class NoteManager {
    roomId;
    roomMemberships;
    gameState;
    playerNotes = new Map();
    constructor(deps) {
        this.roomId = deps.roomId;
        this.roomMemberships = deps.roomMemberships;
        this.gameState = deps.gameState;
    }
    async loadAllNotes() {
        if (!this.roomMemberships) {
            console.warn('[Room] No room memberships, skipping notes load');
            return;
        }
        const members = await this.roomMemberships.getRoomMembers(this.roomId);
        for (const member of members) {
            const notes = await this.roomMemberships.getPlayerNotes(this.roomId, member.userId);
            this.playerNotes.set(member.userId, notes);
        }
        this.updateGameStateNotes();
    }
    getAllNotes() {
        return new Map(this.playerNotes);
    }
    async getNotes(userId) {
        if (!this.roomMemberships) {
            return [];
        }
        if (!this.playerNotes.has(userId)) {
            const notes = await this.roomMemberships.getPlayerNotes(this.roomId, userId);
            this.playerNotes.set(userId, notes);
        }
        return this.playerNotes.get(userId) || [];
    }
    async addNote(userId, content) {
        if (!this.roomMemberships) {
            throw new Error('[Room] No room memberships');
        }
        const notes = this.playerNotes.get(userId) || [];
        const newNote = {
            id: randomUUID(),
            content,
            createdAt: new Date(),
            userId,
        };
        notes.push(newNote);
        this.playerNotes.set(userId, notes);
        this.updateGameStateNotes();
        await this.roomMemberships.setPlayerNotes(this.roomId, userId, notes);
        return newNote;
    }
    async deleteNoteById(userId, noteId) {
        if (!this.roomMemberships) {
            throw new Error('[Room] No room memberships');
        }
        const currentNotes = await this.roomMemberships.getPlayerNotes(this.roomId, userId);
        const nextNotes = currentNotes.filter((note) => note.id !== noteId);
        if (nextNotes.length === currentNotes.length) {
            throw new Error('Invalid note id');
        }
        this.playerNotes.set(userId, nextNotes);
        this.updateGameStateNotes();
        await this.roomMemberships.setPlayerNotes(this.roomId, userId, nextNotes);
    }
    updateGameStateNotes() {
        this.gameState.playerNotes = this.getAllNotes();
    }
}
