// Application layer: D&D 5e game engine implementation
// Handles dice rolling, ability checks, combat mechanics
import { parseDiceFormula } from '@/utils/dice.js';
import { getAbilityModifier, getProficiencyBonus } from '@/domain/game/dnd5e/abilities.js';
import { CLASS_SAVING_THROWS } from '@/domain/game/dnd5e/rules.js';
export class D20GameEngine {
    diceRoller;
    characterRepo;
    characterStates = new Map();
    characterTemplates = new Map();
    constructor(diceRoller, characterRepo) {
        this.diceRoller = diceRoller;
        this.characterRepo = characterRepo;
    }
    // ========== State Management ==========
    /**
     * Sync character states from external source (GameState)
     * Called to populate the characterStates Map from the room's game state
     */
    syncCharacterStates(characterStates) {
        for (const [id, state] of characterStates) {
            this.characterStates.set(id, state);
            // Also cache the template if not already loaded
            if (!this.characterTemplates.has(id)) {
                const template = this.characterRepo.findById(id);
                if (template) {
                    this.characterTemplates.set(id, template);
                }
            }
        }
    }
    // ========== Dice Rolling ==========
    roll(formula) {
        const parsed = parseDiceFormula(formula);
        const rolls = Array.from({ length: parsed.count }, () => this.diceRoller.roll(parsed.sides));
        const total = rolls.reduce((a, b) => a + b, 0) + parsed.modifier;
        return {
            formula,
            rolls,
            modifier: parsed.modifier,
            total,
            reason: `Rolled ${formula}`,
        };
    }
    rollDamage(dice, modifier) {
        const result = this.roll(dice);
        result.modifier = modifier;
        result.total = result.rolls.reduce((a, b) => a + b, 0) + modifier;
        result.reason = `Damage roll: ${dice}+${modifier}`;
        return result;
    }
    // ========== State Management ==========
    getCharacterState(characterId) {
        return this.characterStates.get(characterId) || null;
    }
    updateCharacterState(characterId, updates) {
        const state = this.characterStates.get(characterId);
        if (!state) {
            throw new Error(`Character state not found: ${characterId}`);
        }
        Object.assign(state, updates);
    }
    initializeCharacterState(templateId) {
        const template = this.characterRepo.findById(templateId);
        if (!template) {
            throw new Error(`Character template not found: ${templateId}`);
        }
        this.characterTemplates.set(templateId, template);
        const instanceId = `${templateId}-${Date.now()}`;
        const state = {
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
        this.characterStates.set(templateId, state);
        return state;
    }
    parseSpellSlots(template) {
        const slots = [];
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
        }
        catch (e) {
            console.warn('[GameEngine] Failed to parse spell slots:', e);
        }
        return slots;
    }
    // ========== Conditions ==========
    applyCondition(targetId, condition) {
        const state = this.characterStates.get(targetId);
        if (!state) {
            throw new Error(`Character state not found: ${targetId}`);
        }
        const exists = state.conditions.find((c) => c.name === condition.name);
        if (exists) {
            return;
        }
        state.conditions.push({
            ...condition,
            appliedAt: Date.now(),
        });
    }
    removeCondition(targetId, conditionName) {
        const state = this.characterStates.get(targetId);
        if (!state) {
            throw new Error(`Character state not found: ${targetId}`);
        }
        state.conditions = state.conditions.filter((c) => c.name !== conditionName);
    }
    // ========== Ability Checks ==========
    abilityCheck(characterId, ability, rollType = 'normal') {
        const state = this.characterStates.get(characterId);
        if (!state) {
            throw new Error(`Character state not found: ${characterId}`);
        }
        const template = this.characterTemplates.get(state.characterId);
        if (!template) {
            throw new Error(`Character template not found: ${state.characterId}`);
        }
        const abilityScores = template.abilityScores || {};
        const abilityScore = abilityScores[ability] || 10;
        const modifier = getAbilityModifier(abilityScore);
        const d20 = this.roll('1d20');
        const roll = this.applyRollType(d20, rollType);
        const result = {
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
    savingThrow(characterId, ability, rollType = 'normal') {
        const check = this.abilityCheck(characterId, ability, rollType);
        const template = this.characterTemplates.get(this.characterStates.get(characterId).characterId);
        if (!template) {
            throw new Error('Character template not found');
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
    applyRollType(roll, rollType) {
        if (rollType === 'normal') {
            return roll;
        }
        const { sides } = parseDiceFormula(roll.formula);
        const secondRoll = this.roll(`1d${sides}`);
        if (rollType === 'advantage') {
            return roll.total >= secondRoll.total ? roll : secondRoll;
        }
        return roll.total <= secondRoll.total ? roll : secondRoll;
    }
    // ========== Combat ==========
    attackRoll(attackerId, weapon, rollType = 'normal') {
        const state = this.characterStates.get(attackerId);
        if (!state) {
            throw new Error(`Character state not found: ${attackerId}`);
        }
        const template = this.characterTemplates.get(state.characterId);
        if (!template) {
            throw new Error(`Character template not found: ${state.characterId}`);
        }
        const ability = weapon.finesse
            ? (template.abilityScores?.dexterity || 10) >= (template.abilityScores?.strength || 10)
                ? 'dexterity'
                : 'strength'
            : 'strength';
        const abilityScore = template.abilityScores?.[ability] || 10;
        const abilityModifier = getAbilityModifier(abilityScore);
        const proficiency = getProficiencyBonus(template.level);
        const d20 = this.roll('1d20');
        const roll = this.applyRollType(d20, rollType);
        const total = roll.total + abilityModifier + proficiency;
        const result = {
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
    applyDamage(targetId, damage, damageType) {
        const state = this.characterStates.get(targetId);
        if (!state) {
            throw new Error(`Character state not found: ${targetId}`);
        }
        const template = this.characterTemplates.get(state.characterId);
        if (!template) {
            throw new Error(`Character template not found: ${state.characterId}`);
        }
        if (damage < 0) {
            throw new Error(`Damage cannot be negative: ${damage}`);
        }
        let finalDamage = damage;
        let resisted = false;
        let immune = false;
        // TODO: Implement proper resistance/immunity checking
        if (state.temporaryHp > 0) {
            if (state.temporaryHp >= finalDamage) {
                state.temporaryHp -= finalDamage;
                finalDamage = 0;
            }
            else {
                finalDamage -= state.temporaryHp;
                state.temporaryHp = 0;
            }
        }
        state.currentHp = Math.max(0, state.currentHp - finalDamage);
        let status = 'conscious';
        if (state.currentHp === 0) {
            status = 'unconscious';
            state.conditions.push({
                name: 'unconscious',
                source: 'damage',
                appliedAt: Date.now(),
            });
        }
        const result = {
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
}
