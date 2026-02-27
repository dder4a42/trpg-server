// Domain layer: Message types for game communication
// NO external dependencies - pure TypeScript
/**
 * Convert GameMessage to LLMMessage for LLM API
 */
export function toLLMMessage(message) {
    const llmMessage = {
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
export function toLLMMessages(messages) {
    return messages.map(toLLMMessage);
}
