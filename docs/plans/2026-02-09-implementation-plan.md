# Game Engine and Context Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add D&D 5e game engine, structured context management for LLM, and message rendering with markdown support to the TRPG server.

**Architecture:** Clean Architecture with ContextBuilder pipeline, GameEngine for D&D 5e mechanics, and MessageRenderer for markdown/formatted output. Three-layer character state model (Template/State/GameState) for proper save/load.

**Tech Stack:** TypeScript, Node.js 18+, Express, LowDB, marked (markdown), HTMX, SSE

**Prerequisites:** Read `docs/plans/2026-02-09-game-engine-and-context-design.md` for full design context.

**Key Conventions:**
- All imports use `.js` extension (ES modules)
- Path alias `@/*` maps to `src/*`
- Domain layer: pure types/interfaces, no external deps
- Application layer: orchestration with dependencies via constructor
- Infrastructure layer: external I/O implementations
- Run `npm run typecheck` after each task to verify compilation

---

## Sprint 1: Foundation (Domain Types & Utilities)

### Task 1.1: Create Context Management Domain Types

**Files:**
- Create: `src/domain/llm/context.ts`

**Step 1: Write the file with context interfaces**

```typescript
// Domain layer: Context management types and interfaces
// NO external dependencies - pure TypeScript

import type { LLMMessage } from '@/domain/llm/types.js';

// Forward reference - will be defined in Task 1.2
export interface GameState {
  roomId: string;
  moduleName?: string;
  location: Location;
  characterStates: Map<string, CharacterState>;
  worldFlags: Record<string, string>;
  activeEncounters: Encounter[];
  lastUpdated: number;
}

// Placeholder types - will be properly defined in later tasks
export interface Location {
  name: string;
  description?: string;
}

export interface CharacterState {
  instanceId: string;
  characterId: string;
  currentHp: number;
  temporaryHp: number;
  conditions: Condition[];
  currentThoughts: string;
}

export interface Condition {
  name: string;
  source: string;
  appliedAt: number;
  expiresAt?: number;
}

export interface Encounter {
  id: string;
  enemies: Enemy[];
  isActive: boolean;
}

export interface Enemy {
  name: string;
  hp: number;
  maxHp: number;
  armorClass: number;
}

/**
 * A single block of context content to be added to the LLM prompt
 */
export interface ContextBlock {
  name: string;
  content: string;
  priority: number;
  metadata?: Record<string, unknown>;
}

/**
 * Provider that can generate context blocks based on current game state
 */
export interface ContextProvider {
  name: string;
  priority: number;
  provide(state: GameState): ContextBlock | ContextBlock[] | null;
}

/**
 * Builder that chains providers and generates final LLM messages
 */
export interface ContextBuilder {
  add(provider: ContextProvider): this;
  build(state: GameState): Promise<LLMMessage[]>;
  getContextSnapshot(): ContextSnapshot;
}

/**
 * Debug information about context building process
 */
export interface ContextSnapshot {
  timestamp: Date;
  providers: Array<{ name: string; priority: number }>;
  buildLog: BuildLogEntry[];
  errors: BuildErrorEntry[];
  estimatedTokens: number;
}

export interface BuildLogEntry {
  provider: string;
  priority: number;
  included: boolean;
  blockCount?: number;
  reason?: string;
}

export interface BuildErrorEntry {
  provider: string;
  error: string;
  cause?: unknown;
}
```

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: May show errors about undefined types (GameState, etc.) - these will be fixed in subsequent tasks

**Step 3: Commit**

```bash
git add src/domain/llm/context.ts
git commit -m "feat(domain): add context management interfaces"
```

---

### Task 1.2: Create Game State Types

**Files:**
- Create: `src/domain/game/GameState.ts`
- Create: `src/domain/game/types.ts`

**Step 1: Create directory structure**

```bash
mkdir -p src/domain/game
```

**Step 2: Write GameState.ts**

```typescript
// Domain layer: Game state types
// NO external dependencies - pure TypeScript

import type { CharacterState } from './types.js';

/**
 * Complete game state for a room/session
 * Contains all dynamic game data that changes during play
 */
export interface GameState {
  roomId: string;
  moduleName?: string;
  location: Location;
  characterStates: Map<string, CharacterState>;
  worldFlags: Record<string, string>;
  activeEncounters: Encounter[];
  lastUpdated: number;
}

export interface Location {
  name: string;
  description?: string;
  region?: string;
  coordinates?: { x: number; y: number };
}

export interface Encounter {
  id: string;
  name: string;
  enemies: Enemy[];
  isActive: boolean;
  round?: number;
}

export interface Enemy {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  armorClass: number;
  initiative?: number;
  conditions?: string[];
}

export interface QuestState {
  id: string;
  name: string;
  status: 'not-started' | 'in-progress' | 'completed' | 'failed';
  objectives: QuestObjective[];
}

export interface QuestObjective {
  description: string;
  completed: boolean;
}
```

**Step 3: Write types.ts**

```typescript
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
```

**Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: May show some circular reference errors - will fix in next step

**Step 5: Fix circular reference in context.ts**

Edit `src/domain/llm/context.ts`, replace the placeholder types with import:

```typescript
// At top of file, after existing imports
import type { CharacterState, Condition } from '@/domain/game/types.js';
import type { Encounter, GameState, Location } from '@/domain/game/GameState.js';

// Remove the placeholder type definitions from this file
// (Remove: export interface Location { ... }, export interface CharacterState { ... }, etc.)
```

**Step 6: Run typecheck again**

```bash
npm run typecheck
```

Expected: PASS (or only errors about unused exports)

**Step 7: Commit**

```bash
git add src/domain/game/
git commit -m "feat(domain): add game state and game engine types"
```

---

### Task 1.3: Create D&D 5e Rule Constants

**Files:**
- Create: `src/domain/game/dnd5e/abilities.ts`
- Create: `src/domain/game/dnd5e/conditions.ts`
- Create: `src/domain/game/dnd5e/rules.ts`

**Step 1: Create directory**

```bash
mkdir -p src/domain/game/dnd5e
```

**Step 2: Write abilities.ts**

```typescript
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
```

**Step 3: Write conditions.ts**

```typescript
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
  blinded: 'A blinded creature can\'t see and automatically fails any ability check that requires sight.',
  charmed: 'A charmed creature can\'t attack the charmer and has advantage on social checks against them.',
  deafened: 'A deafened creature can\'t hear and automatically fails any ability check that requires hearing.',
  exhausted: 'Levels 1-6: Disadvantage on checks, speed halved, etc. Accumulates.',
  frightened: 'Disadvantage on checks while near source. Must move away from source.',
  grappled: 'Speed becomes 0, can\'t benefit from bonuses to speed.',
  incapacitated: 'Can\'t take actions or reactions.',
  invisible: 'Impossible to see without magic, advantage on attacks, disadvantages on attacks against.',
  paralyzed: 'Speed 0, can\'t take actions, disadvantage on Dex saves, +5 to attacks against.',
  petrified: 'Transformed to solid material, has resistance to damage, etc.',
  poisoned: 'Disadvantage on attack rolls and ability checks.',
  prone: 'Disadvantage on attack rolls, advantage on melee attacks against, -2 to AC vs ranged.',
  restrained: 'Speed 0, disadvantage on Dex saves, attack rolls have disadvantage against.',
  stunned: 'Incapacitated, can\'t take actions, disadvantage on Dex saves and attacks.',
  unconscious: 'Incapacitated, can\'t move or speak, aware of surroundings, drops held items.',
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
```

**Step 4: Write rules.ts**

```typescript
// Domain layer: D&D 5e rule constants and helpers
// Pure constants - no dependencies

import type { Ability, DamageType } from '../types.js';

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
export const RACIAL_RESISTANCES: Record<string, DamageType[]> = {
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
export const CLASS_SAVING_THROWS: Record<string, Ability[]> = {
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
export const ARMOR_PROFICIENCIES: Record<string, string[]> = {
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
export function getClassSavingThrows(characterClass: string): Ability[] {
  const normalized = characterClass.toUpperCase();
  return CLASS_SAVING_THROWS[normalized] || [];
}

/**
 * Check if a race has resistance to a damage type
 */
export function hasRacialResistance(race: string, damageType: DamageType): boolean {
  const normalized = race.toLowerCase();
  const resistances = RACIAL_RESISTANCES[normalized] || [];
  return resistances.includes(damageType);
}
```

**Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/domain/game/dnd5e/
git commit -m "feat(domain): add D&D 5e rule constants"
```

---

### Task 1.4: Create Message Types

**Files:**
- Create: `src/domain/messages/types.ts`

**Step 1: Create directory**

```bash
mkdir -p src/domain/messages
```

**Step 2: Write types.ts**

```typescript
// Domain layer: Message types for game communication
// NO external dependencies - pure TypeScript

import type { LLMMessage } from '@/domain/llm/types.js';
import type { DiceRoll } from '../game/types.js';

