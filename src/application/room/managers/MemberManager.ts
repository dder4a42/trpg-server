// Application layer: Member manager
// Handles room members and character state hydration

import type { RoomMember } from '@/domain/room/types.js';
import type { CharacterState, GameEngine } from '@/domain/game/types.js';
import type { GameState } from '@/domain/game/GameState.js';
import type { CharacterData } from '@/domain/character/types.js';

export interface MemberManagerDeps {
  roomId: string;
  roomMemberships?: {
    getRoomMembers(roomId: string): Promise<{ userId: string; joinedAt: Date; characterId?: string }[]>;
    getActiveMemberCount(roomId: string): Promise<number>;
  };
  userRepo?: {
    findById(userId: string): Promise<{ id: string; username: string } | null>;
  };
  characterRepo?: {
    findById(id: string): CharacterData | null;
  };
  gameEngine: GameEngine;
  gameState: GameState;
}

export class MemberManager {
  private roomId: string;
  private roomMemberships?: MemberManagerDeps['roomMemberships'];
  private userRepo?: MemberManagerDeps['userRepo'];
  private characterRepo?: MemberManagerDeps['characterRepo'];
  private gameEngine: GameEngine;
  private gameState: GameState;

  constructor(deps: MemberManagerDeps) {
    this.roomId = deps.roomId;
    this.roomMemberships = deps.roomMemberships;
    this.userRepo = deps.userRepo;
    this.characterRepo = deps.characterRepo;
    this.gameEngine = deps.gameEngine;
    this.gameState = deps.gameState;
  }

  async getMembers(): Promise<RoomMember[]> {
    if (!this.roomMemberships || !this.userRepo) {
      return [];
    }

    const memberships = await this.roomMemberships.getRoomMembers(this.roomId);
    const members: RoomMember[] = [];

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

  async getMemberCount(): Promise<number> {
    if (!this.roomMemberships) {
      return 0;
    }

    return await this.roomMemberships.getActiveMemberCount(this.roomId);
  }

  async canAcceptMore(maxPlayers: number): Promise<boolean> {
    const count = await this.getMemberCount();
    return count < maxPlayers;
  }

  async ensureCharacterStatesLoaded(): Promise<void> {
    if (!this.characterRepo) {
      return;
    }

    const members = await this.getMembers();
    const characterIds = members
      .map((member) => member.characterId)
      .filter((id): id is string => id !== undefined);

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
      const characterState: CharacterState = {
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

  private parseSpellSlots(template: any): CharacterState['knownSpells'] {
    const slots: CharacterState['knownSpells'] = [];
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
    } catch (error) {
      console.warn('[Room] Failed to parse spell slots:', error);
    }

    return slots;
  }
}
