// Domain layer: Game engine types
// NO external dependencies - pure TypeScript

/**
 * Core game engine interface - handles all D&D 5e mechanics
 */
export interface GameEngine {
  // Dice rolling
  roll(formula: string): DiceRoll;
  rollDamage(dice: string, modifier: number): DiceRoll;

  // Ability checks
  abilityCheck(characterId: string, ability: Ability, advantage?: RollType): AbilityCheckResult;
  savingThrow(characterId: string, ability: Ability, advantage?: RollType): SavingThrowResult;

  // Combat
  attackRoll(attackerId: string, weapon: Weapon, advantage?: RollType): AttackResult;
  applyDamage(targetId: string, damage: number, damageType: DamageType): DamageResult;

  // State management
  getCharacterState(characterId: string): CharacterState | null;
  updateCharacterState(characterId: string, updates: Partial<CharacterState>): void;
  syncCharacterStates(characterStates: Map<string, CharacterState>): void;

  // Conditions & effects
  applyCondition(targetId: string, condition: Condition): void;
  removeCondition(targetId: string, conditionName: string): void;
}

// Type definitions
export type Ability =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

export type Skill =
  | 'acrobatics'
  | 'animal-handling'
  | 'arcana'
  | 'athletics'
  | 'deception'
  | 'history'
  | 'insight'
  | 'intimidation'
  | 'investigation'
  | 'medicine'
  | 'nature'
  | 'perception'
  | 'performance'
  | 'persuasion'
  | 'religion'
  | 'sleight-of-hand'
  | 'stealth'
  | 'survival';

export type RollType = 'normal' | 'advantage' | 'disadvantage';

export type DamageType =
  | 'acid'
  | 'cold'
  | 'fire'
  | 'force'
  | 'lightning'
  | 'necrotic'
  | 'piercing'
  | 'poison'
  | 'psychic'
  | 'radiant'
  | 'slashing'
  | 'thunder';

// Result types
export interface DiceRoll {
  formula: string;
  rolls: number[];
  modifier: number;
  total: number;
  reason?: string;
  dc?: number;
}

export interface AbilityCheckResult {
  characterId: string;
  ability: Ability;
  roll: DiceRoll;
  abilityScore: number;
  modifier: number;
  rollType: RollType;
}

export interface SavingThrowResult extends AbilityCheckResult {
  type: 'saving-throw';
  proficiency?: number;
}

export interface Weapon {
  id: string;
  name: string;
  damage: string; // dice formula like "1d8"
  damageType: DamageType;
  versatile?: string; // e.g., "1d10" for two-handed
  finesse: boolean;
  ranged: boolean;
}

export interface AttackResult {
  attackerId: string;
  weapon: string;
  roll: DiceRoll;
  ability: Ability;
  proficiency: number;
  isCritical: boolean;
  hit?: boolean;
  ac?: number;
}

export interface DamageResult {
  targetId: string;
  damage: number;
  damageType: DamageType;
  finalDamage: number;
  resisted: boolean;
  immune: boolean;
  remainingHp: number;
  status: 'conscious' | 'unconscious' | 'dead';
}

// Character state (per-instance, not template)
export interface CharacterState {
  instanceId: string;
  characterId: string; // References CharacterTemplate
  currentHp: number;
  temporaryHp: number;
  conditions: Condition[];
  activeBuffs: Buff[];
  currentThoughts: string;
  knownSpells: SpellSlot[];
  equipmentState: EquipmentState;
}

export interface Condition {
  name: string;
  source: string;
  appliedAt: number;
  expiresAt?: number;
}

export interface Buff {
  name: string;
  source: string;
  duration?: number; // in rounds
  statAdjustments?: Record<string, number>;
  grantedBy?: string;
}

export interface SpellSlot {
  level: number;
  slots: number;
  used: number;
}

export interface EquipmentState {
  worn: string[];
  wielded: string[];
}