/**
 * Enhanced game message with metadata for rendering
 */
export interface GameMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  content: string;

  // For user messages - who sent it
  sender?: MessageSender;

  // For assistant messages - mechanics data
  mechanics?: MessageMechanics;

  // Metadata
  metadata?: Record<string, unknown>;
}

export interface MessageSender {
  userId: string;
  username: string;
  characterId?: string;
  characterName?: string;
}

export interface MessageMechanics {
  diceRolls?: DiceRoll[];
  checks?: AbilityCheck[];
  combat?: CombatEvent;
}

export interface AbilityCheck {
  checkId: string;
  characterId: string;
  characterName?: string;
  ability: string;
  roll: DiceRoll;
  dc?: number;
  success?: boolean;
}

export interface CombatEvent {
  eventId: string;
  type: 'attack' | 'damage' | 'saving-throw' | 'death-save';
  attackerId?: string;
  attackerName?: string;
  targetId?: string;
  targetName?: string;
  weapon?: string;
  roll?: DiceRoll;
  damage?: number;
  damageType?: string;
  result?: string;
}

/**
 * Convert GameMessage to LLMMessage for LLM API
 */
export function toLLMMessage(message: GameMessage): LLMMessage {
  const llmMessage: LLMMessage = {
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
  };

  // For user messages, prepend sender name
  if (message.role === 'user' && message.sender) {
    const name = message.sender.characterName || message.sender.username;
    llmMessage.content = `[${name}] ${message.content}`;
  }

  return llmMessage;
}

/**
 * Convert multiple GameMessages to LLMMessages
 */
export function toLLMMessages(messages: GameMessage[]): LLMMessage[] {
  return messages.map(toLLMMessage);
}
```

**Step 3: Update domain index to export new types**

Edit `src/domain/index.ts`, add:

```typescript
// At end of file
// Game domain
export * from './game/types.js';
export * from './game/GameState.js';

// Messages domain
export * from './messages/types.js';

// Context management
export * from './llm/context.js';
```

**Step 4: Run tests**

```bash
node --test --import tsx
```

Expected: PASS

**Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/domain/messages/ src/domain/index.ts
git commit -m "feat(domain): add message types with sender and mechanics metadata"
```

---

### Task 1.5: Create Utility Functions

**Files:**
- Create: `src/utils/dice.ts`
- Create: `src/utils/markdown.ts`

**Step 1: Write dice.ts**

```typescript
// Utilities: Dice formula parsing
// Pure functions for parsing dice notation like "2d6+3", "d8", "4d10-1"

export interface ParsedDiceFormula {
  count: number;
  sides: number;
  modifier: number;
  original: string;
}

/**
 * Parse a dice formula into components
 * @param formula - Dice formula like "2d6+3", "d8", "4d10-1"
 * @returns Parsed formula with count, sides, and modifier
 * @throws Error if formula is invalid
 */
export function parseDiceFormula(formula: string): ParsedDiceFormula {
  // Trim and lowercase
  const trimmed = formula.trim().toLowerCase();

  // Match pattern: (count)d(sides)(modifier)
  // Examples: 2d6+3, d8, 4d10-1, 1d20
  const match = trimmed.match(/^(\d*)d(\d+)([+-]\d+)?$/i);

  if (!match) {
    throw new Error(`Invalid dice formula: "${formula}"`);
  }

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  // Validate values
  if (count < 1 || count > 100) {
    throw new Error(`Dice count must be between 1 and 100, got: ${count}`);
  }

  if (sides < 2 || sides > 1000) {
    throw new Error(`Dice sides must be between 2 and 1000, got: ${sides}`);
  }

  if (modifier < -1000 || modifier > 1000) {
    throw new Error(`Modifier must be between -1000 and 1000, got: ${modifier}`);
  }

  return {
    count,
    sides,
    modifier,
    original: formula,
  };
}

/**
 * Format a dice roll result as human-readable string
 */
export function formatDiceRoll(
  rolls: number[],
  modifier: number,
  total: number,
  formula?: string
): string {
  const modStr = modifier >= 0 ? `+ ${modifier}` : `- ${Math.abs(modifier)}`;
  return `[${rolls.join(', ')}]${modifier !== 0 ? ` ${modStr}` : ''} = ${total}${formula ? ` (${formula})` : ''}`;
}

/**
 * Roll dice using a random number generator
 * @param sides - Number of sides on the die
 * @param rng - Random number generator (0-1), defaults to Math.random
 * @returns A single die roll result
 */
export function rollDie(sides: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * sides) + 1;
}

/**
 * Roll multiple dice
 * @param formula - Dice formula to roll
 * @param rng - Random number generator (0-1), defaults to Math.random
 * @returns Roll result with individual rolls and total
 */
export function rollDice(
  formula: string,
  rng: () => number = Math.random
): { rolls: number[]; modifier: number; total: number } {
  const parsed = parseDiceFormula(formula);
  const rolls = Array.from({ length: parsed.count }, () => rollDie(parsed.sides, rng));
  const total = rolls.reduce((a, b) => a + b, 0) + parsed.modifier;

  return {
    rolls,
    modifier: parsed.modifier,
    total,
  };
}
```

**Step 2: Write markdown.ts**

```typescript
// Utilities: Markdown parsing wrapper around marked library
// Provides consistent markdown rendering for the application

import { marked } from 'marked';

/**
 * Configure marked for our use case
 */
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert \n to <br>
});

/**
 * Parse markdown to HTML
 * @param text - Markdown text to parse
 * @returns HTML string
 */
export function parseMarkdown(text: string): string {
  return marked.parse(text);
}

/**
 * Parse markdown inline (no block elements like paragraphs)
 * @param text - Inline markdown text to parse
 * @returns HTML string
 */
export function parseMarkdownInline(text: string): string {
  return marked.parseInline(text);
}

/**
 * Strip markdown formatting, return plain text
 * @param text - Markdown text
 * @returns Plain text without markdown syntax
 */
export function stripMarkdown(text: string): string {
  // Remove bold/italic
  let plain = text.replace(/\*\*\*(.+?)\*\*\*/g, '$1'); // bold+italic
  plain = plain.replace(/\*\*(.+?)\*\*/g, '$1'); // bold
  plain = plain.replace(/\*(.+?)\*/g, '$1'); // italic
  plain = plain.replace(/___(.+?)___/g, '$1'); // bold+italic alt
  plain = plain.replace(/__(.+?)__/g, '$1'); // bold alt
  plain = plain.replace(/_(.+?)_/g, '$1'); // italic alt

  // Remove strikethrough
  plain = plain.replace(/~~(.+?)~~/g, '$1');

  // Remove code
  plain = plain.replace(/`(.+?)`/g, '$1');
  plain = plain.replace(/```.+?```/gs, '');

  // Remove links
  plain = plain.replace(/\[(.+?)\]\(.+?\)/g, '$1');

  // Remove headers
  plain = plain.replace(/^#+\s+/gm, '');

  return plain;
}

/**
 * Escape HTML special characters
 * @param text - Text to escape
 * @returns Escaped text safe for HTML
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parse markdown and escape for safe streaming
 * Combines markdown parsing with HTML escaping for SSE streaming
 */
export function parseMarkdownForStreaming(text: string): string {
  return parseMarkdown(text);
}
```

**Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 4: Test dice parsing manually**

Create temporary test file:

```bash
node --input-type=module -e "
import { parseDiceFormula } from './dist/utils/dice.js';
console.log(parseDiceFormula('2d6+3'));
console.log(parseDiceFormula('d8'));
console.log(parseDiceFormula('4d10-1'));
"
```

Expected: Output parsed objects correctly

**Step 5: Commit**

```bash
git add src/utils/dice.ts src/utils/markdown.ts
git commit -m "feat(utils): add dice parsing and markdown utilities"
```

---

## Sprint 1 Complete: Foundation Checkpoint

**Verify:**

```bash
# All files should compile
npm run typecheck

# Build should succeed
npm run build

# Run tests (if any exist)
node --test --import tsx
```

**Expected:** Clean build, no type errors

**Summary of Sprint 1:**
- ✅ Context management interfaces defined
- ✅ Game state and game engine types defined
- ✅ D&D 5e rule constants created
- ✅ Message types with sender/mechanics metadata
- ✅ Dice parsing and markdown utilities
- ✅ All domain types compile cleanly

**Next Sprint:** Infrastructure & Repositories (DiceRoller, Database updates, GameStateRepository)

---

## Sprint 2: Infrastructure & Repositories

### Task 2.1: Create DiceRoller Implementation

**Files:**
- Create: `src/infrastructure/game/DiceRoller.ts`

**Step 1: Create directory**

```bash
mkdir -p src/infrastructure/game
```

**Step 2: Write DiceRoller.ts**

