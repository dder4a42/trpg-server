// Infrastructure: Room repository for persistence
// Handles save/load of Room state

import type { IRoom, RoomConfig, RoomState } from '@/domain/index.js';

export interface SerializedRoom {
  id: string;
  state: RoomState;
  config: RoomConfig;
  // TODO: Add conversation history, status bar, etc.
}

export interface IRoomRepository {
  save(room: IRoom): Promise<void>;
  load(id: string): Promise<SerializedRoom | null>;
  delete(id: string): Promise<void>;
  list(): Promise<string[]>;
}

export class InMemoryRoomRepository implements IRoomRepository {
  private rooms = new Map<string, SerializedRoom>();

  async save(room: IRoom): Promise<void> {
    const serialized: SerializedRoom = {
      id: room.id,
      state: room.state,
      config: room.state.config,
      // TODO: Serialize conversation history, status bar
    };
    this.rooms.set(room.id, serialized);
  }

  async load(id: string): Promise<SerializedRoom | null> {
    return this.rooms.get(id) ?? null;
  }

  async delete(id: string): Promise<void> {
    this.rooms.delete(id);
  }

  async list(): Promise<string[]> {
    return Array.from(this.rooms.keys());
  }
}

export class FileSystemRoomRepository implements IRoomRepository {
  constructor(private basePath: string) {}

  async save(room: IRoom): Promise<void> {
    // TODO: Implement file-based persistence
    throw new Error('FileSystemRoomRepository not yet implemented');
  }

  async load(id: string): Promise<SerializedRoom | null> {
    // TODO: Implement file-based persistence
    throw new Error('FileSystemRoomRepository not yet implemented');
  }

  async delete(id: string): Promise<void> {
    // TODO: Implement file-based persistence
    throw new Error('FileSystemRoomRepository not yet implemented');
  }

  async list(): Promise<string[]> {
    // TODO: Implement file-based persistence
    throw new Error('FileSystemRoomRepository not yet implemented');
  }
}
