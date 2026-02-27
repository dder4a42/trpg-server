// Application layer: Message rendering
// Handles markdown and safe HTML output

import { parseMarkdownSync, parseMarkdown, escapeHtml } from '@/utils/markdown.js';
import type { GameMessage } from '@/domain/messages/types.js';

export class MessageRenderer {
  async renderMessageHtml(message: GameMessage): Promise<string> {
    const content = message.role === 'user'
      ? escapeHtml(message.content).replace(/\n/g, '<br>')
      : await parseMarkdown(message.content);
    return content;
  }

  renderStreamingChunk(chunk: string): string {
    return escapeHtml(chunk).replace(/\n/g, '<br>');
  }

  async finalizeStreamingContent(content: string): Promise<string> {
    return await parseMarkdown(content);
  }
}
