// Domain layer: Character types
// Pure TypeScript - no external dependencies

export type CharacterClass =
  | 'BARBARIAN' | 'BARD' | 'CLERIC' | 'DRUID' | 'FIGHTER'
  | 'MONK' | 'PALADIN' | 'RANGER' | 'ROGUE' | 'SORCERER'
  | 'WARLOCK' | 'WIZARD';

export const CharacterClassLabels: Record<CharacterClass, string> = {
  BARBARIAN: '野蛮人',
  BARD: '吟游诗人',
  CLERIC: '牧师',
  DRUID: '德鲁伊',
  FIGHTER: '战士',
  MONK: '武僧',
  PALADIN: '圣武士',
  RANGER: '游侠',
  ROGUE: '盗贼',
  SORCERER: '术士',
  WARLOCK: '邪术师',
  WIZARD: '法师',
};

export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface CharacterData {
  // Metadata
  id?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;

  // Basic info
  name: string;
  race: string;
  characterClass: CharacterClass;
  level: number;
  background: string;
  alignment: string;

  // Ability scores
  abilityScores: AbilityScores;

  // Combat stats
  maxHp: number;
  currentHp: number;
  tempHp: number;
  armorClass: number;
  initiative: number;
  speed: number;

  // Death saves
  deathSaveSuccesses: number;
  deathSaveFailures: number;
  isDead: boolean;
  isStable: boolean;

  // Proficiencies
  skillProficiencies: string[];
  savingThrowProficiencies: string[];
  toolProficiencies: string[];
  languageProficiencies: string[];

  // Equipment
  gold: number;
  inventory: string[];
  equippedWeapon: string;
  equippedArmor: string;

  // Spells (for spellcasters)
  spellSlots: Record<string, number>;
  currentSpellSlots: Record<string, number>;
  knownSpells: string[];
  preparedSpells: string[];

  // Status
  statusEffects: string[];
  exhaustionLevel: number;

  // Roleplay
  appearance: string;
  personalityTraits: string;
  backstory: string;

  // 3D position
  position: string;

  // Custom fields
  stage: string;
  thoughts: string;
}

// ICharacter interface for character operations
export interface ICharacter {
  readonly data: CharacterData;

  // Calculations
  getModifier(ability: keyof AbilityScores): number;
  getProficiencyBonus(): number;
  getSkillBonus(skill: string, ability: keyof AbilityScores): number;
  getSavingThrowBonus(ability: keyof AbilityScores): number;

  // Combat
  takeDamage(amount: number, damageType?: string): number;
  heal(amount: number): number;
  rollDeathSave(roll: number): { stabilizedOrDead: boolean; message: string };

  // Status
  addStatusEffect(effect: string): void;
  removeStatusEffect(effect: string): void;
  hasStatusEffect(effect: string): boolean;
  canAct(): boolean;
  isConscious(): boolean;

  // Serialization
  toJSON(): CharacterData;
  toPromptProfile(): string;
}
