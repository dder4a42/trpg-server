// Application layer: Mechanics agent
// Executes tool calls and yields session events

import type { ToolCall } from '@/domain/llm/types.js';
import type { Ability } from '@/domain/game/types.js';
import type { GameSessionContext, SessionEvent } from '@/domain/game/session.js';

export type MechanicsToolResult = {
  toolResult: unknown;
  sessionEvent?: SessionEvent;
};

export class MechanicsAgent {
  async execute(
    call: ToolCall,
    ctx: GameSessionContext
  ): Promise<MechanicsToolResult> {
    let args: any;
    try {
      args = JSON.parse(call.function.arguments);
    } catch (error) {
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

  private resolveCharacterId(rawId: string, ctx: GameSessionContext): string {
    const byId = ctx.roomMembers.find((m) => m.characterId === rawId);
    if (byId?.characterId) return byId.characterId;

    const byName = ctx.roomMembers.find(
      (m) =>
        m.characterName?.toLowerCase() === rawId.toLowerCase() ||
        m.username?.toLowerCase() === rawId.toLowerCase()
    );

    return byName?.characterId || rawId;
  }

  private getCharacterName(characterId: string, ctx: GameSessionContext): string | undefined {
    const character = ctx.roomMembers.find((m) => m.characterId === characterId);
    return character?.characterName || character?.username;
  }

  private executeAbilityCheck(
    args: {
      characterId: string;
      ability: Ability;
      dc: number;
      reason: string;
      rollType?: 'normal' | 'advantage' | 'disadvantage';
    },
    ctx: GameSessionContext
  ): MechanicsToolResult {
    const actualCharacterId = this.resolveCharacterId(args.characterId, ctx);

    const result = ctx.gameEngine.abilityCheck(
      actualCharacterId,
      args.ability,
      args.rollType || 'normal'
    );

    const success = result.roll.total >= args.dc;
    const characterName = this.getCharacterName(actualCharacterId, ctx);

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

  private executeSavingThrow(
    args: {
      characterId: string;
      ability: Ability;
      dc: number;
      reason: string;
      rollType?: 'normal' | 'advantage' | 'disadvantage';
    },
    ctx: GameSessionContext
  ): MechanicsToolResult {
    const actualCharacterId = this.resolveCharacterId(args.characterId, ctx);

    const result = ctx.gameEngine.savingThrow(
      actualCharacterId,
      args.ability,
      args.rollType || 'normal'
    );

    const success = result.roll.total >= args.dc;
    const characterName = this.getCharacterName(actualCharacterId, ctx);

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

  private executeGroupCheck(
    args: {
      ability: Ability;
      dc: number;
      reason: string;
      characterIds?: string[];
    },
    ctx: GameSessionContext
  ): MechanicsToolResult {
    const targetCharacterIds = args.characterIds?.length
      ? args.characterIds
      : (ctx.roomMembers.map((m) => m.characterId).filter(Boolean) as string[]);

    if (targetCharacterIds.length === 0) {
      return {
        toolResult: { error: 'No characters available for group check' },
      };
    }

    const results = targetCharacterIds.map((characterId) => {
      try {
        const result = ctx.gameEngine.abilityCheck(characterId, args.ability, 'normal');
        const success = result.roll.total >= args.dc;
        const character = ctx.roomMembers.find((m) => m.characterId === characterId);
        const characterName = character?.characterName || character?.username || '未知';

        return {
          characterId,
          characterName,
          roll: result.roll,
          success,
        };
      } catch (error) {
        console.error(`[MechanicsAgent] Group check failed for ${characterId}:`, error);
        return {
          characterId,
          characterName: '未知',
          roll: { formula: '1d20', rolls: [1], modifier: 0, total: 1 },
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    const successCount = results.filter((r) => r.success).length;
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
            rolls: results.map((r) => r.roll.rolls[0] || 0),
            modifier: 0,
            total: successCount,
          },
          success: successCount > totalCount / 2,
          reason: args.reason,
        },
      },
    };
  }
}
