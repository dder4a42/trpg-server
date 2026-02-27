// Application layer: Note manager
// Handles player notes CRUD and syncing into GameState

import { randomUUID } from 'crypto';
import type { PlayerNote } from '@/domain/room/types.js';
import type { GameState } from '@/domain/game/GameState.js';

export interface NoteManagerDeps {
  roomId: string;
  roomMemberships?: {
    getRoomMembers(roomId: string): Promise<{ userId: string; joinedAt: Date; characterId?: string }[]>;
    setPlayerNotes(roomId: string, userId: string, notes: PlayerNote[]): Promise<void>;
    getPlayerNotes(roomId: string, userId: string): Promise<PlayerNote[]>;
  };
  gameState: GameState;
}

export class NoteManager {
  private roomId: string;
  private roomMemberships?: NoteManagerDeps['roomMemberships'];
  private gameState: GameState;
  private playerNotes: Map<string, PlayerNote[]> = new Map();

  constructor(deps: NoteManagerDeps) {
    this.roomId = deps.roomId;
    this.roomMemberships = deps.roomMemberships;
    this.gameState = deps.gameState;
  }

  async loadAllNotes(): Promise<void> {
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

  getAllNotes(): Map<string, PlayerNote[]> {
    return new Map(this.playerNotes);
  }

  async getNotes(userId: string): Promise<PlayerNote[]> {
    if (!this.roomMemberships) {
      return [];
    }

    if (!this.playerNotes.has(userId)) {
      const notes = await this.roomMemberships.getPlayerNotes(this.roomId, userId);
      this.playerNotes.set(userId, notes);
    }

    return this.playerNotes.get(userId) || [];
  }

  async addNote(userId: string, content: string): Promise<PlayerNote> {
    if (!this.roomMemberships) {
      throw new Error('[Room] No room memberships');
    }

    const notes = this.playerNotes.get(userId) || [];
    const newNote: PlayerNote = {
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

  async deleteNoteById(userId: string, noteId: string): Promise<void> {
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

  private updateGameStateNotes(): void {
    this.gameState.playerNotes = this.getAllNotes();
  }
}
