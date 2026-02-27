// Application layer: Status bar extractor
// Extracts status bar updates from LLM responses
/**
 * Extract status bar updates from LLM response
 */
export async function extractStatusBarUpdates(llmClient, userInputs, assistantResponse, statusBarManager) {
    const prompt = getStatusBarUpdatePrompt(userInputs, assistantResponse);
    try {
        const response = await llmClient.chat([
            { role: 'system', content: prompt },
            { role: 'user', content: assistantResponse }
        ]);
        const jsonContent = extractJsonFromResponse(response.content);
        if (!jsonContent)
            return;
        const raw = JSON.parse(jsonContent);
        const updates = normalizeStatusUpdates(raw);
        if (updates.length > 0) {
            applyStatusUpdates(updates, statusBarManager);
        }
    }
    catch (error) {
        console.error('Status bar extraction failed:', error);
    }
}
/**
 * Get prompt for status bar extraction
 */
function getStatusBarUpdatePrompt(userInputs, response) {
    return `As a TRPG assistant, summarize the current game world state updates into a JSON format.
Extract 1-3 most important short-term events (ST) and any long-term world facts (LT).
Also identify the current location and time if mentioned.

Format your response ONLY as a JSON array of objects:
[
  { "scope": "ST", "content": "Brief event description" },
  { "scope": "LT", "content": "Important world fact" },
  { "scope": "STATE", "time": "Current time", "location": "Current location" }
]

Guidelines:
- scope: "ST" for short-term (last 10 mins), "LT" for long-term (permanent), "STATE" for global flags
- content: One clear sentence
- ONLY output the JSON block, no other text.

Recent actions: ${userInputs.map(u => u.action).join('; ')}
`;
}
/**
 * Extract JSON content from LLM response
 */
function extractJsonFromResponse(response) {
    const jsonMatch = response.match(/\[[\s\S]*?\]/);
    return jsonMatch ? jsonMatch[0] : null;
}
function normalizeStatusUpdates(raw) {
    const list = unwrapPossibleList(raw);
    if (!Array.isArray(list)) {
        return [];
    }
    const out = [];
    for (const item of list) {
        const normalized = normalizeOne(item);
        if (normalized) {
            out.push(normalized);
        }
    }
    return out;
}
function unwrapPossibleList(raw) {
    if (Array.isArray(raw))
        return raw;
    if (raw && typeof raw === 'object') {
        const obj = raw;
        // Some models wrap the list under keys like 'for' or 'updates'
        if (Array.isArray(obj.for))
            return obj.for;
        if (Array.isArray(obj.updates))
            return obj.updates;
        if (Array.isArray(obj.items))
            return obj.items;
    }
    return raw;
}
function normalizeOne(item) {
    if (item && typeof item === 'object') {
        const obj = item;
        const scopeUpper = typeof obj.scope === 'string' ? obj.scope.toUpperCase() : '';
        // Support scope: ST, LT, STATE
        const scope = (scopeUpper === 'LT' || scopeUpper === 'ST' || scopeUpper === 'STATE')
            ? scopeUpper
            : null;
        const time = typeof obj.time === 'string' ? obj.time : undefined;
        const location = typeof obj.location === 'string' ? obj.location : undefined;
        const content = typeof obj.content === 'string' ? obj.content : '';
        // For STATE, we don't strictly need content, but for ST/LT we do
        if (!scope)
            return null;
        if ((scope === 'ST' || scope === 'LT') && !content)
            return null;
        return { scope, time, location, content };
    }
    return null;
}
function applyStatusUpdates(updates, statusBarManager) {
    for (const update of updates) {
        if (update.scope === 'ST') {
            statusBarManager.addShortTerm(update.content);
        }
        else if (update.scope === 'LT') {
            statusBarManager.addLongTerm(update.content);
        }
        // Also check for time/location in ST/LT updates if LLM provided them there
        if (update.location) {
            statusBarManager.setFlag('location', update.location);
        }
        if (update.time) {
            statusBarManager.setFlag('time', update.time);
        }
    }
}
