// Application layer: ContextBuilder implementation
// Orchestrates context providers and builds LLM messages
import { estimateTokens } from '@/utils/tokens.js';
/**
 * Implementation of ContextBuilder
 * Chains providers and builds final LLM messages with observability
 */
export class ContextBuilder {
    providers = [];
    buildLog = [];
    errors = [];
    lastEstimatedTokens = 0;
    add(provider) {
        this.providers.push(provider);
        return this;
    }
    async build(state) {
        this.buildLog = [];
        this.errors = [];
        const sorted = [...this.providers].sort((a, b) => a.priority - b.priority);
        const blocks = [];
        for (const provider of sorted) {
            try {
                const result = provider.provide(state);
                if (result) {
                    const blocksToAdd = Array.isArray(result) ? result : [result];
                    blocks.push(...blocksToAdd);
                    this.buildLog.push({
                        provider: provider.name,
                        priority: provider.priority,
                        included: true,
                        blockCount: blocksToAdd.length,
                    });
                }
                else {
                    this.buildLog.push({
                        provider: provider.name,
                        priority: provider.priority,
                        included: false,
                        reason: 'Provider returned null',
                    });
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.errors.push({
                    provider: provider.name,
                    error: errorMessage,
                    cause: error,
                });
                console.error(`[ContextBuilder] Provider ${provider.name} failed:`, error);
                this.buildLog.push({
                    provider: provider.name,
                    priority: provider.priority,
                    included: false,
                    reason: `Error: ${errorMessage}`,
                });
            }
        }
        const criticalProviders = ['system-prompt', 'conversation-history'];
        const criticalFailure = this.errors.find((e) => criticalProviders.includes(e.provider));
        if (criticalFailure) {
            throw new Error(`Critical context provider failed: ${criticalFailure.provider}`);
        }
        this.lastEstimatedTokens = blocks.reduce((sum, block) => sum + estimateTokens(block.content), 0);
        return this.combineBlocksToMessages(blocks);
    }
    getContextSnapshot() {
        return {
            timestamp: new Date(),
            providers: this.providers.map((p) => ({
                name: p.name,
                priority: p.priority,
            })),
            buildLog: this.buildLog,
            errors: this.errors,
            estimatedTokens: this.estimateTotalTokens(),
        };
    }
    combineBlocksToMessages(blocks) {
        const messages = [];
        const systemBlocks = [];
        const contextBlocks = [];
        for (const block of blocks) {
            if (block.priority < 200) {
                systemBlocks.push(block);
            }
            else {
                contextBlocks.push(block);
            }
        }
        if (systemBlocks.length > 0) {
            const systemContent = systemBlocks.map((b) => b.content).join('\n\n');
            messages.push({
                role: 'system',
                content: systemContent,
            });
        }
        for (const block of contextBlocks) {
            messages.push({
                role: 'system',
                content: block.content,
                timestamp: Date.now(),
            });
        }
        return messages;
    }
    estimateTotalTokens() {
        return this.lastEstimatedTokens;
    }
}
