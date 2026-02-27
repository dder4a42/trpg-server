// Application layer: Exploration state implementation
// Handles free-form play, dialogue, checks, social encounters
const MAX_TOOL_ROUNDS = 5;
/**
 * Tool definitions for exploration mode
 * These are passed to the LLM to enable function calling
 */
export const EXPLORATION_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'request_ability_check',
            description: '当玩家的行动需要能力检定时调用（如开锁、攀爬、说服、偷窃、感知等）',
            parameters: {
                type: 'object',
                properties: {
                    characterId: {
                        type: 'string',
                        description: '需要进行检定的角色ID',
                    },
                    ability: {
                        type: 'string',
                        enum: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
                        description: '检定使用的属性',
                    },
                    dc: {
                        type: 'number',
                        description: '难度等级(DC)，5=极易 10=简单 15=中等 20=困难 25=极难',
                    },
                    reason: {
                        type: 'string',
                        description: '检定原因的简短描述',
                    },
                    rollType: {
                        type: 'string',
                        enum: ['normal', 'advantage', 'disadvantage'],
                        description: '投骰方式，默认normal',
                    },
                },
                required: ['characterId', 'ability', 'dc', 'reason'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'request_saving_throw',
            description: '当角色需要进行豁免检定时调用（如闪避陷阱、抵抗毒素、对抗魔法等）',
            parameters: {
                type: 'object',
                properties: {
                    characterId: { type: 'string', description: '角色ID' },
                    ability: {
                        type: 'string',
                        enum: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
                        description: '豁免属性',
                    },
                    dc: { type: 'number', description: '难度等级' },
                    reason: { type: 'string', description: '豁免原因' },
                    rollType: {
                        type: 'string',
                        enum: ['normal', 'advantage', 'disadvantage'],
                        description: '投骰方式',
                    },
                },
                required: ['characterId', 'ability', 'dc', 'reason'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'request_group_check',
            description: '要求多个角色或全队进行同一检定（如全队感知检定、集体隐匿）',
            parameters: {
                type: 'object',
                properties: {
                    ability: {
                        type: 'string',
                        enum: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
                        description: '检定属性',
                    },
                    dc: { type: 'number', description: '难度等级' },
                    reason: { type: 'string', description: '检定原因' },
                    characterIds: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '指定角色ID列表。留空则全队检定',
                    },
                },
                required: ['ability', 'dc', 'reason'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'start_combat',
            description: '当遭遇敌对生物或冲突需要进入战斗时调用',
            parameters: {
                type: 'object',
                properties: {
                    reason: { type: 'string', description: '进入战斗的原因' },
                    enemies: {
                        type: 'array',
                        description: '敌方生物列表（预留，CombatState实现后使用）',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                count: { type: 'number' },
                            },
                        },
                    },
                },
                required: ['reason'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'restrict_action',
            description: '限制下一轮仅允许指定角色行动（如仅队长可与国王对话，仅盗贼可尝试潜行）。传空数组解除限制。',
            parameters: {
                type: 'object',
                properties: {
                    characterIds: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '允许行动的角色ID列表。空数组 = 解除限制，所有人可行动',
                    },
                    reason: { type: 'string', description: '限制原因' },
                },
                required: ['characterIds', 'reason'],
            },
        },
    },
];
/**
 * ExplorationState - Default game mode
 * Handles free-form play with tool calling for checks
 */
export class ExplorationState {
    name = 'exploration';
    async *processActions(actions, ctx) {
        // 1. Build LLM context
        const messages = await ctx.contextBuilder.build(ctx.gameState);
        messages.push({ role: 'user', content: this.formatActions(actions) });
        // 2. Tool calling loop
        let rounds = 0;
        while (rounds < MAX_TOOL_ROUNDS) {
            const response = await ctx.llmClient.chat(messages, {
                tools: EXPLORATION_TOOLS,
                toolChoice: 'auto',
            });
            // No tool calls → LLM produced narrative, we're done
            if (!response.toolCalls?.length) {
                if (response.content) {
                    yield { type: 'narrative_chunk', content: response.content };
                }
                break;
            }
            // Has tool calls → execute each one
            // Append assistant message (with tool_calls)
            messages.push({
                role: 'assistant',
                content: response.content || '',
                tool_calls: response.toolCalls,
            });
            for (const call of response.toolCalls) {
                try {
                    const result = await this.executeTool(call, ctx);
                    // Yield dice event to frontend sidebar (if applicable)
                    if (result.sessionEvent) {
                        yield result.sessionEvent;
                    }
                    // Append tool result for next LLM round
                    messages.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        content: JSON.stringify(result.toolResult),
                    });
                }
                catch (error) {
                    console.error(`[ExplorationState] Tool execution failed:`, error);
                    // Return error to LLM
                    messages.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        content: JSON.stringify({
                            error: error instanceof Error ? error.message : 'Unknown error',
                        }),
                    });
                }
            }
            rounds++;
        }
        if (rounds >= MAX_TOOL_ROUNDS) {
            console.warn(`[ExplorationState] Max tool rounds (${MAX_TOOL_ROUNDS}) reached`);
        }
        yield { type: 'turn_end' };
    }
    async executeTool(call, ctx) {
        let args;
        try {
            args = JSON.parse(call.function.arguments);
        }
        catch (error) {
            return {
                toolResult: { error: 'Invalid tool arguments JSON' },
            };
        }
        switch (call.function.name) {
            case 'request_ability_check':
                return this.executeAbilityCheck(args, ctx);
            case 'request_saving_throw':
                return this.executeSavingThrow(args, ctx);
            case 'request_group_check':
                return this.executeGroupCheck(args, ctx);
            case 'start_combat':
                return {
                    toolResult: { acknowledged: true },
                    sessionEvent: {
                        type: 'state_transition',
                        to: 'combat',
                        reason: args.reason || '进入战斗',
                    },
                };
            case 'restrict_action':
                return {
                    toolResult: { acknowledged: true },
                    sessionEvent: {
                        type: 'action_restriction',
                        allowedCharacterIds: args.characterIds || [],
                        reason: args.reason || '行动限制',
                    },
                };
            default:
                return {
                    toolResult: { error: `Unknown tool: ${call.function.name}` },
                };
        }
    }
    executeAbilityCheck(args, ctx) {
        // Resolve character ID if LLM passed a name instead of ID
        let characterId = args.characterId;
        let actualCharacterId = args.characterId;
        // Try to find by ID first, then by name
        const byId = ctx.roomMembers.find(m => m.characterId === args.characterId);
        if (!byId) {
            const byName = ctx.roomMembers.find(m => m.characterName?.toLowerCase() === args.characterId.toLowerCase() ||
                m.username?.toLowerCase() === args.characterId.toLowerCase());
            if (byName && byName.characterId) {
                actualCharacterId = byName.characterId;
            }
        }
        const result = ctx.gameEngine.abilityCheck(actualCharacterId, args.ability, args.rollType || 'normal');
        const success = result.roll.total >= args.dc;
        // Find character name
        const character = ctx.roomMembers.find(m => m.characterId === actualCharacterId);
        const characterName = character?.characterName || character?.username;
        return {
            toolResult: {
                characterId: actualCharacterId,
                ability: args.ability,
                roll: result.roll,
                dc: args.dc,
                success,
                reason: args.reason,
            },
            sessionEvent: {
                type: 'dice_roll',
                data: {
                    checkType: 'ability_check',
                    characterId: actualCharacterId,
                    characterName,
                    ability: args.ability,
                    dc: args.dc,
                    roll: result.roll,
                    success,
                    reason: args.reason,
                },
            },
        };
    }
    executeSavingThrow(args, ctx) {
        // Resolve character ID if LLM passed a name instead of ID
        let actualCharacterId = args.characterId;
        const byId = ctx.roomMembers.find(m => m.characterId === args.characterId);
        if (!byId) {
            const byName = ctx.roomMembers.find(m => m.characterName?.toLowerCase() === args.characterId.toLowerCase() ||
                m.username?.toLowerCase() === args.characterId.toLowerCase());
            if (byName && byName.characterId) {
                actualCharacterId = byName.characterId;
            }
        }
        const result = ctx.gameEngine.savingThrow(actualCharacterId, args.ability, args.rollType || 'normal');
        const success = result.roll.total >= args.dc;
        const character = ctx.roomMembers.find(m => m.characterId === actualCharacterId);
        const characterName = character?.characterName || character?.username;
        return {
            toolResult: {
                characterId: actualCharacterId,
                ability: args.ability,
                roll: result.roll,
                dc: args.dc,
                success,
                reason: args.reason,
            },
            sessionEvent: {
                type: 'dice_roll',
                data: {
                    checkType: 'saving_throw',
                    characterId: actualCharacterId,
                    characterName,
                    ability: args.ability,
                    dc: args.dc,
                    roll: result.roll,
                    success,
                    reason: args.reason,
                },
            },
        };
    }
    executeGroupCheck(args, ctx) {
        // Determine which characters to check
        const targetCharacterIds = args.characterIds?.length
            ? args.characterIds
            : ctx.roomMembers.map(m => m.characterId).filter(Boolean);
        if (targetCharacterIds.length === 0) {
            return {
                toolResult: { error: 'No characters available for group check' },
            };
        }
        // Execute check for each character
        const results = targetCharacterIds.map(characterId => {
            try {
                const result = ctx.gameEngine.abilityCheck(characterId, args.ability, 'normal');
                const success = result.roll.total >= args.dc;
                const character = ctx.roomMembers.find(m => m.characterId === characterId);
                const characterName = character?.characterName || character?.username || '未知';
                return {
                    characterId,
                    characterName,
                    roll: result.roll,
                    success,
                };
            }
            catch (error) {
                console.error(`[ExplorationState] Group check failed for ${characterId}:`, error);
                return {
                    characterId,
                    characterName: '未知',
                    roll: { formula: '1d20', rolls: [1], modifier: 0, total: 1 },
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        });
        // Count successes
        const successCount = results.filter(r => r.success).length;
        const totalCount = results.length;
        return {
            toolResult: {
                ability: args.ability,
                dc: args.dc,
                reason: args.reason,
                results,
                successCount,
                totalCount,
            },
            sessionEvent: {
                type: 'dice_roll',
                data: {
                    checkType: 'group_check',
                    characterId: 'group',
                    characterName: `全队 (${successCount}/${totalCount}成功)`,
                    ability: args.ability,
                    dc: args.dc,
                    roll: {
                        formula: `${totalCount}d20`,
                        rolls: results.map(r => r.roll.rolls[0] || 0),
                        modifier: 0,
                        total: successCount,
                    },
                    success: successCount > totalCount / 2, // Majority success
                    reason: args.reason,
                },
            },
        };
    }
    formatActions(actions) {
        return actions
            .map(a => a.characterName
            ? `[${a.characterName}] ${a.action}`
            : `[${a.username}] ${a.action}`)
            .join('\n');
    }
}
