import type { PlayerNote } from './types.js';

// Room membership entity
export interface RoomMembership {
  id: number;
  roomId: string;
  userId: string;
  characterId?: string;
  joinedAt: Date;
  isActive: boolean;
  // Ready room fields
  isReady: boolean;
  readyAt?: Date;
}

// Membership repository interface
export interface IRoomMembershipRepository {
  // Join a room
  joinRoom(roomId: string, userId: string, characterId?: string): Promise<RoomMembership>;

  // Leave a room
  leaveRoom(roomId: string, userId: string): Promise<boolean>;

  // Get all members of a room
  getRoomMembers(roomId: string): Promise<RoomMembership[]>;

  // Get user's current room membership
  getUserMembership(userId: string): Promise<RoomMembership | null>;

  // Get membership for a specific user in a room
  getMembership(roomId: string, userId: string): Promise<RoomMembership | null>;

  // Check if user is in a room
  isUserInRoom(roomId: string, userId: string): Promise<boolean>;

  // Get active member count
  getActiveMemberCount(roomId: string): Promise<number>;

  // Get user's rooms
  getUserRooms(userId: string): Promise<RoomMembership[]>;

  // Ready room methods
  setReady(roomId: string, userId: string, isReady: boolean): Promise<boolean>;
  updateReadyAt(roomId: string, userId: string, readyAt: string): Promise<boolean>;
  resetReadyStatus(roomId: string): Promise<void>;
  getReadyUsers(roomId: string): Promise<RoomMembership[]>;
  getNotReadyUsers(roomId: string): Promise<RoomMembership[]>;
  removeNonReadyUsers(roomId: string): Promise<number>;
  updateCharacter(roomId: string, userId: string, characterId: string): Promise<boolean>;
  setPlayerNotes(roomId: string, userId: string, notes: PlayerNote[]): Promise<void>;
  getPlayerNotes(roomId: string, userId: string): Promise<PlayerNote[]>;
}
