// Application layer: Message rendering
// Handles markdown and safe HTML output
import { parseMarkdown, escapeHtml } from '@/utils/markdown.js';
export class MessageRenderer {
    async renderMessageHtml(message) {
        const content = message.role === 'user'
            ? escapeHtml(message.content).replace(/\n/g, '<br>')
            : await parseMarkdown(message.content);
        return content;
    }
    renderStreamingChunk(chunk) {
        return escapeHtml(chunk).replace(/\n/g, '<br>');
    }
    async finalizeStreamingContent(content) {
        return await parseMarkdown(content);
    }
}
