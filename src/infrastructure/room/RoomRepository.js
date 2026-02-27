// Infrastructure: Room repository for persistence
// Handles save/load of Room state
export class InMemoryRoomRepository {
    rooms = new Map();
    async save(room) {
        const serialized = {
            id: room.id,
            state: room.state,
            config: room.state.config,
            // TODO: Serialize conversation history, status bar
        };
        this.rooms.set(room.id, serialized);
    }
    async load(id) {
        return this.rooms.get(id) ?? null;
    }
    async delete(id) {
        this.rooms.delete(id);
    }
    async list() {
        return Array.from(this.rooms.keys());
    }
}
export class FileSystemRoomRepository {
    basePath;
    constructor(basePath) {
        this.basePath = basePath;
    }
    async save(room) {
        // TODO: Implement file-based persistence
        throw new Error('FileSystemRoomRepository not yet implemented');
    }
    async load(id) {
        // TODO: Implement file-based persistence
        throw new Error('FileSystemRoomRepository not yet implemented');
    }
    async delete(id) {
        // TODO: Implement file-based persistence
        throw new Error('FileSystemRoomRepository not yet implemented');
    }
    async list() {
        // TODO: Implement file-based persistence
        throw new Error('FileSystemRoomRepository not yet implemented');
    }
}
