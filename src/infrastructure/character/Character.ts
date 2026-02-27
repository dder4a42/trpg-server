// Infrastructure: Character entity implementation
// Implements ICharacter from domain

import type {
  ICharacter,
  CharacterData,
  AbilityScores,
} from '@/domain/character/types.js';
import { CharacterClassLabels } from '@/domain/character/types.js';

export class Character implements ICharacter {
  readonly data: CharacterData;

  constructor(data: Partial<CharacterData> = {}) {
    this.data = this.initializeData(data);
  }

  private initializeData(partial: Partial<CharacterData>): CharacterData {
    const defaults: CharacterData = {
      // Basic info
      name: 'Unknown',
      race: 'human',
      characterClass: 'FIGHTER',
      level: 1,
      background: 'commoner',
      alignment: 'neutral',

      // Ability scores
      abilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },

      // Combat stats
      maxHp: 10,
      currentHp: 10,
      tempHp: 0,
      armorClass: 10,
      initiative: 0,
      speed: 30,

      // Death saves
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      isDead: false,
      isStable: false,

      // Proficiencies
      skillProficiencies: [],
      savingThrowProficiencies: [],
      toolProficiencies: [],
      languageProficiencies: [],

      // Equipment
      gold: 0,
      inventory: [],
      equippedWeapon: '',
      equippedArmor: '',

      // Spells
      spellSlots: {},
      currentSpellSlots: {},
      knownSpells: [],
      preparedSpells: [],

      // Status
      statusEffects: [],
      exhaustionLevel: 0,

      // Roleplay
      appearance: '',
      personalityTraits: '',
      backstory: '',

      // Position
      position: '',

      // Custom
      stage: '',
      thoughts: '',
    };

    return { ...defaults, ...partial };
  }

  // ========== Calculations ==========

  getModifier(ability: keyof AbilityScores): number {
    const score = this.data.abilityScores[ability];
    return Math.floor((score - 10) / 2);
  }

  getProficiencyBonus(): number {
    return Math.floor((this.data.level - 1) / 4) + 2;
  }

  getSkillBonus(skill: string, ability: keyof AbilityScores): number {
    const modifier = this.getModifier(ability);
    const isProficient = this.data.skillProficiencies.includes(skill);
    return isProficient
      ? modifier + this.getProficiencyBonus()
      : modifier;
  }

  getSavingThrowBonus(ability: keyof AbilityScores): number {
    const modifier = this.getModifier(ability);
    const isProficient =
      this.data.savingThrowProficiencies.includes(ability);
    return isProficient
      ? modifier + this.getProficiencyBonus()
      : modifier;
  }

  // ========== Combat ==========

  takeDamage(amount: number, damageType: string = ''): number {
    if (this.data.isDead) return 0;

    // Apply temp HP first
    if (this.data.tempHp > 0) {
      if (amount <= this.data.tempHp) {
        this.data.tempHp -= amount;
        return 0;
      } else {
        amount -= this.data.tempHp;
        this.data.tempHp = 0;
      }
    }

    // Apply to current HP
    const oldHp = this.data.currentHp;
    this.data.currentHp = Math.max(0, this.data.currentHp - amount);

    // Check for death
    if (this.data.currentHp === 0 && !this.data.isStable) {
      if (this.data.deathSaveFailures >= 3) {
        this.data.isDead = true;
      }
    }

    return oldHp - this.data.currentHp;
  }

  heal(amount: number): number {
    if (this.data.isDead) return 0;

    const oldHp = this.data.currentHp;
    this.data.currentHp = Math.min(this.data.maxHp, this.data.currentHp + amount);

    // Reset death saves if healed above 0
    if (this.data.currentHp > 0) {
      this.data.deathSaveSuccesses = 0;
      this.data.deathSaveFailures = 0;
      this.data.isStable = false;
    }

    return this.data.currentHp - oldHp;
  }

  rollDeathSave(roll: number): { stabilizedOrDead: boolean; message: string } {
    if (this.data.currentHp > 0 || this.data.isDead) {
      return { stabilizedOrDead: false, message: 'Not applicable' };
    }

    if (roll === 1) {
      this.data.deathSaveFailures += 2;
      return { stabilizedOrDead: false, message: 'Natural 1! Two failures!' };
    }

    if (roll === 20) {
      this.data.currentHp = 1;
      this.data.deathSaveSuccesses = 0;
      this.data.deathSaveFailures = 0;
      return { stabilizedOrDead: true, message: 'Natural 20! Back to life with 1 HP!' };
    }

    if (roll >= 10) {
      this.data.deathSaveSuccesses += 1;
      if (this.data.deathSaveSuccesses >= 3) {
        this.data.isStable = true;
        this.data.deathSaveSuccesses = 0;
        this.data.deathSaveFailures = 0;
        return { stabilizedOrDead: true, message: 'Stabilized!' };
      }
      return { stabilizedOrDead: false, message: 'Success!' };
    } else {
      this.data.deathSaveFailures += 1;
      if (this.data.deathSaveFailures >= 3) {
        this.data.isDead = true;
        return { stabilizedOrDead: true, message: 'Dead!' };
      }
      return { stabilizedOrDead: false, message: 'Failure!' };
    }
  }

  // ========== Status ==========

  addStatusEffect(effect: string): void {
    if (!this.data.statusEffects.includes(effect)) {
      this.data.statusEffects.push(effect);
    }
  }

  removeStatusEffect(effect: string): void {
    const idx = this.data.statusEffects.indexOf(effect);
    if (idx !== -1) {
      this.data.statusEffects.splice(idx, 1);
    }
  }

  hasStatusEffect(effect: string): boolean {
    return this.data.statusEffects.includes(effect);
  }

  isConscious(): boolean {
    return this.data.currentHp > 0 && !this.hasStatusEffect('unconscious');
  }

  canAct(): boolean {
    return (
      this.isConscious() &&
      !this.hasStatusEffect('paralyzed') &&
      !this.hasStatusEffect('stunned') &&
      !this.hasStatusEffect('incapacitated')
    );
  }

  // ========== Serialization ==========

  toJSON(): CharacterData {
    return { ...this.data };
  }

  toPromptProfile(): string {
    const coreInfo = [
      `姓名：${this.data.name}`,
      `种族：${this.data.race} | 职业：${CharacterClassLabels[this.data.characterClass]} | 等级：${this.data.level}`,
      `阵营：${this.data.alignment}`,
      `生命值：${this.data.currentHp}/${this.data.maxHp} | AC：${this.data.armorClass}`,
    ];

    if (this.data.stage) {
      coreInfo.push(`当前状态：${this.data.stage}`);
    }
    if (this.data.thoughts) {
      coreInfo.push(`当前想法：${this.data.thoughts}`);
    }

    const traitsContext = [
      this.data.appearance && `【外貌】${this.data.appearance}`,
      this.data.backstory && `【背景故事】${this.data.backstory}`,
      this.data.personalityTraits && `【性格】${this.data.personalityTraits}`,
    ].filter((item): item is string => Boolean(item));

    return [...coreInfo, '', ...traitsContext].join('\n');
  }

  static fromJSON(data: CharacterData): Character {
    return new Character(data);
  }
}
