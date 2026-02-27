// Infrastructure: Room chat implementation
// Manages chat messages within a room

import { v4 as uuidv4 } from 'uuid';
import type {
  ChatMessage,
  ChatHistory,
  IRoomChat,
  SendChatMessageInput,
} from '@/domain/room/chat.js';

export class RoomChat implements IRoomChat {
  private history: ChatHistory;

  constructor(roomId: string, maxMessages: number = 100) {
    this.history = {
      roomId,
      messages: [],
      maxMessages,
    };
  }

  sendMessage(input: SendChatMessageInput): ChatMessage {
    const message: ChatMessage = {
      id: uuidv4(),
      roomId: this.history.roomId,
      playerId: input.playerId,
      playerName: input.playerName,
      message: input.message.trim(),
      timestamp: new Date(),
      type: 'chat',
    };

    this.history.messages.push(message);

    // Trim if exceeding max messages
    if (this.history.messages.length > this.history.maxMessages) {
      this.history.messages = this.history.messages.slice(-this.history.maxMessages);
    }

    return message;
  }

  addSystemMessage(message: string): ChatMessage {
    const systemMessage: ChatMessage = {
      id: uuidv4(),
      roomId: this.history.roomId,
      playerId: 'system',
      playerName: 'System',
      message,
      timestamp: new Date(),
      type: 'system',
    };

    this.history.messages.push(systemMessage);
    return systemMessage;
  }

  getMessages(limit?: number): ChatMessage[] {
    if (limit) {
      return this.history.messages.slice(-limit);
    }
    return [...this.history.messages];
  }

  clear(): void {
    this.history.messages = [];
  }

  getMessageCount(): number {
    return this.history.messages.length;
  }

  getRoomId(): string {
    return this.history.roomId;
  }
}
