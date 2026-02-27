// Domain layer: D&D 5e ability and skill definitions
// Pure constants - no dependencies

import type { Ability, Skill } from '../types.js';

/**
 * All six abilities in D&D 5e
 */
export const ABILITIES: Ability[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];

/**
 * Skill to ability mapping
 */
export const SKILL_ABILITIES: Record<Skill, Ability> = {
  acrobatics: 'dexterity',
  'animal-handling': 'wisdom',
  arcana: 'intelligence',
  athletics: 'strength',
  deception: 'charisma',
  history: 'intelligence',
  insight: 'wisdom',
  intimidation: 'charisma',
  investigation: 'intelligence',
  medicine: 'wisdom',
  nature: 'intelligence',
  perception: 'wisdom',
  performance: 'charisma',
  persuasion: 'charisma',
  religion: 'intelligence',
  'sleight-of-hand': 'dexterity',
  stealth: 'dexterity',
  survival: 'wisdom',
};

/**
 * All skills in D&D 5e
 */
export const SKILLS: Skill[] = Object.keys(SKILL_ABILITIES) as Skill[];

/**
 * Calculate ability modifier from score
 * Formula: (score - 10) / 2, rounded down
 */
export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Calculate proficiency bonus for a given level
 * Formula: 1 + (level / 4), rounded up
 */
export function getProficiencyBonus(level: number): number {
  return Math.ceil(1 + level / 4);
}
