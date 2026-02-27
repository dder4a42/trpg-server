// API layer: Character routes
// CRUD operations for characters with persistent storage

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/api/middleware/errorHandler.js';
import { Character } from '@/infrastructure/character/Character.js';
import type { CharacterData } from '@/domain/character/types.js';
import { DatabaseService } from '@/infrastructure/database/DatabaseService.js';

const router = Router();

// Helper to get character repository
function getCharacterRepo() {
  return DatabaseService.getInstance().characters;
}

// ========== Schemas ==========

// Default ability scores
const DEFAULT_ABILITY_SCORES = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
} as const;

const AbilityScoresSchema = z.object({
  strength: z.coerce.number().int().min(1).max(30).default(10),
  dexterity: z.coerce.number().int().min(1).max(30).default(10),
  constitution: z.coerce.number().int().min(1).max(30).default(10),
  intelligence: z.coerce.number().int().min(1).max(30).default(10),
  wisdom: z.coerce.number().int().min(1).max(30).default(10),
  charisma: z.coerce.number().int().min(1).max(30).default(10),
}) as unknown as z.ZodType<NonNullable<CharacterData['abilityScores']>>;

const CreateCharacterSchema = z.object({
  name: z.string().min(1).max(100),
  race: z.string().min(1).max(50).default('human'),
  characterClass: z.enum([
    'BARBARIAN', 'BARD', 'CLERIC', 'DRUID', 'FIGHTER',
    'MONK', 'PALADIN', 'RANGER', 'ROGUE', 'SORCERER',
    'WARLOCK', 'WIZARD'
  ] as const).default('FIGHTER'),
  level: z.coerce.number().int().min(1).max(20).default(1),
  background: z.string().max(100).default(''),
  alignment: z.string().max(50).default('neutral'),
  abilityScores: AbilityScoresSchema.default(DEFAULT_ABILITY_SCORES).optional(),
  maxHp: z.coerce.number().int().min(1).optional(),
  appearance: z.string().max(2000).default(''),
  personalityTraits: z.string().max(1000).default(''),
  backstory: z.string().max(5000).default(''),
});

const UpdateCharacterSchema = CreateCharacterSchema.partial();

// ========== Routes ==========

// List current user's characters
router.get(
  '/my',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) {
      throw createError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const repo = getCharacterRepo();
    const result = repo.list({ userId, limit: 100 });

    res.json({
      success: true,
      count: result.total,
      characters: result.characters,
    });
  })
);

// List all characters
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const repo = getCharacterRepo();
    const result = repo.list({ limit: 100 });

    res.json({
      success: true,
      count: result.total,
      characters: result.characters,
    });
  })
);

// Get character by ID
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const repo = getCharacterRepo();
    const character = repo.findById(id);

    if (!character) {
      throw createError('Character not found', 404, 'CHARACTER_NOT_FOUND');
    }

    res.json({
      success: true,
      character,
    });
  })
);

// Create character
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) {
      throw createError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const data = CreateCharacterSchema.parse(req.body);

    // Use provided ability scores or defaults
    const abilityScores = data.abilityScores ?? DEFAULT_ABILITY_SCORES;

    // Calculate HP if not provided
    const constitutionMod = Math.floor((abilityScores.constitution - 10) / 2);
    const maxHp = data.maxHp ?? (8 + constitutionMod);

    // Build CharacterData with defaults
    const characterData: CharacterData = {
      userId,
      name: data.name,
      race: data.race,
      characterClass: data.characterClass,
      level: data.level,
      background: data.background,
      alignment: data.alignment,
      abilityScores,
      maxHp,
      currentHp: maxHp,
      tempHp: 0,
      armorClass: 10 + Math.floor((abilityScores.dexterity - 10) / 2),
      initiative: 0,
      speed: 30,
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      isDead: false,
      isStable: false,
      skillProficiencies: [],
      savingThrowProficiencies: [],
      toolProficiencies: [],
      languageProficiencies: [],
      gold: 0,
      inventory: [],
      equippedWeapon: '',
      equippedArmor: '',
      spellSlots: {},
      currentSpellSlots: {},
      knownSpells: [],
      preparedSpells: [],
      statusEffects: [],
      exhaustionLevel: 0,
      appearance: data.appearance,
      personalityTraits: data.personalityTraits,
      backstory: data.backstory,
      position: 'origin',
      stage: '',
      thoughts: '',
    };

    const repo = getCharacterRepo();
    const id = await repo.create(characterData);

    // Log character creation
    console.log(`[Character Created] ID: ${id}, Name: ${data.name}, Race: ${data.race}, Class: ${data.characterClass}, Level: ${data.level}`);

    res.status(204).send();
  })
);

// Update character
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = UpdateCharacterSchema.parse(req.body);

    const repo = getCharacterRepo();
    const existing = repo.findById(id);
    if (!existing) {
      throw createError('Character not found', 404, 'CHARACTER_NOT_FOUND');
    }

    // Build partial update data
    const partialUpdate: Partial<CharacterData> = {};

    if (updates.name !== undefined) partialUpdate.name = updates.name;
    if (updates.race !== undefined) partialUpdate.race = updates.race;
    if (updates.characterClass !== undefined) partialUpdate.characterClass = updates.characterClass;
    if (updates.level !== undefined) partialUpdate.level = updates.level;
    if (updates.background !== undefined) partialUpdate.background = updates.background;
    if (updates.alignment !== undefined) partialUpdate.alignment = updates.alignment;
    if (updates.abilityScores !== undefined) partialUpdate.abilityScores = updates.abilityScores;
    if (updates.appearance !== undefined) partialUpdate.appearance = updates.appearance;
    if (updates.personalityTraits !== undefined) partialUpdate.personalityTraits = updates.personalityTraits;
    if (updates.backstory !== undefined) partialUpdate.backstory = updates.backstory;

    const success = await repo.update(id, partialUpdate);

    res.json({
      success,
      character: repo.findById(id),
    });
  })
);

// Delete character
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const repo = getCharacterRepo();

    const character = repo.findById(id);
    if (!character) {
      throw createError('Character not found', 404, 'CHARACTER_NOT_FOUND');
    }

    // Log deletion before removing
    console.log(`[Character Deleted] ID: ${id}, Name: ${character.name}`);

    await repo.delete(id);

    res.status(204).send();
  })
);

// Get character prompt profile (for debugging/LLM)
router.get(
  '/:id/prompt',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const repo = getCharacterRepo();
    const characterData = repo.findById(id);

    if (!characterData) {
      throw createError('Character not found', 404, 'CHARACTER_NOT_FOUND');
    }

    const character = new Character(characterData);
    const promptProfile = character.toPromptProfile();

    res.json({
      success: true,
      promptProfile,
    });
  })
);

export default router;
