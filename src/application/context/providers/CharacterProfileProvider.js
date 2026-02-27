// Application layer: Character profile provider
// Provides character information for LLM context
export class CharacterProfileProvider {
    characterRepo;
    name = 'character-profiles';
    priority = 200;
    constructor(characterRepo) {
        this.characterRepo = characterRepo;
    }
    provide(state) {
        if (state.characterStates.size === 0) {
            return null;
        }
        const profiles = [];
        for (const [, charState] of state.characterStates) {
            const template = this.characterRepo.findById(charState.characterId);
            if (!template)
                continue;
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
    formatCharacter(template, state) {
        const parts = [];
        // Include character ID first so LLM knows what to use in tool calls
        parts.push(`ID: ${state.characterId}`);
        parts.push(`**${template.name}**`);
        parts.push(`Race: ${template.race} | Class: ${template.characterClass} | Level: ${template.level}`);
        const maxHp = template.maxHp || 1;
        const hpPercent = Math.round((state.currentHp / maxHp) * 100);
        parts.push(`HP: ${state.currentHp}/${maxHp} (${hpPercent}%) | AC: ${template.armorClass}`);
        const abilities = template.abilityScores || {};
        if (Object.keys(abilities).length > 0) {
            const abilityStr = Object.entries(abilities)
                .map(([key, value]) => `${key.slice(0, 3).toUpperCase()}:${value}`)
                .join(' ');
            parts.push(`Abilities: ${abilityStr}`);
        }
        if (state.conditions && state.conditions.length > 0) {
            const conditionNames = state.conditions.map((c) => c.name).join(', ');
            parts.push(`Conditions: ${conditionNames}`);
        }
        if (state.currentThoughts) {
            parts.push(`Current thoughts: ${state.currentThoughts}`);
        }
        if (template.personalityTraits) {
            parts.push(`Personality: ${template.personalityTraits}`);
        }
        return parts.join('\n');
    }
}