```typescript
// Infrastructure layer: Dice rolling RNG implementation
// Implements testable dice rolling with injectable random number generator

export interface DiceRoller {
  roll(sides: number): number;
}

/**
 * Standard random dice roller using Math.random()
 * Use in production
 */
export class RandomDiceRoller implements DiceRoller {
  roll(sides: number): number {
    if (sides < 2) {
      throw new Error(`Dice must have at least 2 sides, got: ${sides}`);
    }
    if (sides > 1000) {
      throw new Error(`Dice cannot have more than 1000 sides, got: ${sides}`);
    }
    return Math.floor(Math.random() * sides) + 1;
  }
}

/**
 * Fixed dice roller for testing
 * Returns predetermined values from an array
 * Use in unit tests
 */
export class FixedDiceRoller implements DiceRoller {
  private values: number[];

  constructor(values: number[]) {
    this.values = [...values];
  }

  roll(sides: number): number {
    const value = this.values.shift();
    if (value === undefined) {
      throw new Error('FixedDiceRoller: No more values available');
    }
    if (value < 1 || value > sides) {
      throw new Error(`FixedDiceRoller: Value ${value} out of range for ${sides}-sided die`);
    }
    return value;
  }

  /**
   * Check how many values remain
   */
  get remaining(): number {
    return this.values.length;
  }
}

/**
 * Seeded dice roller for reproducible rolls
 * Uses a simple Linear Congruential Generator
 * Use for testing when you need randomness but reproducibility
 */
export class SeededDiceRoller implements DiceRoller {
  private state: number;

  constructor(seed: number = Date.now()) {
    this.state = seed;
  }

  roll(sides: number): number {
    // LCG parameters from glibc
    this.state = (this.state * 1103515245 + 12345) & 0x7fffffff;
    return (this.state % sides) + 1;
  }
}
```

**Step 3: Write tests for DiceRoller**

Create `test/infrastructure/game/DiceRoller.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { RandomDiceRoller, FixedDiceRoller, SeededDiceRoller } from '@/infrastructure/game/DiceRoller.js';

test('RandomDiceRoller rolls within range', () => {
  const roller = new RandomDiceRoller();
  for (let i = 0; i < 100; i++) {
    const result = roller.roll(20);
    assert.ok(result >= 1 && result <= 20);
  }
});

test('RandomDiceRoller throws for invalid sides', () => {
  const roller = new RandomDiceRoller();
  assert.throws(() => roller.roll(1));
  assert.throws(() => roller.roll(1001));
});

test('FixedDiceRoller returns fixed values in order', () => {
  const roller = new FixedDiceRoller([5, 10, 15]);
  assert.equal(roller.roll(20), 5);
  assert.equal(roller.roll(20), 10);
  assert.equal(roller.roll(20), 15);
});

test('FixedDiceRoller throws when out of values', () => {
  const roller = new FixedDiceRoller([5]);
  roller.roll(20);
  assert.throws(() => roller.roll(20));
});

test('FixedDiceRoller tracks remaining values', () => {
  const roller = new FixedDiceRoller([5, 10, 15]);
  assert.equal(roller.remaining, 3);
  roller.roll(20);
  assert.equal(roller.remaining, 2);
});

test('SeededDiceRoller is deterministic with same seed', () => {
  const roller1 = new SeededDiceRoller(12345);
  const roller2 = new SeededDiceRoller(12345);

  const rolls1 = Array.from({ length: 10 }, () => roller1.roll(20));
  const rolls2 = Array.from({ length: 10 }, () => roller2.roll(20));

  assert.deepEqual(rolls1, rolls2);
});

test('SeededDiceRoller differs with different seeds', () => {
  const roller1 = new SeededDiceRoller(12345);
  const roller2 = new SeededDiceRoller(54321);

  const rolls1 = Array.from({ length: 10 }, () => roller1.roll(20));
  const rolls2 = Array.from({ length: 10 }, () => roller2.roll(20));

  assert.notDeepEqual(rolls1, rolls2);
});
```

**Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/infrastructure/game/ test/infrastructure/game/
git commit -m "feat(infrastructure): add testable DiceRoller with RNG implementations"
```

---

### Task 2.2: Update Database Schema

**Files:**
- Modify: `src/infrastructure/database/lowdb/connection.ts`

**Step 1: Add new type definitions**

Add to `src/infrastructure/database/lowdb/connection.ts` after existing type definitions:

```typescript
// Add after SaveSlotRecord interface (around line 152)

// NEW: Game states for save/load functionality
export interface GameStateRecord {
  room_id: string;
  slot_name: string; // Save slot identifier
  module_name?: string;
  location_name: string;
  location_description?: string;
  character_states: string; // JSON stringified array
  world_flags: string; // JSON stringified object
  active_encounters: string; // JSON stringified array
  last_updated: number; // Unix timestamp
  created_at: string;
  updated_at: string;
}

// NEW: Save slot metadata (extended from existing)
export interface SaveSlotRecordExtended extends SaveSlotRecord {
  slot_name: string; // Primary identifier
  description?: string;
  screenshot_url?: string;
  created_at: string;
  updated_at: string;
  turn_count?: number;
}

// Character state within a game save
export interface CharacterStateRecord {
  instance_id: string;
  character_id: string; // References character template
  current_hp: number;
  temporary_hp: number;
  conditions: string; // JSON array
  active_buffs: string; // JSON array
  current_thoughts: string;
  known_spells: string; // JSON array
  equipment_worn: string; // JSON array
  equipment_wielded: string; // JSON array
}
```

**Step 2: Update DatabaseSchema interface**

Modify the `DatabaseSchema` interface to include the new collection:

```typescript
export interface DatabaseSchema {
  users: UserRecord[];
  rooms: RoomRecord[];
  characters: CharacterRecord[];
  roomCharacters: RoomCharacterRecord[];
  conversationTurns: ConversationTurnRecord[];
  statusBarEntries: StatusBarEntryRecord[];
  statusBarFlags: StatusBarFlagRecord[];
  saveSlots: SaveSlotRecord[];
  userSessions: UserSessionRecord[];

  // NEW collections
  gameStates: GameStateRecord[];
}
```

**Step 3: Update defaultData**

Modify the `defaultData` constant:

```typescript
const defaultData: DatabaseSchema = {
  users: [],
  rooms: [],
  characters: [],
  roomCharacters: [],
  conversationTurns: [],
  statusBarEntries: [],
  statusBarFlags: [],
  saveSlots: [],
  userSessions: [],

  // NEW
  gameStates: [],
};
```

**Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: May show errors about missing exports - will fix in next task

**Step 5: Commit**

```bash
git add src/infrastructure/database/lowdb/connection.ts
git commit -m "feat(database): add gameStates collection to schema"
```

---

### Task 2.3: Create GameStateRepository

**Files:**
- Create: `src/infrastructure/database/lowdb/GameStateRepository.ts`

**Step 1: Write GameStateRepository.ts**

```typescript
// Infrastructure layer: GameState repository using LowDB
// Handles persistence of game state for save/load functionality

import type { GameState } from '@/domain/game/GameState.js';
import type { DatabaseConnection, GameStateRecord, CharacterStateRecord } from './connection.js';

/**
 * Repository for game state persistence
 * Handles saving and loading complete game states
 */
export class GameStateRepository {
  constructor(private db: DatabaseConnection) {}

