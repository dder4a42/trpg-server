// Utilities: Dice formula parsing
// Pure functions for parsing dice notation like "2d6+3", "d8", "4d10-1"
/**
 * Parse a dice formula into components
 * @param formula - Dice formula like "2d6+3", "d8", "4d10-1"
 * @returns Parsed formula with count, sides, and modifier
 * @throws Error if formula is invalid
 */
export function parseDiceFormula(formula) {
    // Trim and lowercase
    const trimmed = formula.trim().toLowerCase();
    // Match pattern: (count)d(sides)(modifier)
    // Examples: 2d6+3, d8, 4d10-1, 1d20
    const match = trimmed.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!match) {
        throw new Error(`Invalid dice formula: "${formula}"`);
    }
    const count = match[1] ? parseInt(match[1], 10) : 1;
    const sides = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;
    // Validate values
    if (count < 1 || count > 100) {
        throw new Error(`Dice count must be between 1 and 100, got: ${count}`);
    }
    if (sides < 2 || sides > 1000) {
        throw new Error(`Dice sides must be between 2 and 1000, got: ${sides}`);
    }
    if (modifier < -1000 || modifier > 1000) {
        throw new Error(`Modifier must be between -1000 and 1000, got: ${modifier}`);
    }
    return {
        count,
        sides,
        modifier,
        original: formula,
    };
}
/**
 * Format a dice roll result as human-readable string
 */
export function formatDiceRoll(rolls, modifier, total, formula) {
    const modStr = modifier >= 0 ? `+ ${modifier}` : `- ${Math.abs(modifier)}`;
    return `[${rolls.join(', ')}]${modifier !== 0 ? ` ${modStr}` : ''} = ${total}${formula ? ` (${formula})` : ''}`;
}
/**
 * Roll dice using a random number generator
 * @param sides - Number of sides on the die
 * @param rng - Random number generator (0-1), defaults to Math.random
 * @returns A single die roll result
 */
export function rollDie(sides, rng = Math.random) {
    return Math.floor(rng() * sides) + 1;
}
/**
 * Roll multiple dice
 * @param formula - Dice formula to roll
 * @param rng - Random number generator (0-1), defaults to Math.random
 * @returns Roll result with individual rolls and total
 */
export function rollDice(formula, rng = Math.random) {
    const parsed = parseDiceFormula(formula);
    const rolls = Array.from({ length: parsed.count }, () => rollDie(parsed.sides, rng));
    const total = rolls.reduce((a, b) => a + b, 0) + parsed.modifier;
    return {
        rolls,
        modifier: parsed.modifier,
        total,
    };
}
