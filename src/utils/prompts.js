// Utilities: Prompt management
// Pure functions for loading and building prompts
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, extname } from 'path';
import { CharacterClassLabels } from '@/domain/character/types.js';
// Default prompt directory
const DEFAULT_PROMPT_DIR = './data/prompts';
// Cache for loaded prompts
const promptCache = new Map();
/**
 * Get the prompt directory path
 */
export function getPromptDir() {
    return resolve(process.env.PROMPT_DIR || DEFAULT_PROMPT_DIR);
}
/**
 * List all available prompt names
 */
export function listPrompts() {
    const dir = getPromptDir();
    if (!existsSync(dir))
        return [];
    return readdirSync(dir)
        .filter((f) => ['.md', '.txt'].includes(extname(f)))
        .map((f) => f.replace(/\.(md|txt)$/, ''));
}
/**
 * Load a prompt by name
 * Tries .md first, then .txt
 */
export function loadPrompt(name, useCache = true) {
    // Check cache
    if (useCache && promptCache.has(name)) {
        return promptCache.get(name);
    }
    const dir = getPromptDir();
    const extensions = ['.md', '.txt'];
    for (const ext of extensions) {
        const path = resolve(dir, `${name}${ext}`);
        if (existsSync(path)) {
            const content = readFileSync(path, 'utf-8');
            if (useCache)
                promptCache.set(name, content);
            return content;
        }
    }
    throw new Error(`Prompt not found: "${name}". Tried: ${extensions
        .map((e) => `${name}${e}`)
        .join(', ')} in ${dir}`);
}
/**
 * Clear the prompt cache
 */
export function clearPromptCache() {
    promptCache.clear();
}
// ========== Prompt Building Utilities ==========
/**
 * Build a system block for prompts
 */
export function buildSystemBlock(title, body) {
    const trimmed = body?.trim();
    if (!trimmed)
        return '';
    return `[${title}]\n${trimmed}\n[/${title}]`;
}
/**
 * Build a user prompt with context
 */
export function buildUserPrompt(userInput, contextBlocks) {
    const parts = [
        ...contextBlocks.filter((b) => b?.trim()),
        `[USER_INPUT]\n${userInput.trim()}\n[/USER_INPUT]`,
    ];
    return parts.join('\n\n');
}
// ========== Common Prompts ==========
/**
 * Default DM system prompt
 */
export function getDefaultDMSystemPrompt() {
    return `你是一个TRPG游戏主持人。你的职责是：
1. 根据玩家的行动推动故事发展
2. 描述场景和NPC反应
3. 在适当时机要求玩家进行检定
4. 保持故事的连贯性和趣味性

输出格式：
- 场景描述用第三人称
- NPC对话用引号
- 需要检定时使用 <check> 标签`;
}
/**
 * StatusBar update system prompt
 */
export function getStatusBarUpdatePrompt() {
    return `You are a game state manager. Update the status bar based on recent events.

Input: Recent transcript of game events
Output: YAML list of memory items

Format for each item:
SCOPE | TIME | LOCATION | CONTENT

SCOPE: LT (long-term) for world facts, lore, stable NPCs
       ST (short-term) for recent events, immediate goals

Example output:
- LT | Year 1024 | Forgotten Realms | The kingdom of Neverwinter is ruled by Lord Neverember
- ST | Evening | Trollskull Tavern | Players discovered a hidden door behind the bar`;
}
/**
 * Format CharacterData as a prompt profile for LLM context
 * This is a standalone version of Character.toPromptProfile() that works with plain data
 */
export function formatCharacterProfile(character) {
    const coreInfo = [
        `姓名：${character.name}`,
        `种族：${character.race} | 职业：${CharacterClassLabels[character.characterClass]} | 等级：${character.level}`,
        `阵营：${character.alignment}`,
        `生命值：${character.currentHp}/${character.maxHp} | AC：${character.armorClass}`,
    ];
    if (character.stage) {
        coreInfo.push(`当前状态：${character.stage}`);
    }
    if (character.thoughts) {
        coreInfo.push(`当前想法：${character.thoughts}`);
    }
    const traitsContext = [
        character.appearance && `【外貌】${character.appearance}`,
        character.backstory && `【背景故事】${character.backstory}`,
        character.personalityTraits && `【性格】${character.personalityTraits}`,
    ].filter((item) => Boolean(item));
    return [...coreInfo, '', ...traitsContext].join('\n');
}
/**
 * Format character profile as a tagged block for LLM messages
 */
export function buildCharacterProfileBlock(character) {
    return `[CHARACTER_PROFILE]\n${formatCharacterProfile(character)}\n[/CHARACTER_PROFILE]`;
}
