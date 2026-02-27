// Infrastructure layer: Dice rolling RNG implementation
// Implements testable dice rolling with injectable random number generator
/**
 * Standard random dice roller using Math.random()
 * Use in production
 */
export class RandomDiceRoller {
    roll(sides) {
        if (sides < 2) {
            throw new Error(`Dice must have at least 2 sides, got: ${sides}`);
        }
        if (sides > 1000) {
            throw new Error(`Dice cannot have more than 1000 sides, got: ${sides}`);
        }
        return Math.floor(Math.random() * sides) + 1;
    }
}
/**
 * Fixed dice roller for testing
 * Returns predetermined values from an array
 * Use in unit tests
 */
export class FixedDiceRoller {
    values;
    constructor(values) {
        this.values = [...values];
    }
    roll(sides) {
        const value = this.values.shift();
        if (value === undefined) {
            throw new Error('FixedDiceRoller: No more values available');
        }
        if (value < 1 || value > sides) {
            throw new Error(`FixedDiceRoller: Value ${value} out of range for ${sides}-sided die`);
        }
        return value;
    }
    /**
     * Check how many values remain
     */
    get remaining() {
        return this.values.length;
    }
}
/**
 * Seeded dice roller for reproducible rolls
 * Uses a simple Linear Congruential Generator
 * Use for testing when you need randomness but reproducibility
 */
export class SeededDiceRoller {
    state;
    constructor(seed = Date.now()) {
        this.state = seed;
    }
    roll(sides) {
        // LCG parameters from glibc
        this.state = (this.state * 1103515245 + 12345) & 0x7fffffff;
        return (this.state % sides) + 1;
    }
}
