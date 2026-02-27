// Domain layer: D&D 5e rule constants and helpers
// Pure constants - no dependencies
/**
 * Standard armor class (unarmored)
 */
export const UNARMORED_AC = 10;
/**
 * Critical hit multiplier
 */
export const CRITICAL_MULTIPLIER = 2;
/**
 * Death save success threshold
 */
export const DEATH_SAVE_SUCCESS_THRESHOLD = 3;
/**
 * Death save failure threshold
 */
export const DEATH_SAVE_FAILURE_THRESHOLD = 3;
/**
 * Damage type resistances by race
 */
export const RACIAL_RESISTANCES = {
    dwarf: ['poison'],
    elf: [],
    gnome: [],
    halfling: [],
    'half-elf': [],
    'half-orc': [],
};
/**
 * Class-specific saving throw proficiencies
 */
export const CLASS_SAVING_THROWS = {
    BARBARIAN: ['strength', 'constitution'],
    BARD: ['dexterity', 'charisma'],
    CLERIC: ['wisdom', 'charisma'],
    DRUID: ['intelligence', 'wisdom'],
    FIGHTER: ['strength', 'constitution'],
    MONK: ['strength', 'dexterity'],
    PALADIN: ['wisdom', 'charisma'],
    RANGER: ['strength', 'dexterity'],
    ROGUE: ['dexterity', 'intelligence'],
    SORCERER: ['constitution', 'charisma'],
    WARLOCK: ['wisdom', 'charisma'],
    WIZARD: ['intelligence', 'wisdom'],
};
/**
 * Armor proficiency by class
 */
export const ARMOR_PROFICIENCIES = {
    BARBARIAN: ['light', 'medium', 'shields'],
    BARD: ['light', 'shields'],
    CLERIC: ['light', 'medium', 'shields'],
    DRUID: ['light', 'medium', 'shields', 'no-metal'],
    FIGHTER: ['light', 'medium', 'heavy', 'shields'],
    MONK: ['no-armor'],
    PALADIN: ['light', 'medium', 'heavy', 'shields'],
    RANGER: ['light', 'medium', 'shields'],
    ROGUE: ['light'],
    SORCERER: ['no-armor'],
    WARLOCK: ['light'],
    WIZARD: ['no-armor'],
};
/**
 * Get saving throw proficiencies for a class
 */
export function getClassSavingThrows(characterClass) {
    const normalized = characterClass.toUpperCase();
    return CLASS_SAVING_THROWS[normalized] || [];
}
/**
 * Check if a race has resistance to a damage type
 */
export function hasRacialResistance(race, damageType) {
    const normalized = race.toLowerCase();
    const resistances = RACIAL_RESISTANCES[normalized] || [];
    return resistances.includes(damageType);
}
