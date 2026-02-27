// Application layer: Conversation history provider
// Provides recent conversation turns for context
export class ConversationHistoryProvider {
    conversationHistory;
    maxTurns;
    name = 'conversation-history';
    priority = 400;
    constructor(conversationHistory, maxTurns = 5) {
        this.conversationHistory = conversationHistory;
        this.maxTurns = maxTurns;
    }
    provide(_state) {
        const recentTurns = this.conversationHistory.getRecent(this.maxTurns);
        if (recentTurns.length === 0) {
            return null;
        }
        const historyParts = [];
        for (const turn of recentTurns) {
            const userMessages = turn.userInputs
                .map((action) => {
                const name = action.characterName || action.username;
                return `[${name}] ${action.action}`;
            })
                .join('\n');
            if (userMessages) {
                historyParts.push(`User:\n${userMessages}`);
            }
            if (turn.assistantResponse) {
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
    truncateIfNeeded(text, maxLength) {
        if (text.length <= maxLength) {
            return text;
        }
        const truncated = text.slice(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        const lastNewline = truncated.lastIndexOf('\n');
        const boundary = Math.max(lastSpace, lastNewline);
        return text.slice(0, boundary > 0 ? boundary : maxLength) + '...';
    }
}
