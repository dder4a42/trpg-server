// Domain types for room-based chat system

export interface ChatMessage {
  id: string;
  roomId: string;
  playerId: string;
  playerName: string;
  message: string;
  timestamp: Date;
  type: 'chat' | 'system';
}

export interface ChatHistory {
  roomId: string;
  messages: ChatMessage[];
  maxMessages: number;
}

export interface SendChatMessageInput {
  playerId: string;
  playerName: string;
  message: string;
}

export interface IRoomChat {
  sendMessage(input: SendChatMessageInput): ChatMessage;
  addSystemMessage(message: string): ChatMessage;
  getMessages(limit?: number): ChatMessage[];
  clear(): void;
  getMessageCount(): number;
}
