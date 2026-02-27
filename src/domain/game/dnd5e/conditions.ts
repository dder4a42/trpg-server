// Domain layer: D&D 5e condition definitions
// Pure constants - no dependencies

/**
 * All conditions in D&D 5e
 */
export const CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'exhausted',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;

export type DnDCondition = typeof CONDITIONS[number];

/**
 * Condition descriptions for LLM context
 */
export const CONDITION_DESCRIPTIONS: Record<DnDCondition, string> = {
  blinded: "A blinded creature can't see and automatically fails any ability check that requires sight.",
  charmed: "A charmed creature can't attack the charmer and has advantage on social checks against them.",
  deafened: "A deafened creature can't hear and automatically fails any ability check that requires hearing.",
  exhausted: 'Levels 1-6: Disadvantage on checks, speed halved, etc. Accumulates.',
  frightened: 'Disadvantage on checks while near source. Must move away from source.',
  grappled: "Speed becomes 0, can't benefit from bonuses to speed.",
  incapacitated: "Can't take actions or reactions.",
  invisible: 'Impossible to see without magic, advantage on attacks, disadvantages on attacks against.',
  paralyzed: "Speed 0, can't take actions, disadvantage on Dex saves, +5 to attacks against.",
  petrified: 'Transformed to solid material, has resistance to damage, etc.',
  poisoned: 'Disadvantage on attack rolls and ability checks.',
  prone: 'Disadvantage on attack rolls, advantage on melee attacks against, -2 to AC vs ranged.',
  restrained: 'Speed 0, disadvantage on Dex saves, attack rolls have disadvantage against.',
  stunned: "Incapacitated, can't take actions, disadvantage on Dex saves and attacks.",
  unconscious: "Incapacitated, can't move or speak, aware of surroundings, drops held items.",
};

/**
 * Conditions that cause unconsciousness (0 HP triggers)
 */
export const UNCONSCIOUS_CONDITIONS: DnDCondition[] = [
  'unconscious',
  'incapacitated',
  'paralyzed',
  'stunned',
];

/**
 * Conditions that prevent taking actions
 */
export const NO_ACTION_CONDITIONS: DnDCondition[] = [
  'incapacitated',
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
];

/**
 * Check if a condition prevents action
 */
export function preventsAction(condition: DnDCondition): boolean {
  return NO_ACTION_CONDITIONS.includes(condition);
}

/**
 * Check if a condition renders character unconscious
 */
export function rendersUnconscious(condition: DnDCondition): boolean {
  return UNCONSCIOUS_CONDITIONS.includes(condition);
}
