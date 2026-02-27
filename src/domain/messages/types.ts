// Domain layer: Message types for game communication
// NO external dependencies - pure TypeScript

import type { LLMMessage } from '@/domain/llm/types.js';
import type { DiceRoll } from '../game/types.js';

/**
 * Enhanced game message with metadata for rendering
 */
export interface GameMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  content: string;

  // For user messages - who sent it
  sender?: MessageSender;

  // For assistant messages - mechanics data
  mechanics?: MessageMechanics;

  // Metadata
  metadata?: Record<string, unknown>;
}

export interface MessageSender {
  userId: string;
  username: string;
  characterId?: string;
  characterName?: string;
}

export interface MessageMechanics {
  diceRolls?: DiceRoll[];
  checks?: AbilityCheck[];
  combat?: CombatEvent;
}

export interface AbilityCheck {
  checkId: string;
  characterId: string;
  characterName?: string;
  ability: string;
  roll: DiceRoll;
  dc?: number;
  success?: boolean;
}

export interface CombatEvent {
  eventId: string;
  type: 'attack' | 'damage' | 'saving-throw' | 'death-save';
  attackerId?: string;
  attackerName?: string;
  targetId?: string;
  targetName?: string;
  weapon?: string;
  roll?: DiceRoll;
  damage?: number;
  damageType?: string;
  result?: string;
}

/**
 * Convert GameMessage to LLMMessage for LLM API
 */
export function toLLMMessage(message: GameMessage): LLMMessage {
  const llmMessage: LLMMessage = {
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
  };

  // For user messages, prepend sender name
  if (message.role === 'user' && message.sender) {
    const name = message.sender.characterName || message.sender.username;
    llmMessage.content = `[${name}] ${message.content}`;
  }

  return llmMessage;
}

/**
 * Convert multiple GameMessages to LLMMessages
 */
export function toLLMMessages(messages: GameMessage[]): LLMMessage[] {
  return messages.map(toLLMMessage);
}
