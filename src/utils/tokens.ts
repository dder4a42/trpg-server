// Utilities: Token estimation for LLM context
// Rough estimation since we don't have tiktoken on backend

/**
 * Estimate token count for text
 * Rough estimate: ~4 characters per token for English text
 * Will be less accurate for Chinese text
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;

  return Math.ceil(chineseChars / 2 + otherChars / 4);
}

/**
 * Estimate token count for an array of messages
 */
export function estimateMessagesTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
}

/**
 * Check if content is within token limit
 */
export function isWithinTokenLimit(content: string, limit: number): boolean {
  return estimateTokens(content) <= limit;
}
