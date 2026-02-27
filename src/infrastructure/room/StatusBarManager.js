// Infrastructure: StatusBar management with limits
// Implements IStatusBarManager from domain
export class StatusBarManager {
    statusBar;
    limits;
    constructor(limits = {}) {
        this.statusBar = {
            longTermMemory: [],
            shortTermMemory: [],
            flags: {},
        };
        this.limits = {
            maxShortTerm: limits.maxShortTerm ?? 12,
            maxLongTerm: limits.maxLongTerm ?? 50,
        };
    }
    getStatusBar() {
        return { ...this.statusBar };
    }
    setStatusBar(statusBar) {
        this.statusBar = {
            longTermMemory: [...statusBar.longTermMemory],
            shortTermMemory: [...statusBar.shortTermMemory],
            flags: { ...statusBar.flags },
        };
    }
    addShortTerm(item) {
        const trimmed = item?.trim();
        if (!trimmed)
            return;
        this.statusBar.shortTermMemory.push(trimmed);
        this.trimIfNeeded();
    }
    addLongTerm(item) {
        const trimmed = item?.trim();
        if (!trimmed)
            return;
        this.statusBar.longTermMemory.push(trimmed);
        this.trimLongTerm();
    }
    setFlag(key, value) {
        if (!key?.trim())
            return;
        if (value === undefined || value === null) {
            delete this.statusBar.flags[key];
        }
        else {
            this.statusBar.flags[key] = String(value);
        }
    }
    getFlag(key) {
        return this.statusBar.flags[key];
    }
    removeFlag(key) {
        delete this.statusBar.flags[key];
    }
    trimIfNeeded() {
        // Check if short term needs promotion
        if (this.shortNeedsPromotion()) {
            const overflow = this.takeShortForPromotion();
            // Promote to long term (could also summarize with LLM)
            for (const item of overflow) {
                this.addLongTerm(item);
            }
        }
        this.trimLongTerm();
    }
    shortNeedsPromotion() {
        return this.statusBar.shortTermMemory.length > this.limits.maxShortTerm;
    }
    takeShortForPromotion() {
        const overflow = Math.max(0, this.statusBar.shortTermMemory.length - this.limits.maxShortTerm);
        if (overflow <= 0)
            return [];
        const chunk = this.statusBar.shortTermMemory.slice(0, overflow);
        this.statusBar.shortTermMemory =
            this.statusBar.shortTermMemory.slice(overflow);
        return chunk;
    }
    trimLongTerm() {
        if (this.statusBar.longTermMemory.length <= this.limits.maxLongTerm)
            return;
        const keepFrom = this.statusBar.longTermMemory.length - this.limits.maxLongTerm;
        this.statusBar.longTermMemory = this.statusBar.longTermMemory.slice(keepFrom);
    }
    toText() {
        const parts = ['[STATUS_BAR]'];
        if (Object.keys(this.statusBar.flags).length > 0) {
            parts.push('Flags:');
            for (const [k, v] of Object.entries(this.statusBar.flags)) {
                parts.push(`  ${k}: ${v}`);
            }
        }
        if (this.statusBar.longTermMemory.length > 0) {
            parts.push('Long-term:');
            for (const item of this.statusBar.longTermMemory) {
                parts.push(`  - ${item}`);
            }
        }
        if (this.statusBar.shortTermMemory.length > 0) {
            parts.push('Short-term:');
            for (const item of this.statusBar.shortTermMemory) {
                parts.push(`  - ${item}`);
            }
        }
        parts.push('[/STATUS_BAR]');
        return parts.join('\n');
    }
}