  /**
   * Save a game state to a specific slot
   * @param roomId - Room identifier
   * @param slotName - Save slot name (e.g., "autosave", "slot1")
   * @param state - Game state to save
   */
  async saveState(roomId: string, slotName: string, state: GameState): Promise<void> {
    const data = this.db.getData();

    // Convert Map to array for JSON serialization
    const characterStatesArray = Array.from(state.characterStates.entries()).map(([instanceId, charState]) => ({
      instance_id: instanceId,
      character_id: charState.characterId,
      current_hp: charState.currentHp,
      temporary_hp: charState.temporaryHp,
      conditions: JSON.stringify(charState.conditions),
      active_buffs: JSON.stringify(charState.activeBuffs),
      current_thoughts: charState.currentThoughts || '',
      known_spells: JSON.stringify(charState.knownSpells || []),
      equipment_worn: JSON.stringify(charState.equipmentState?.worn || []),
      equipment_wielded: JSON.stringify(charState.equipmentState?.wielded || []),
    }));

    const record: GameStateRecord = {
      room_id: roomId,
      slot_name: slotName,
      module_name: state.moduleName,
      location_name: state.location.name,
      location_description: state.location.description,
      character_states: JSON.stringify(characterStatesArray),
      world_flags: JSON.stringify(state.worldFlags || {}),
      active_encounters: JSON.stringify(state.activeEncounters || []),
      last_updated: state.lastUpdated || Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Find existing or add new
    const existingIndex = data.gameStates?.findIndex(
      s => s.room_id === roomId && s.slot_name === slotName
    ) ?? -1;

    if (existingIndex >= 0) {
      data.gameStates[existingIndex] = record;
    } else {
      data.gameStates.push(record);
    }

    this.db.setData(data);
    await this.db.write();
  }

  /**
   * Load a game state from a specific slot
   * @param roomId - Room identifier
   * @param slotName - Save slot name
   * @returns Game state or null if not found
   */
  async loadState(roomId: string, slotName: string): Promise<GameState | null> {
    const data = this.db.getData();
    const record = data.gameStates?.find(
      s => s.room_id === roomId && s.slot_name === slotName
    );

    if (!record) {
      return null;
    }

    // Parse character states
    const characterStatesArray: CharacterStateRecord[] = JSON.parse(record.character_states || '[]');
    const characterStates = new Map(
      characterStatesArray.map(cs => [
        cs.instance_id,
        {
          instanceId: cs.instance_id,
          characterId: cs.character_id,
          currentHp: cs.current_hp,
          temporaryHp: cs.temporary_hp,
          conditions: JSON.parse(cs.conditions || '[]'),
          activeBuffs: JSON.parse(cs.active_buffs || '[]'),
          currentThoughts: cs.current_thoughts || '',
          knownSpells: JSON.parse(cs.known_spells || '[]'),
          equipmentState: {
            worn: JSON.parse(cs.equipment_worn || '[]'),
            wielded: JSON.parse(cs.equipment_wielded || '[]'),
          },
        },
      ])
    );

    return {
      roomId: record.room_id,
      moduleName: record.module_name,
      location: {
        name: record.location_name,
        description: record.location_description,
      },
      characterStates,
      worldFlags: JSON.parse(record.world_flags || '{}'),
      activeEncounters: JSON.parse(record.active_encounters || '[]'),
      lastUpdated: record.last_updated,
    };
  }

  /**
   * Delete a game state from a specific slot
   * @param roomId - Room identifier
   * @param slotName - Save slot name
   */
  async deleteState(roomId: string, slotName: string): Promise<void> {
    const data = this.db.getData();
    data.gameStates = data.gameStates?.filter(
      s => !(s.room_id === roomId && s.slot_name === slotName)
    ) || [];

    this.db.setData(data);
    await this.db.write();
  }

  /**
   * List all save slots for a room
   * @param roomId - Room identifier
   * @returns Array of save slot records
   */
  async listSlots(roomId: string): Promise<GameStateRecord[]> {
    const data = this.db.getData();
    return data.gameStates?.filter(s => s.room_id === roomId) || [];
  }

  /**
   * Get a specific save slot record
   * @param roomId - Room identifier
   * @param slotName - Save slot name
   * @returns Save slot record or null
   */
  async getSlot(roomId: string, slotName: string): Promise<GameStateRecord | null> {
    const data = this.db.getData();
    return data.gameStates?.find(
      s => s.room_id === roomId && s.slot_name === slotName
    ) || null;
  }

  /**
   * Check if a slot exists
   * @param roomId - Room identifier
   * @param slotName - Save slot name
   * @returns True if slot exists
   */
  async hasSlot(roomId: string, slotName: string): Promise<boolean> {
    const slot = await this.getSlot(roomId, slotName);
    return slot !== null;
  }
}
```

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: May need to fix import paths or missing types

**Step 3: Fix any type errors**

If there are errors about missing types in GameState, ensure the import uses `src/domain/game/GameState.ts` and that `CharacterState` remains exported from `src/domain/game/types.ts`.

**Step 4: Commit**

```bash
git add src/infrastructure/database/lowdb/GameStateRepository.ts
git commit -m "feat(infrastructure): add GameStateRepository for save/load functionality"
```

---

### Task 2.4: Update DatabaseService

**Files:**
- Modify: `src/infrastructure/database/DatabaseService.ts`

**Step 1: Read current DatabaseService**

```bash
cat src/infrastructure/database/DatabaseService.ts
```

**Step 2: Export GameStateRepository from lowdb index**

Edit `src/infrastructure/database/lowdb/index.ts`, add:

```typescript
export { GameStateRepository } from './GameStateRepository.js';
```

**Step 3: Add GameStateRepository to DatabaseService**

Add the following to DatabaseService.ts (after other repositories):

```typescript
// Import at top
import {
  getDatabase,
  type DatabaseConfig,
  CharacterRepository,
  RoomRepository,
  ConversationHistoryRepository,
  StatusBarRepository,
  UserRepository,
  UserSessionRepository,
  RoomMembershipRepository,
  GameStateRepository,
} from './lowdb/index.js';

// In DatabaseService class, add public readonly property:
public readonly gameStates: GameStateRepository;

// In constructor, initialize it like other repositories:
this.gameStates = new GameStateRepository(db);
```

**Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/infrastructure/database/DatabaseService.ts src/infrastructure/database/lowdb/index.ts
git commit -m "feat(infrastructure): add GameStateRepository to DatabaseService"
```

---

## Sprint 2 Complete: Infrastructure Checkpoint

**Verify:**

```bash
npm run typecheck
npm run build
```

**Expected:** Clean build

**Summary of Sprint 2:**
- ✅ DiceRoller with testable RNG implementations
- ✅ Database schema extended with gameStates collection
- ✅ GameStateRepository for save/load
- ✅ DatabaseService updated

**Next Sprint:** Context Management (ContextBuilder, Providers)

---

## Sprint 3: Context Management

### Task 3.1: Create ContextBuilder Implementation

**Files:**
- Create: `src/application/context/ContextBuilder.ts`

**Step 1: Create directory**

```bash
mkdir -p src/application/context
```

**Step 2: Write ContextBuilder.ts**

```typescript
// Application layer: ContextBuilder implementation
// Orchestrates context providers and builds LLM messages

import type {
  ContextBlock,
  ContextBuilder as IContextBuilder,
  ContextProvider,
  ContextSnapshot,
  BuildLogEntry,
  BuildErrorEntry,
} from '@/domain/llm/context.js';
import type { GameState } from '@/domain/game/GameState.js';
import type { LLMMessage } from '@/domain/llm/types.js';
import { estimateTokens } from '@/utils/tokens.js';

/**
 * Implementation of ContextBuilder
 * Chains providers and builds final LLM messages with observability
 */
export class ContextBuilder implements IContextBuilder {
  private providers: ContextProvider[] = [];
  private buildLog: BuildLogEntry[] = [];
  private errors: BuildErrorEntry[] = [];
  private lastEstimatedTokens = 0;

  add(provider: ContextProvider): this {
    this.providers.push(provider);
    return this;
  }

  async build(state: GameState): Promise<LLMMessage[]> {
    this.buildLog = [];
    this.errors = [];

    // Sort providers by priority
    const sorted = [...this.providers].sort((a, b) => a.priority - b.priority);
    const blocks: ContextBlock[] = [];

    // Execute each provider
    for (const provider of sorted) {
      try {
        const result = provider.provide(state);

        if (result) {
          const blocksToAdd = Array.isArray(result) ? result : [result];
          blocks.push(...blocksToAdd);

          this.buildLog.push({
            provider: provider.name,
            priority: provider.priority,
            included: true,
            blockCount: blocksToAdd.length,
          });
        } else {
          this.buildLog.push({
            provider: provider.name,
            priority: provider.priority,
            included: false,
            reason: 'Provider returned null',
          });
        }
      } catch (error) {
        // Log error but continue with other providers
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.errors.push({
          provider: provider.name,
          error: errorMessage,
          cause: error,
        });

        console.error(`[ContextBuilder] Provider ${provider.name} failed:`, error);

        this.buildLog.push({
          provider: provider.name,
          priority: provider.priority,
          included: false,
          reason: `Error: ${errorMessage}`,
        });
      }
    }

    // Check for critical provider failures
    const criticalProviders = ['system-prompt', 'conversation-history'];
    const criticalFailure = this.errors.find(e => criticalProviders.includes(e.provider));

    if (criticalFailure) {
      throw new Error(`Critical context provider failed: ${criticalFailure.provider}`);
    }

    this.lastEstimatedTokens = blocks.reduce(
      (sum, block) => sum + estimateTokens(block.content),
      0
    );

    return this.combineBlocksToMessages(blocks);
  }

  getContextSnapshot(): ContextSnapshot {
    return {
      timestamp: new Date(),
      providers: this.providers.map(p => ({
        name: p.name,
        priority: p.priority,
      })),
      buildLog: this.buildLog,
      errors: this.errors,
      estimatedTokens: this.estimateTotalTokens(),
    };
  }

  private combineBlocksToMessages(blocks: ContextBlock[]): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // Group blocks by role/purpose
    const systemBlocks: ContextBlock[] = [];
    const contextBlocks: ContextBlock[] = [];

    for (const block of blocks) {
      if (block.priority < 200) {
        systemBlocks.push(block);
      } else {
        contextBlocks.push(block);
      }
    }

    // Build system message from system blocks
    if (systemBlocks.length > 0) {
      const systemContent = systemBlocks
        .map(b => b.content)
        .join('\n\n');
      messages.push({
        role: 'system',
        content: systemContent,
      });
    }

    // Build context messages from context blocks
    for (const block of contextBlocks) {
      messages.push({
        role: 'system',
        content: block.content,
        timestamp: Date.now(),
      });
    }

    return messages;
  }

  private estimateTotalTokens(): number {
    return this.lastEstimatedTokens;
  }
}
```

**Step 3: Create token estimation utility**

Create `src/utils/tokens.ts`:

```typescript
// Utilities: Token estimation for LLM context
// Rough estimation since we don't have tiktoken on backend

/**
 * Estimate token count for text
 * Rough estimate: ~4 characters per token for English text
 * Will be less accurate for Chinese text
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Count characters (Chinese characters count as more)
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;

  // Chinese: ~2 chars per token, English: ~4 chars per token
  return Math.ceil(chineseChars / 2 + otherChars / 4);
}

/**
 * Estimate token count for an array of messages
 */
export function estimateMessagesTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
}

/**
 * Check if content is within token limit
 */
export function isWithinTokenLimit(content: string, limit: number): boolean {
  return estimateTokens(content) <= limit;
}
```

**Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/application/context/ContextBuilder.ts src/utils/tokens.ts
git commit -m "feat(application): add ContextBuilder with provider pipeline"
```

---

### Task 3.2: Create SystemPromptProvider

**Files:**
- Create: `src/application/context/providers/SystemPromptProvider.ts`

**Step 1: Create directory**

```bash
mkdir -p src/application/context/providers
```

**Step 2: Write SystemPromptProvider.ts**

```typescript
// Application layer: System prompt provider
// Provides the base DM system prompt

import type { ContextBlock, ContextProvider } from '@/domain/llm/context.js';
import type { GameState } from '@/domain/game/GameState.js';
import { loadPrompt } from '@/utils/prompts.js';

export class SystemPromptProvider implements ContextProvider {
  name = 'system-prompt';
  priority = 0;

