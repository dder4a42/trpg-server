// Character Repository - LowDB implementation
// Handles character CRUD operations with JSON storage

import type { CharacterData, AbilityScores, CharacterClass } from '@/domain/character/types.js';
import type { DatabaseConnection } from './connection.js';
import { fuzzyMatch } from '@/utils/string.js';

export interface CharacterFilter {
  userId?: string;
  name?: string;
  characterClass?: CharacterClass;
  minLevel?: number;
  maxLevel?: number;
  race?: string;
  limit?: number;
  offset?: number;
}

export interface CharacterListResult {
  characters: CharacterData[];
  total: number;
  page: number;
  pageSize: number;
}

export class CharacterRepository {
  constructor(private db: DatabaseConnection) {}

  /**
   * Create a new character
   */
  async create(character: CharacterData): Promise<string> {
    const id = character.id || `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const record = {
      id,
      user_id: character.userId ?? null,
      name: character.name,
      race: character.race,
      character_class: character.characterClass,
      level: character.level,
      background: character.background ?? null,
      alignment: character.alignment ?? null,
      ability_scores: JSON.stringify(character.abilityScores),
      max_hp: character.maxHp,
      current_hp: character.currentHp,
      temp_hp: character.tempHp,
      armor_class: character.armorClass,
      initiative: character.initiative,
      speed: character.speed,
      death_save_successes: character.deathSaveSuccesses,
      death_save_failures: character.deathSaveFailures,
      is_dead: character.isDead ? 1 : 0,
      is_stable: character.isStable ? 1 : 0,
      skill_proficiencies: JSON.stringify(character.skillProficiencies),
      saving_throw_proficiencies: JSON.stringify(character.savingThrowProficiencies),
      tool_proficiencies: JSON.stringify(character.toolProficiencies),
      language_proficiencies: JSON.stringify(character.languageProficiencies),
      inventory: JSON.stringify(character.inventory),
      equipped_weapon: character.equippedWeapon ?? null,
      equipped_armor: character.equippedArmor ?? null,
      gold: character.gold,
      spell_slots: JSON.stringify(character.spellSlots),
      current_spell_slots: JSON.stringify(character.currentSpellSlots),
      known_spells: JSON.stringify(character.knownSpells),
      prepared_spells: JSON.stringify(character.preparedSpells),
      status_effects: JSON.stringify(character.statusEffects),
      exhaustion_level: character.exhaustionLevel,
      appearance: character.appearance ?? null,
      personality_traits: character.personalityTraits ?? null,
      backstory: character.backstory ?? null,
      position: character.position,
      stage: character.stage ?? null,
      thoughts: character.thoughts ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.db.getData().characters.push(record);
    await this.db.write();

    return id;
  }

  /**
   * Get character by ID
   */
  findById(id: string): CharacterData | null {
    const char = this.db.getData().characters.find((c) => c.id === id);
    return char ? this.rowToCharacter(char) : null;
  }

  /**
   * List characters with optional filtering
   */
  list(filter: CharacterFilter = {}): CharacterListResult {
    let chars = this.db.getData().characters;

    if (filter.userId !== undefined) {
      chars = chars.filter((c) => c.user_id === filter.userId);
    }

    if (filter.name) {
      const query = filter.name.toLowerCase();
      chars = chars.filter((c) => c.name.toLowerCase().includes(query));
    }

    if (filter.characterClass) {
      chars = chars.filter((c) => c.character_class === filter.characterClass);
    }

    if (filter.minLevel !== undefined) {
      chars = chars.filter((c) => c.level >= filter.minLevel!);
    }

    if (filter.maxLevel !== undefined) {
      chars = chars.filter((c) => c.level <= filter.maxLevel!);
    }

    if (filter.race) {
      chars = chars.filter((c) => c.race === filter.race);
    }

    const total = chars.length;
    const limit = filter.limit ?? 20;
    const offset = filter.offset ?? 0;

    chars = chars
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(offset, offset + limit);

    return {
      characters: chars.map((c) => this.rowToCharacter(c)),
      total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
    };
  }

  /**
   * Update character
   */
  async update(id: string, character: Partial<CharacterData>): Promise<boolean> {
    const data = this.db.getData();
    const idx = data.characters.findIndex((c) => c.id === id);
    if (idx === -1) return false;

    const existing = data.characters[idx];
    const updated = { ...existing };

    // Update fields if provided
    if (character.name !== undefined) updated.name = character.name;
    if (character.race !== undefined) updated.race = character.race;
    if (character.characterClass !== undefined)
      updated.character_class = character.characterClass;
    if (character.level !== undefined) updated.level = character.level;
    if (character.background !== undefined)
      updated.background = character.background ?? null;
    if (character.alignment !== undefined)
      updated.alignment = character.alignment ?? null;
    if (character.abilityScores !== undefined)
      updated.ability_scores = JSON.stringify(character.abilityScores);
    if (character.maxHp !== undefined) updated.max_hp = character.maxHp;
    if (character.currentHp !== undefined) updated.current_hp = character.currentHp;
    if (character.tempHp !== undefined) updated.temp_hp = character.tempHp;
    if (character.armorClass !== undefined)
      updated.armor_class = character.armorClass;
    if (character.initiative !== undefined)
      updated.initiative = character.initiative;
    if (character.speed !== undefined) updated.speed = character.speed;
    if (character.deathSaveSuccesses !== undefined)
      updated.death_save_successes = character.deathSaveSuccesses;
    if (character.deathSaveFailures !== undefined)
      updated.death_save_failures = character.deathSaveFailures;
    if (character.isDead !== undefined) updated.is_dead = character.isDead ? 1 : 0;
    if (character.isStable !== undefined)
      updated.is_stable = character.isStable ? 1 : 0;
    if (character.skillProficiencies !== undefined)
      updated.skill_proficiencies = JSON.stringify(character.skillProficiencies);
    if (character.savingThrowProficiencies !== undefined)
      updated.saving_throw_proficiencies = JSON.stringify(
        character.savingThrowProficiencies
      );
    if (character.toolProficiencies !== undefined)
      updated.tool_proficiencies = JSON.stringify(character.toolProficiencies);
    if (character.languageProficiencies !== undefined)
      updated.language_proficiencies = JSON.stringify(
        character.languageProficiencies
      );
    if (character.inventory !== undefined)
      updated.inventory = JSON.stringify(character.inventory);
    if (character.equippedWeapon !== undefined)
      updated.equipped_weapon = character.equippedWeapon ?? null;
    if (character.equippedArmor !== undefined)
      updated.equipped_armor = character.equippedArmor ?? null;
    if (character.gold !== undefined) updated.gold = character.gold;
    if (character.spellSlots !== undefined)
      updated.spell_slots = JSON.stringify(character.spellSlots);
    if (character.currentSpellSlots !== undefined)
      updated.current_spell_slots = JSON.stringify(character.currentSpellSlots);
    if (character.knownSpells !== undefined)
      updated.known_spells = JSON.stringify(character.knownSpells);
    if (character.preparedSpells !== undefined)
      updated.prepared_spells = JSON.stringify(character.preparedSpells);
    if (character.statusEffects !== undefined)
      updated.status_effects = JSON.stringify(character.statusEffects);
    if (character.exhaustionLevel !== undefined)
      updated.exhaustion_level = character.exhaustionLevel;
    if (character.appearance !== undefined)
      updated.appearance = character.appearance ?? null;
    if (character.personalityTraits !== undefined)
      updated.personality_traits = character.personalityTraits ?? null;
    if (character.backstory !== undefined)
      updated.backstory = character.backstory ?? null;
    if (character.position !== undefined)
      updated.position = character.position;
    if (character.stage !== undefined)
      updated.stage = character.stage ?? null;
    if (character.thoughts !== undefined)
      updated.thoughts = character.thoughts ?? null;

    updated.updated_at = new Date().toISOString();

    data.characters[idx] = updated;
    await this.db.write();
    return true;
  }

  /**
   * Delete character
   */
  async delete(id: string): Promise<boolean> {
    const data = this.db.getData();
    const idx = data.characters.findIndex((c) => c.id === id);
    if (idx === -1) return false;

    data.characters.splice(idx, 1);
    await this.db.write();
    return true;
  }

  /**
   * Search characters by name with fuzzy matching
   */
  searchByName(query: string, limit = 10): CharacterData[] {
    const allCharacters = this.list({ limit: 100 }).characters;
    const names = allCharacters.map((c) => c.name);
    const matchedNames = fuzzyMatch(query, names);

    const matched = allCharacters.filter((c) => matchedNames.includes(c.name));
    return matched.slice(0, limit);
  }

  /**
   * Convert database row to CharacterData
   */
  private rowToCharacter(row: any): CharacterData {
    return {
      id: row.id,
      userId: row.user_id ?? undefined,
      name: row.name,
      race: row.race,
      characterClass: row.character_class as CharacterClass,
      level: row.level,
      background: row.background ?? undefined,
      alignment: row.alignment ?? undefined,
      abilityScores: JSON.parse(row.ability_scores) as AbilityScores,
      maxHp: row.max_hp,
      currentHp: row.current_hp,
      tempHp: row.temp_hp,
      armorClass: row.armor_class,
      initiative: row.initiative,
      speed: row.speed,
      deathSaveSuccesses: row.death_save_successes,
      deathSaveFailures: row.death_save_failures,
      isDead: row.is_dead === 1,
      isStable: row.is_stable === 1,
      skillProficiencies: JSON.parse(row.skill_proficiencies),
      savingThrowProficiencies: JSON.parse(row.saving_throw_proficiencies),
      toolProficiencies: JSON.parse(row.tool_proficiencies),
      languageProficiencies: JSON.parse(row.language_proficiencies),
      inventory: JSON.parse(row.inventory),
      equippedWeapon: row.equipped_weapon ?? undefined,
      equippedArmor: row.equipped_armor ?? undefined,
      gold: row.gold,
      spellSlots: JSON.parse(row.spell_slots),
      currentSpellSlots: JSON.parse(row.current_spell_slots),
      knownSpells: JSON.parse(row.known_spells),
      preparedSpells: JSON.parse(row.prepared_spells),
      statusEffects: JSON.parse(row.status_effects),
      exhaustionLevel: row.exhaustion_level,
      appearance: row.appearance ?? undefined,
      personalityTraits: row.personality_traits ?? undefined,
      ideals: row.ideals ?? undefined,
      bonds: row.bonds ?? undefined,
      flaws: row.flaws ?? undefined,
      backstory: row.backstory ?? undefined,
      position: row.position,
      stage: row.stage ?? undefined,
      thoughts: row.thoughts ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } as CharacterData;
  }
}
