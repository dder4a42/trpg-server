// Application layer: Action manager
// Collects and manages player actions for a room
export class ActionManager {
    actions = [];
    addAction(action) {
        const existingIndex = this.actions.findIndex((a) => a.userId === action.userId);
        if (existingIndex >= 0) {
            this.actions[existingIndex] = action;
            return;
        }
        this.actions.push(action);
    }
    getActions() {
        return [...this.actions];
    }
    drainActions() {
        const current = [...this.actions];
        this.actions = [];
        return current;
    }
    hasAllActed(members, turnGate) {
        return turnGate.canAdvance(this.actions, members.length);
    }
}
