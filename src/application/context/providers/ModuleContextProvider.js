// Application layer: Module context provider
// Provides module-specific rules and lore
class InMemoryModuleRepository {
    modules = new Map();
    constructor() {
        this.addModule({
            name: 'default',
            description: 'Standard D&D 5e fantasy setting',
            rules: 'Use standard D&D 5e rules',
            setting: 'A generic fantasy world with dungeons, dragons, and adventure',
        });
    }
    addModule(module) {
        this.modules.set(module.name.toLowerCase(), module);
    }
    findByName(name) {
        return this.modules.get(name.toLowerCase()) || null;
    }
}
export class ModuleContextProvider {
    name = 'module-context';
    priority = 100;
    moduleRepo;
    constructor() {
        this.moduleRepo = new InMemoryModuleRepository();
    }
    provide(state) {
        if (!state.moduleName) {
            return null;
        }
        const module = this.moduleRepo.findByName(state.moduleName);
        if (!module) {
            console.warn(`[ModuleContextProvider] Module not found: ${state.moduleName}`);
            return null;
        }
        const parts = [];
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
    addModule(module) {
        this.moduleRepo.addModule(module);
    }
}
