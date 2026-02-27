// Infrastructure: Room chat implementation
// Manages chat messages within a room
import { v4 as uuidv4 } from 'uuid';
export class RoomChat {
    history;
    constructor(roomId, maxMessages = 100) {
        this.history = {
            roomId,
            messages: [],
            maxMessages,
        };
    }
    sendMessage(input) {
        const message = {
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
    addSystemMessage(message) {
        const systemMessage = {
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
    getMessages(limit) {
        if (limit) {
            return this.history.messages.slice(-limit);
        }
        return [...this.history.messages];
    }
    clear() {
        this.history.messages = [];
    }
    getMessageCount() {
        return this.history.messages.length;
    }
    getRoomId() {
        return this.history.roomId;
    }
}