  provide(state: GameState): ContextBlock | null {
    try {
      const prompt = loadPrompt('system_prompt');
      return {
        name: this.name,
        content: prompt,
        priority: this.priority,
      };
    } catch (error) {
      console.error('[SystemPromptProvider] Failed to load prompt:', error);
      // Return fallback prompt
      return {
        name: this.name,
        content: this.getFallbackPrompt(),
        priority: this.priority,
      };
    }
  }

  private getFallbackPrompt(): string {
    return `你是一个TRPG游戏主持人。你的职责是：
1. 根据玩家的行动推动故事发展
2. 描述场景和NPC反应
3. 在适当时机要求玩家进行检定
4. 保持故事的连贯性和趣味性

输出格式：
- 场景描述用第三人称
- NPC对话用引号
- 需要检定时明确说明`;
  }
}
```

**Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/application/context/providers/SystemPromptProvider.ts
git commit -m "feat(application): add SystemPromptProvider with fallback"
```

---

### Task 3.3: Create CharacterProfileProvider

**Files:**
- Create: `src/application/context/providers/CharacterProfileProvider.ts`

**Step 1: Write CharacterProfileProvider.ts**

```typescript
// Application layer: Character profile provider
// Provides character information for LLM context

import type { ContextProvider, ContextBlock } from '@/domain/llm/context.js';
import type { CharacterState } from '@/domain/game/types.js';
import type { GameState } from '@/domain/game/GameState.js';
import type { CharacterRepository } from '@/infrastructure/database/lowdb/CharacterRepository.js';

export class CharacterProfileProvider implements ContextProvider {
  name = 'character-profiles';
  priority = 200;

  constructor(private characterRepo: CharacterRepository) {}

  provide(state: GameState): ContextBlock | null {
    if (state.characterStates.size === 0) {
      return null;
    }

    const profiles: string[] = [];

    for (const [instanceId, charState] of state.characterStates) {
      const template = this.characterRepo.findById(charState.characterId);
      if (!template) continue;

      const profile = this.formatCharacter(template, charState);
      profiles.push(profile);
    }

    if (profiles.length === 0) {
      return null;
    }

    return {
      name: this.name,
      content: `[CHARACTERS]\n${profiles.join('\n\n')}\n[/CHARACTERS]`,
      priority: this.priority,
      metadata: {
        characterCount: profiles.length,
      },
    };
  }

  private formatCharacter(
    template: any,
    state: CharacterState
  ): string {
    const parts: string[] = [];

    // Basic info
    parts.push(`**${template.name}**`);
    parts.push(`种族：${template.race} | 职业：${template.characterClass} | 等级：${template.level}`);

    // Combat stats
    const hpPercent = Math.round((state.currentHp / template.maxHp) * 100);
    parts.push(`生命值：${state.currentHp}/${template.maxHp} (${hpPercent}%) | AC：${template.armorClass}`);

    // Ability scores (abbreviated)
    const abilities = template.abilityScores || {};
    if (Object.keys(abilities).length > 0) {
      const abilityStr = Object.entries(abilities)
        .map(([key, value]) => `${key.slice(0, 3).toUpperCase()}:${value}`)
        .join(' ');
      parts.push(`属性：${abilityStr}`);
    }

    // Conditions
    if (state.conditions && state.conditions.length > 0) {
      const conditionNames = state.conditions.map(c => c.name).join(', ');
      parts.push(`状态：${conditionNames}`);
    }

    // Current thoughts
    if (state.currentThoughts) {
      parts.push(`当前想法：${state.currentThoughts}`);
    }

    // Roleplay info
    if (template.personalityTraits) {
      parts.push(`性格：${template.personalityTraits}`);
    }

    return parts.join('\n');
  }
}
```

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/application/context/providers/CharacterProfileProvider.ts
git commit -m "feat(application): add CharacterProfileProvider for LLM context"
```

---

### Task 3.4: Create GameRulesProvider

**Files:**
- Create: `src/application/context/providers/GameRulesProvider.ts`

**Step 1: Write GameRulesProvider.ts**

```typescript
// Application layer: Game rules provider
// Provides D&D 5e rules context when relevant

import type { ContextBlock, ContextProvider } from '@/domain/llm/context.js';
import type { GameState } from '@/domain/game/GameState.js';
import { CONDITION_DESCRIPTIONS } from '@/domain/game/dnd5e/conditions.js';

export class GameRulesProvider implements ContextProvider {
  name = 'game-rules';
  priority = 300;

  provide(state: GameState): ContextBlock | null {
    const rules: string[] = [];

    // Only provide rules if in combat or characters have conditions
    const inCombat = state.activeEncounters && state.activeEncounters.length > 0;
    const hasConditions = this.hasAnyConditions(state);

    if (!inCombat && !hasConditions) {
      return null;
    }

    if (inCombat) {
      rules.push('MODE: COMBAT');
      rules.push('- 每个回合：动作、移动、附赠动作、自由动作');
      rules.push('- 攻击检定：d20 + 熟练加值 + 属性调整');
      rules.push('- 伤害掷骰：武器伤害骰 + 属性调整');
      rules.push('- 优势：掷2d20取高值；劣势：掷2d20取低值');
      rules.push('- 重击：掷出20时伤害翻倍');
    }

    if (hasConditions) {
      rules.push('\nACTIVE CONDITIONS:');
      for (const [instanceId, charState] of state.characterStates) {
        if (charState.conditions && charState.conditions.length > 0) {
          const charName = this.getCharacterName(state, instanceId);
          const conditionList = charState.conditions.map(c => {
            const desc = CONDITION_DESCRIPTIONS[c.name as keyof typeof CONDITION_DESCRIPTIONS];
            return `- ${c.name}${desc ? ': ' + desc : ''}`;
          }).join('\n  ');
          rules.push(`${charName}:\n  ${conditionList}`);
        }
      }
    }

    return {
      name: this.name,
      content: `[GAME_RULES]\n${rules.join('\n')}\n[/GAME_RULES]`,
      priority: this.priority,
      metadata: {
        inCombat,
        hasConditions,
      },
    };
  }

  private hasAnyConditions(state: GameState): boolean {
    for (const charState of state.characterStates.values()) {
      if (charState.conditions && charState.conditions.length > 0) {
        return true;
      }
    }
    return false;
  }

