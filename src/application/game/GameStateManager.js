// Application layer: GameStateManager
// Handles save/load orchestration for GameState
export class GameStateManager {
    gameStateRepo;
    roomRepo;
    constructor(gameStateRepo, roomRepo) {
        this.gameStateRepo = gameStateRepo;
        this.roomRepo = roomRepo;
    }
    async save(roomId, state, slotName = 'autosave', description) {
        await this.gameStateRepo.saveState(roomId, slotName, state);
        await this.roomRepo.upsertSaveSlot(roomId, slotName, description, slotName === 'autosave');
        return { slotName, description, savedAt: Date.now() };
    }
    async load(roomId, slotName) {
        const state = await this.gameStateRepo.loadState(roomId, slotName);
        if (!state)
            return null;
        return { slotName, state, loadedAt: Date.now() };
    }
    async listSlots(roomId) {
        return this.roomRepo.listSaveSlots(roomId);
    }
    async deleteSlot(roomId, slotName) {
        await this.gameStateRepo.deleteState(roomId, slotName);
        await this.roomRepo.deleteSaveSlotByName(roomId, slotName);
    }
}
