// Application layer: Member manager
// Handles room members and character state hydration
export class MemberManager {
    roomId;
    roomMemberships;
    userRepo;
    characterRepo;
    gameEngine;
    gameState;
    constructor(deps) {
        this.roomId = deps.roomId;
        this.roomMemberships = deps.roomMemberships;
        this.userRepo = deps.userRepo;
        this.characterRepo = deps.characterRepo;
        this.gameEngine = deps.gameEngine;
        this.gameState = deps.gameState;
    }
    async getMembers() {
        if (!this.roomMemberships || !this.userRepo) {
            return [];
        }
        const memberships = await this.roomMemberships.getRoomMembers(this.roomId);
        const members = [];
        for (const membership of memberships) {
            const user = await this.userRepo.findById(membership.userId);
            if (!user) {
                continue;
            }
            const characterName = membership.characterId && this.characterRepo
                ? this.characterRepo.findById(membership.characterId)?.name
                : undefined;
            members.push({
                userId: user.id,
                username: user.username,
                characterId: membership.characterId,
                characterName,
                joinedAt: membership.joinedAt,
            });
        }
        return members;
    }
    async getMemberCount() {
        if (!this.roomMemberships) {
            return 0;
        }
        return await this.roomMemberships.getActiveMemberCount(this.roomId);
    }
    async canAcceptMore(maxPlayers) {
        const count = await this.getMemberCount();
        return count < maxPlayers;
    }
    async ensureCharacterStatesLoaded() {
        if (!this.characterRepo) {
            return;
        }
        const members = await this.getMembers();
        const characterIds = members
            .map((member) => member.characterId)
            .filter((id) => id !== undefined);
        for (const characterId of characterIds) {
            if (this.gameState.characterStates.has(characterId)) {
                continue;
            }
            const template = this.characterRepo.findById(characterId);
            if (!template) {
                console.warn(`[Room] Character template not found: ${characterId}`);
                continue;
            }
            const instanceId = `${characterId}-${Date.now()}`;
            const characterState = {
                instanceId,
                characterId,
                currentHp: template.currentHp ?? template.maxHp ?? 10,
                temporaryHp: template.tempHp || 0,
                conditions: [],
                activeBuffs: [],
                currentThoughts: template.thoughts || '',
                knownSpells: this.parseSpellSlots(template),
                equipmentState: {
                    worn: [],
                    wielded: template.equippedWeapon ? [template.equippedWeapon] : [],
                },
            };
            this.gameState.characterStates.set(characterId, characterState);
            console.log(`[Room] Loaded character state: ${characterId} (${template.name})`);
        }
        this.gameEngine.syncCharacterStates(this.gameState.characterStates);
    }
    parseSpellSlots(template) {
        const slots = [];
        const spellSlotsData = template.spellSlots || {};
        try {
            const parsed = typeof spellSlotsData === 'string'
                ? JSON.parse(spellSlotsData)
                : spellSlotsData;
            for (const [level, count] of Object.entries(parsed)) {
                if (typeof count === 'number' && count > 0) {
                    slots.push({
                        level: parseInt(level, 10),
                        slots: count,
                        used: 0,
                    });
                }
            }
        }
        catch (error) {
            console.warn('[Room] Failed to parse spell slots:', error);
        }
        return slots;
    }
}