  private getCharacterName(state: GameState, instanceId: string): string {
    const charState = state.characterStates.get(instanceId);
    // Will be resolved via template in actual implementation
    return charState?.characterId || instanceId;
  }
}
```

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/application/context/providers/GameRulesProvider.ts
git commit -m "feat(application): add GameRulesProvider for D&D 5e context"
```

---

### Task 3.5: Create ConversationHistoryProvider

**Files:**
- Create: `src/application/context/providers/ConversationHistoryProvider.ts`

**Step 1: Write ConversationHistoryProvider.ts**

```typescript
// Application layer: Conversation history provider
// Provides recent conversation turns for context

import type { ContextBlock, ContextProvider } from '@/domain/llm/context.js';
import type { GameState } from '@/domain/game/GameState.js';
import type { IConversationHistory } from '@/domain/room/types.js';

export class ConversationHistoryProvider implements ContextProvider {
  name = 'conversation-history';
  priority = 400;

  constructor(
    private conversationHistory: IConversationHistory,
    private maxTurns: number = 5
  ) {}

  provide(state: GameState): ContextBlock | null {
    const recentTurns = this.conversationHistory.getRecent(this.maxTurns);

    if (recentTurns.length === 0) {
      return null;
    }

    // Format as conversation history
    const historyParts: string[] = [];

    for (const turn of recentTurns) {
      // Format all player actions
      const userMessages = turn.userInputs.map(action => {
        const name = action.characterName || action.username;
        return `[${name}] ${action.action}`;
      }).join('\n');

      if (userMessages) {
        historyParts.push(`User:\n${userMessages}`);
      }

      // Format assistant response
      if (turn.assistantResponse) {
        // Truncate very long responses to save tokens
        const response = this.truncateIfNeeded(turn.assistantResponse, 1000);
        historyParts.push(`Assistant:\n${response}`);
      }
    }

    return {
      name: this.name,
      content: `[CONVERSATION_HISTORY]\n${historyParts.join('\n\n')}\n[/CONVERSATION_HISTORY]`,
      priority: this.priority,
      metadata: {
        turnCount: recentTurns.length,
        totalCharacters: historyParts.join('').length,
      },
    };
  }

  private truncateIfNeeded(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    // Truncate at word boundary
    const truncated = text.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    const lastNewline = truncated.lastIndexOf('\n');
    const boundary = Math.max(lastSpace, lastNewline);

    return text.slice(0, boundary > 0 ? boundary : maxLength) + '...';
  }
}
```

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/application/context/providers/ConversationHistoryProvider.ts
git commit -m "feat(application): add ConversationHistoryProvider with truncation"
```

---

### Task 3.6: Create ModuleContextProvider

**Files:**
- Create: `src/application/context/providers/ModuleContextProvider.ts`

**Step 1: Write ModuleContextProvider.ts**

```typescript
// Application layer: Module context provider
// Provides module-specific rules and lore

import type { ContextBlock, ContextProvider } from '@/domain/llm/context.js';
import type { GameState } from '@/domain/game/GameState.js';

// Simple module repository interface (could be expanded)
interface ModuleRepository {
  findByName(name: string): Module | null;
}

interface Module {
  name: string;
  description: string;
  rules?: string;
  setting?: string;
  npcs?: string[];
  locations?: string[];
}

/**
 * Simple in-memory module repository
 * In production, this could load from database or files
 */
class InMemoryModuleRepository implements ModuleRepository {
  private modules: Map<string, Module> = new Map();

  constructor() {
    // Add a default module
    this.addModule({
      name: 'default',
      description: 'Standard D&D 5e fantasy setting',
      rules: '使用标准D&D 5e规则',
      setting: 'A generic fantasy world with dungeons, dragons, and adventure',
    });
  }

  addModule(module: Module): void {
    this.modules.set(module.name.toLowerCase(), module);
  }

  findByName(name: string): Module | null {
    return this.modules.get(name.toLowerCase()) || null;
  }
}

export class ModuleContextProvider implements ContextProvider {
  name = 'module-context';
  priority = 100;

  private moduleRepo: ModuleRepository;

  constructor() {
    this.moduleRepo = new InMemoryModuleRepository();
  }

  provide(state: GameState): ContextBlock | null {
    if (!state.moduleName) {
      return null;
    }

    const module = this.moduleRepo.findByName(state.moduleName);
    if (!module) {
      console.warn(`[ModuleContextProvider] Module not found: ${state.moduleName}`);
      return null;
    }

    const parts: string[] = [];

    parts.push(`**${module.name}**`);
    parts.push(module.description);

    if (module.setting) {
      parts.push(`\nSetting: ${module.setting}`);
    }

    if (module.rules) {
      parts.push(`\nRules: ${module.rules}`);
    }

    if (module.npcs && module.npcs.length > 0) {
      parts.push(`\nNotable NPCs: ${module.npcs.join(', ')}`);
    }

    if (module.locations && module.locations.length > 0) {
      parts.push(`\nLocations: ${module.locations.join(', ')}`);
    }

    return {
      name: this.name,
      content: `[MODULE_CONTEXT]\n${parts.join('\n')}\n[/MODULE_CONTEXT]`,
      priority: this.priority,
      metadata: {
        moduleName: module.name,
      },
    };
  }

  /**
   * Add a custom module (for testing or dynamic module loading)
   */
  addModule(module: Module): void {
    (this.moduleRepo as InMemoryModuleRepository).addModule(module);
  }
}
```

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/application/context/providers/ModuleContextProvider.ts
git commit -m "feat(application): add ModuleContextProvider with in-memory repo"
```

---

## Sprint 3 Complete: Context Management Checkpoint

**Verify:**

```bash
npm run typecheck
npm run build
```

**Expected:** Clean build

**Summary of Sprint 3:**
- ✅ ContextBuilder with provider pipeline
- ✅ SystemPromptProvider with fallback
- ✅ CharacterProfileProvider
- ✅ GameRulesProvider for D&D 5e
- ✅ ConversationHistoryProvider
- ✅ ModuleContextProvider

**Next Sprint:** Game Engine Implementation

---

## Sprint 4: Game Engine (Core)

### Task 4.1: Create D20GameEngine Base

**Files:**
- Create: `src/application/game/GameEngine.ts`

**Step 1: Create directory**

```bash
mkdir -p src/application/game
```

**Step 2: Write GameEngine.ts (base structure)**

```typescript
// Application layer: D&D 5e game engine implementation
// Handles dice rolling, ability checks, combat mechanics

import type {
  GameEngine as IGameEngine,
  Ability,
  RollType,
  DamageType,
  Weapon,
  DiceRoll,
  AbilityCheckResult,
  SavingThrowResult,
  AttackResult,
  DamageResult,
  CharacterState,
  Condition,
} from '@/domain/game/types.js';
import type { DiceRoller } from '@/infrastructure/game/DiceRoller.js';
import type { CharacterRepository } from '@/infrastructure/database/lowdb/CharacterRepository.js';
import { parseDiceFormula } from '@/utils/dice.js';
import { getAbilityModifier, getProficiencyBonus } from '@/domain/game/dnd5e/abilities.js';
import { CLASS_SAVING_THROWS } from '@/domain/game/dnd5e/rules.js';

export class D20GameEngine implements IGameEngine {
  private characterStates: Map<string, CharacterState> = new Map();
  private characterTemplates: Map<string, any> = new Map();

  constructor(
    private diceRoller: DiceRoller,
    private characterRepo: CharacterRepository
  ) {}

  // ========== Dice Rolling ==========

  roll(formula: string): DiceRoll {
    const parsed = parseDiceFormula(formula);
    const rolls = Array.from({ length: parsed.count }, () =>
      this.diceRoller.roll(parsed.sides)
    );
    const total = rolls.reduce((a, b) => a + b, 0) + parsed.modifier;

    return {
      formula,
      rolls,
      modifier: parsed.modifier,
      total,
      reason: `Rolled ${formula}`,
    };
  }

  rollDamage(dice: string, modifier: number): DiceRoll {
    const result = this.roll(dice);
    result.modifier = modifier;
    result.total = result.rolls.reduce((a, b) => a + b, 0) + modifier;
    result.reason = `Damage roll: ${dice}+${modifier}`;
    return result;
  }

  // ========== State Management ==========

  getCharacterState(characterId: string): CharacterState | null {
    return this.characterStates.get(characterId) || null;
  }

  updateCharacterState(characterId: string, updates: Partial<CharacterState>): void {
    const state = this.characterStates.get(characterId);
    if (!state) {
      throw new Error(`Character state not found: ${characterId}`);
    }

    Object.assign(state, updates);
  }

  initializeCharacterState(templateId: string): CharacterState {
    const template = this.characterRepo.findById(templateId);
    if (!template) {
      throw new Error(`Character template not found: ${templateId}`);
    }

    // Cache template for quick access
    this.characterTemplates.set(templateId, template);

    const instanceId = `${templateId}-${Date.now()}`;
    const state: CharacterState = {
      instanceId,
      characterId: templateId,
      currentHp: template.currentHp,
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

    this.characterStates.set(instanceId, state);
    return state;
  }

  private parseSpellSlots(template: any): any[] {
    // Parse spell slots from template
    const slots: any[] = [];
    const spellSlotsData = template.spellSlots || {};

    try {
      const parsed = typeof spellSlotsData === 'string'
        ? JSON.parse(spellSlotsData)
        : spellSlotsData;

      for (const [level, count] of Object.entries(parsed)) {
        if (typeof count === 'number' && count > 0) {
          slots.push({
            level: parseInt(level),
            slots: count,
            used: 0,
          });
        }
      }
    } catch (e) {
      console.warn('[GameEngine] Failed to parse spell slots:', e);
    }

    return slots;
  }

  // ========== Conditions ==========

  applyCondition(targetId: string, condition: Condition): void {
    const state = this.characterStates.get(targetId);
    if (!state) {
      throw new Error(`Character state not found: ${targetId}`);
    }

    // Check for duplicate conditions
    const exists = state.conditions.find(c => c.name === condition.name);
    if (exists) {
      return; // Don't apply duplicate
    }

    state.conditions.push({
      ...condition,
      appliedAt: Date.now(),
    });
  }

  removeCondition(targetId: string, conditionName: string): void {
    const state = this.characterStates.get(targetId);
    if (!state) {
      throw new Error(`Character state not found: ${targetId}`);
    }

    state.conditions = state.conditions.filter(c => c.name !== conditionName);
  }

  // Continue in Task 4.2...
}
```

**Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS (may have some incomplete method warnings)

**Step 4: Commit**

```bash
git add src/application/game/GameEngine.ts
git commit -m "feat(application): add D20GameEngine base with dice rolling and state management"
```

---

### Task 4.2: Add Ability Checks to GameEngine

**Files:**
- Modify: `src/application/game/GameEngine.ts`

**Step 1: Add ability check methods**

Add to `D20GameEngine` class:

```typescript
  // ========== Ability Checks ==========

  abilityCheck(
    characterId: string,
    ability: Ability,
    rollType: RollType = 'normal'
  ): AbilityCheckResult {
    const state = this.characterStates.get(characterId);
    if (!state) {
      throw new Error(`Character state not found: ${characterId}`);
    }

    const template = this.characterTemplates.get(state.characterId);
    if (!template) {
      throw new Error(`Character template not found: ${state.characterId}`);
    }

    // Get ability score
    const abilityScores = template.abilityScores || {};
    const abilityScore = abilityScores[ability] || 10;
    const modifier = getAbilityModifier(abilityScore);

    // Roll with advantage/disadvantage
    const d20 = this.roll('1d20');
    const roll = this.applyRollType(d20, rollType);

    const result: AbilityCheckResult = {
      characterId,
      ability,
      roll: {
        ...roll,
        modifier,
        reason: `${ability} check`,
      },
      abilityScore,
      modifier,
      rollType,
    };

    result.roll.total = result.roll.rolls[0] + modifier;

    return result;
  }

  savingThrow(
    characterId: string,
    ability: Ability,
    rollType: RollType = 'normal'
  ): SavingThrowResult {
    const check = this.abilityCheck(characterId, ability, rollType);

    // Check for saving throw proficiency
    const template = this.characterTemplates.get(
      this.characterStates.get(characterId)!.characterId
    );

    if (!template) {
      throw new Error(`Character template not found`);
    }

    const proficientSaves = CLASS_SAVING_THROWS[template.characterClass] || [];
    const isProficient = proficientSaves.includes(ability);

    let proficiency = 0;
    if (isProficient) {
      proficiency = getProficiencyBonus(template.level);
      check.roll.total += proficiency;
    }

    return {
      ...check,
      type: 'saving-throw',
      proficiency,
    };
  }

  private applyRollType(roll: DiceRoll, rollType: RollType): DiceRoll {
    if (rollType === 'normal') {
      return roll;
    }

    // Roll second die (match original formula)
    const { sides } = parseDiceFormula(roll.formula);
    const secondRoll = this.roll(`1d${sides}`);

    if (rollType === 'advantage') {
      return roll.total >= secondRoll.total ? roll : secondRoll;
    } else {
      // disadvantage
      return roll.total <= secondRoll.total ? roll : secondRoll;
    }
  }
```

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/application/game/GameEngine.ts
git commit -m "feat(game): add ability checks and saving throws with advantage/disadvantage"
```

---

### Task 4.3: Add Combat Methods to GameEngine

**Files:**
- Modify: `src/application/game/GameEngine.ts`

**Step 1: Add combat methods**

Add to `D20GameEngine` class:

```typescript
  // ========== Combat ==========

