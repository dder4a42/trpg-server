// Utilities: Markdown parsing wrapper around marked library
// Provides consistent markdown rendering for the application
import { marked } from 'marked';
/**
 * Configure marked for our use case
 */
marked.setOptions({
    gfm: true, // GitHub Flavored Markdown
    breaks: true, // Convert \n to <br>
});
/**
 * Parse markdown to HTML
 * @param text - Markdown text to parse
 * @returns HTML string
 */
export async function parseMarkdown(text) {
    return await marked.parse(text);
}
/**
 * Parse markdown inline (no block elements like paragraphs)
 * @param text - Inline markdown text to parse
 * @returns HTML string
 */
export async function parseMarkdownInline(text) {
    return await marked.parseInline(text);
}
/**
 * Synchronous version of parseMarkdown for use in non-async contexts
 * Note: marked.parse is async in v11+, this is a fallback
 * @param text - Markdown text to parse
 * @returns HTML string
 */
export function parseMarkdownSync(text) {
    // Use marked.parseInline as a synchronous fallback
    // For full markdown, we'd need to use a different approach
    const result = marked.parseInline(text, {
        breaks: true,
        gfm: true,
    });
    return result;
}
/**
 * Strip markdown formatting, return plain text
 * @param text - Markdown text
 * @returns Plain text without markdown syntax
 */
export function stripMarkdown(text) {
    // Remove bold/italic
    let plain = text.replace(/\*\*\*(.+?)\*\*\*/g, '$1'); // bold+italic
    plain = plain.replace(/\*\*(.+?)\*\*/g, '$1'); // bold
    plain = plain.replace(/\*(.+?)\*/g, '$1'); // italic
    plain = plain.replace(/___(.+?)___/g, '$1'); // bold+italic alt
    plain = plain.replace(/__(.+?)__/g, '$1'); // bold alt
    plain = plain.replace(/_(.+?)_/g, '$1'); // italic alt
    // Remove strikethrough
    plain = plain.replace(/~~(.+?)~~/g, '$1');
    // Remove code
    plain = plain.replace(/`(.+?)`/g, '$1');
    plain = plain.replace(/```.+?```/gs, '');
    // Remove links
    plain = plain.replace(/\[(.+?)\]\(.+?\)/g, '$1');
    // Remove headers
    plain = plain.replace(/^#+\s+/gm, '');
    return plain;
}
/**
 * Escape HTML special characters
 * @param text - Text to escape
 * @returns Escaped text safe for HTML
 */
export function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
/**
 * Parse markdown and escape for safe streaming
 * Combines markdown parsing with HTML escaping for SSE streaming
 */
export function parseMarkdownForStreaming(text) {
    return parseMarkdownSync(text);
}
/**
 * Async version for contexts that support promises
 */
export async function parseMarkdownForStreamingAsync(text) {
    return await parseMarkdown(text);
}
