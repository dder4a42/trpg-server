// Application layer: Status bar provider
// Provides the current world state summary (status bar) to the LLM context
export class StatusBarProvider {
    statusBarManager;
    name = 'status-bar';
    priority = 10; // High priority, usually after system prompt but before history
    constructor(statusBarManager) {
        this.statusBarManager = statusBarManager;
    }
    provide(_state) {
        const statusBar = this.statusBarManager.getStatusBar();
        const content = this.formatStatusBar(statusBar);
        if (!content)
            return null;
        return {
            name: this.name,
            content,
            priority: this.priority,
        };
    }
    formatStatusBar(statusBar) {
        const lines = ['[WORLD STATE]'];
        // Add flags (location, time, etc.)
        if (Object.keys(statusBar.flags).length > 0) {
            for (const [key, value] of Object.entries(statusBar.flags)) {
                lines.push(`${key.toUpperCase()}: ${value}`);
            }
        }
        // Add short term memory
        if (statusBar.shortTermMemory.length > 0) {
            lines.push('RECENT EVENTS:');
            statusBar.shortTermMemory.forEach((item) => lines.push(`- ${item}`));
        }
        // Add long term memory
        if (statusBar.longTermMemory.length > 0) {
            lines.push('WORLD FACTS:');
            statusBar.longTermMemory.forEach((item) => lines.push(`- ${item}`));
        }
        if (lines.length === 1)
            return ''; // Only header
        return lines.join('\n');
    }
}