  attackRoll(
    attackerId: string,
    weapon: Weapon,
    rollType: RollType = 'normal'
  ): AttackResult {
    const state = this.characterStates.get(attackerId);
    if (!state) {
      throw new Error(`Character state not found: ${attackerId}`);
    }

    const template = this.characterTemplates.get(state.characterId);
    if (!template) {
      throw new Error(`Character template not found: ${state.characterId}`);
    }

    // Determine ability for attack (STR or DEX)
    const ability = weapon.finesse
      ? (template.abilityScores?.dexterity || 10) >= (template.abilityScores?.strength || 10)
        ? 'dexterity'
        : 'strength'
      : 'strength';

    const abilityScore = template.abilityScores?.[ability] || 10;
    const abilityModifier = getAbilityModifier(abilityScore);
    const proficiency = getProficiencyBonus(template.level);

    // Roll attack
    const d20 = this.roll('1d20');
    const roll = this.applyRollType(d20, rollType);
    const total = roll.total + abilityModifier + proficiency;

    const result: AttackResult = {
      attackerId,
      weapon: weapon.name,
      roll: {
        ...roll,
        total,
        modifier: abilityModifier + proficiency,
        reason: `Attack with ${weapon.name}`,
      },
      ability,
      proficiency,
      isCritical: roll.rolls[0] === 20,
    };

    return result;
  }

  applyDamage(
    targetId: string,
    damage: number,
    damageType: DamageType
  ): DamageResult {
    const state = this.characterStates.get(targetId);
    if (!state) {
      throw new Error(`Character state not found: ${targetId}`);
    }

    const template = this.characterTemplates.get(state.characterId);
    if (!template) {
      throw new Error(`Character template not found: ${state.characterId}`);
    }

    // Validate damage
    if (damage < 0) {
      throw new Error(`Damage cannot be negative: ${damage}`);
    }

    // Check for resistance/immunity
    let finalDamage = damage;
    let resisted = false;
    let immune = false;

    // TODO: Implement proper resistance/immunity checking
    // For now, just apply damage directly

    // Apply temporary HP first
    if (state.temporaryHp > 0) {
      if (state.temporaryHp >= finalDamage) {
        state.temporaryHp -= finalDamage;
        finalDamage = 0;
      } else {
        finalDamage -= state.temporaryHp;
        state.temporaryHp = 0;
      }
    }

    // Apply damage to HP
    state.currentHp = Math.max(0, state.currentHp - finalDamage);

    // Check for death/unconscious
    let status: 'conscious' | 'unconscious' | 'dead' = 'conscious';
    if (state.currentHp === 0) {
      status = 'unconscious';
      state.conditions.push({
        name: 'unconscious',
        source: 'damage',
        appliedAt: Date.now(),
      });
    }

    const result: DamageResult = {
      targetId,
      damage,
      damageType,
      finalDamage,
      resisted,
      immune,
      remainingHp: state.currentHp,
      status,
    };

    return result;
  }
```

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/application/game/GameEngine.ts
git commit -m "feat(game): add combat methods (attack rolls, damage application)"
```

---

## Sprint 4 Complete: Game Engine Checkpoint

**Verify:**

```bash
npm run typecheck
npm run build
```

**Expected:** Clean build

**Summary of Sprint 4:**
- ✅ D20GameEngine base with dice rolling
- ✅ Ability checks with advantage/disadvantage
- ✅ Saving throws with proficiency
- ✅ Attack rolls with weapon stats
- ✅ Damage application with temp HP

**Next Sprint:** GameStateManager & Persistence (or proceed to integration tasks)

---

## Sprint 5: GameStateManager & Persistence

### Task 5.1: Add GameStateManager (application layer)

**Files:**
- Create: `src/application/game/GameStateManager.ts`

**Step 1: Write GameStateManager.ts**

```typescript
// Application layer: GameStateManager
// Handles save/load orchestration for GameState

import type { GameState } from '@/domain/game/GameState.js';
import type { GameStateRepository } from '@/infrastructure/database/lowdb/GameStateRepository.js';
import type { RoomRepository } from '@/infrastructure/database/lowdb/RoomRepository.js';

export interface SaveResult {
  slotName: string;
  description?: string;
  savedAt: number;
}

export interface LoadResult {
  slotName: string;
  state: GameState;
  loadedAt: number;
}

export class GameStateManager {
  constructor(
    private gameStateRepo: GameStateRepository,
    private roomRepo: RoomRepository
  ) {}

  async save(roomId: string, state: GameState, slotName = 'autosave', description?: string): Promise<SaveResult> {
    await this.gameStateRepo.saveState(roomId, slotName, state);
    await this.roomRepo.upsertSaveSlot(roomId, slotName, description, slotName === 'autosave');
    return { slotName, description, savedAt: Date.now() };
  }

  async load(roomId: string, slotName: string): Promise<LoadResult | null> {
    const state = await this.gameStateRepo.loadState(roomId, slotName);
    if (!state) return null;
    return { slotName, state, loadedAt: Date.now() };
  }

  async listSlots(roomId: string) {
    return this.roomRepo.listSaveSlots(roomId);
  }

  async deleteSlot(roomId: string, slotName: string): Promise<void> {
    await this.gameStateRepo.deleteState(roomId, slotName);
    await this.roomRepo.deleteSaveSlotByName(roomId, slotName);
  }
}
```

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/application/game/GameStateManager.ts
git commit -m "feat(application): add GameStateManager for save/load"
```

---

### Task 5.2: Extend RoomRepository save slot helpers

**Files:**
- Modify: `src/infrastructure/database/lowdb/RoomRepository.ts`

**Step 1: Add upsert and delete-by-name helpers**

```typescript
  async upsertSaveSlot(roomId: string, saveName: string, description?: string, isAutoSave = false): Promise<void> {
    const data = this.db.getData();
    const existing = data.saveSlots.find((s) => s.room_id === roomId && s.save_name === saveName);

    if (existing) {
      existing.description = description ?? existing.description;
      existing.is_auto_save = isAutoSave ? 1 : existing.is_auto_save;
      existing.created_at = existing.created_at || new Date().toISOString();
      await this.db.write();
      return;
    }

    await this.createSaveSlot(roomId, saveName, description, isAutoSave);
  }

