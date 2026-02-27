// Application layer: Exploration state implementation
// Handles free-form play, dialogue, checks, social encounters

import type {
  IGameState,
  GameSessionContext,
  SessionEvent,
} from '@/domain/game/session.js';
import type { PlayerAction } from '@/domain/room/types.js';
import type { LLMMessage, ToolDefinition } from '@/domain/llm/types.js';
import { MechanicsAgent } from '@/application/game/agents/MechanicsAgent.js';
import type { WorldContextUpdater } from '@/application/game/agents/WorldContextUpdater.js';

const MAX_TOOL_ROUNDS = 5;

/**
 * Tool definitions for exploration mode
 * These are passed to the LLM to enable function calling
 */
export const EXPLORATION_TOOLS: ToolDefinition[] = [
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
export class ExplorationState implements IGameState {
  readonly name = 'exploration' as const;
  private mechanicsAgent: MechanicsAgent;
  private worldContextUpdater: WorldContextUpdater;

  constructor(worldContextUpdater: WorldContextUpdater) {
    this.mechanicsAgent = new MechanicsAgent();
    this.worldContextUpdater = worldContextUpdater;
  }

  async *processActions(
    actions: PlayerAction[],
    ctx: GameSessionContext
  ): AsyncGenerator<SessionEvent> {
    // 1. Build LLM context
    const messages: LLMMessage[] = await ctx.contextBuilder.build(ctx.gameState);
    messages.push({ role: 'user', content: this.formatActions(actions) });

    let fullNarrative = '';

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
          fullNarrative += response.content;
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
          const result = await this.mechanicsAgent.execute(call, ctx);

          if (result.sessionEvent) {
            yield result.sessionEvent;
          }

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result.toolResult),
          });
        } catch (error) {
          console.error(`[ExplorationState] Tool execution failed:`, error);
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

    await this.worldContextUpdater.update(fullNarrative, actions, ctx.gameState);

    yield { type: 'turn_end' };
  }

  private formatActions(actions: PlayerAction[]): string {
    return actions
      .map(a =>
        a.characterName
          ? `[${a.characterName}] ${a.action}`
          : `[${a.username}] ${a.action}`
      )
      .join('\n');
  }
}