  async deleteSaveSlotByName(roomId: string, saveName: string): Promise<boolean> {
    const data = this.db.getData();
    const before = data.saveSlots.length;
    data.saveSlots = data.saveSlots.filter((s) => !(s.room_id === roomId && s.save_name === saveName));
    await this.db.write();
    return data.saveSlots.length !== before;
  }
```

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/infrastructure/database/lowdb/RoomRepository.ts
git commit -m "feat(database): add save slot upsert helpers"
```

---

### Task 5.3: Save/Load API routes (HTMX + JSON)

**Files:**
- Create: `src/api/routes/saves.ts`
- Modify: `src/api/app.ts`
- Create: `views/partials/save-menu.pug`

**Step 1: Add saves router**

Endpoints:
- `GET /api/saves/rooms/:roomId` -> list slots
- `POST /api/saves/rooms/:roomId/save` -> save
- `POST /api/saves/rooms/:roomId/load` -> load
- `DELETE /api/saves/rooms/:roomId/:slotName` -> delete

Use the room instance to access `gameStateManager` once integrated in Sprint 7; for now, wire the route to return 501 with a TODO marker if the manager is not available.

**Step 2: Mount the router**

Add to `src/api/app.ts`:

```typescript
import saveRoutes from './routes/saves.js';
app.use('/api/saves', saveRoutes);
```

**Step 3: Add HTMX partial for save menu**

Create `views/partials/save-menu.pug` with a minimal list + buttons and HTMX hooks for save/load.

**Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/api/routes/saves.ts src/api/app.ts views/partials/save-menu.pug
git commit -m "feat(api): add save/load endpoints and UI partial"
```

---

## Sprint 6: Message Rendering & Frontend Fixes

### Task 6.1: MessageRenderer (server-side)

**Files:**
- Create: `src/application/messages/MessageRenderer.ts`

**Step 1: Implement MessageRenderer**

```typescript
import { parseMarkdown, escapeHtml } from '@/utils/markdown.js';
import type { GameMessage } from '@/domain/messages/types.js';

export class MessageRenderer {
  renderMessageHtml(message: GameMessage): string {
    const content = message.role === 'user'
      ? escapeHtml(message.content).replace(/\n/g, '<br>')
      : parseMarkdown(message.content);
    return content;
  }

  renderStreamingChunk(chunk: string): string {
    return escapeHtml(chunk).replace(/\n/g, '<br>');
  }

  finalizeStreamingContent(content: string): string {
    return parseMarkdown(content);
  }
}
```

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/application/messages/MessageRenderer.ts
git commit -m "feat(application): add MessageRenderer for markdown output"
```

---

### Task 6.2: Markdown rendering API for streaming completion

**Files:**
- Create: `src/api/routes/messages.ts`
- Modify: `src/api/app.ts`

**Step 1: Add POST /api/messages/markdown**

Request body: `{ content: string }`
Response: `{ html: string }`

Use `MessageRenderer.finalizeStreamingContent` for conversion.

**Step 2: Mount the router**

```typescript
import messageRoutes from './routes/messages.js';
app.use('/api/messages', messageRoutes);
```

**Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/api/routes/messages.ts src/api/app.ts
git commit -m "feat(api): add markdown rendering endpoint"
```

---

### Task 6.3: Fix duplicate message bug in room actions

**Files:**
- Modify: `src/api/routes/rooms.ts`

**Step 1: Only render the new action OR the DM container**

When `hasAllActed` is true, return only the DM placeholder and avoid re-rendering all user actions (prevents duplicates with `hx-swap="beforeend"`).

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

---

### Task 6.4: Update streaming.js to finalize markdown

**Files:**
- Modify: `public/js/streaming.js`

**Step 1: On streaming-complete, call markdown endpoint**

```javascript
const response = await fetch('/api/messages/markdown', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: data.content }),
});
const { html } = await response.json();
targetElement.innerHTML = html;
```

**Step 2: Run typecheck**

No typecheck needed for JS; verify in browser.

---

## Sprint 7: Room Integration

### Task 7.1: Wire ContextBuilder + GameEngine + GameStateManager into Room

**Files:**
- Modify: `src/application/room/Room.ts`
- Modify: `src/application/room/RoomService.ts` (if still used)

**Step 1: Extend RoomDependencies**

Add:
- `contextBuilder: ContextBuilder`
- `gameEngine: GameEngine`
- `gameStateManager: GameStateManager`
- `messageRenderer: MessageRenderer`

**Step 2: Replace buildMessages/buildMessagesForCombinedActions**

Use `contextBuilder.build(gameState)` and append current user actions as the final user message.

**Step 3: Auto-save via GameStateManager**

After each turn, call `gameStateManager.save(roomId, gameState, 'autosave', ...)`.

---

### Task 7.2: Instantiate new dependencies in API routes

**Files:**
- Modify: `src/api/routes/rooms.ts`
- Modify: `src/api/routes/web.ts`

**Step 1: Use Room (not RoomService) for consistency**

Switch `rooms.ts` to create `Room` and pass full dependencies (repos, context builder, game engine, renderer, gameStateManager).

**Step 2: Update ensureRoom() to include new dependencies**

Use `DatabaseService` repositories and the new `GameStateManager`.

---

### Task 7.3: Add context debug endpoint

**Files:**
- Modify: `src/api/routes/rooms.ts`

Add `GET /api/rooms/:roomId/context-debug` to return `contextBuilder.getContextSnapshot()` and the built messages.

---

## Sprint 8: Testing

### Task 8.1: ContextBuilder tests

**Files:**
- Create: `test/application/context/ContextBuilder.test.ts`

Use `node:test` and `assert` to validate provider ordering and error handling.

### Task 8.2: GameEngine tests

**Files:**
- Create: `test/application/game/GameEngine.test.ts`

Use `FixedDiceRoller` to assert advantage/disadvantage and damage logic.

### Task 8.3: MessageRenderer tests

**Files:**
- Create: `test/application/messages/MessageRenderer.test.ts`

Validate markdown parsing and user escaping.

### Task 8.4: Run tests

```bash
node --test --import tsx
```

---

## Sprint 9: Error Handling

### Task 9.1: Add custom error types

**Files:**
- Create: `src/utils/errors.ts`

Include `GameEngineError`, `ContextBuildError`, `SaveLoadError` with `code` + `statusCode`.

### Task 9.2: Integrate in error handler

**Files:**
- Modify: `src/api/middleware/errorHandler.ts`

If error has `statusCode`/`code`, pass through; otherwise map to `INTERNAL_ERROR`.

---

## Sprint 10: Documentation & Cleanup

### Task 10.1: Update docs

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Add: `docs/migrations/2026-02-09-game-state.md`

Document save/load endpoints, new routes, and data migration notes for `gameStates`/`saveSlots`.

---

## Execution Notes

**For Implementer:**
1. Work through tasks sequentially
2. Run `npm run typecheck` after each commit
3. Run tests frequently: `node --test --import tsx`
4. Commit frequently with descriptive messages
5. If stuck on a task, skip to next and come back
6. Reference design doc: `docs/plans/2026-02-09-game-engine-and-context-design.md`

**Troubleshooting:**
- Type errors: Check import paths use `.js` extension
- Build errors: Run `npm run clean && npm run build`
- Database errors: Ensure data directory exists
- Test failures: Check mocks are properly configured

**Next Steps After Implementation:**
1. Manual testing: `npm run dev` and test in browser
2. Integration testing with real game sessions
3. Performance profiling for context building
4. Token usage monitoring
5. User acceptance testing
