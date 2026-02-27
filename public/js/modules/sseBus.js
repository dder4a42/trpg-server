/**
 * SSE Bus
 * Single SSE connection with event and message-type dispatch.
 */

class SSEBus {
  constructor() {
    this.eventSource = null;
    this.roomId = null;
    this.eventHandlers = new Map();
    this.messageTypeHandlers = new Map();
  }

  connect(roomId) {
    if (this.eventSource && this.roomId === roomId) {
      return;
    }

    this.disconnect();
    this.roomId = roomId;
    this.eventSource = new EventSource(`/api/stream/rooms/${roomId}/stream`);

    this.eventSource.addEventListener('connected', () => {
      this.emit('connected', { roomId });
    });

    this.eventSource.addEventListener('message', (event) => {
      const data = this.safeParse(event.data);
      if (!data) return;

      console.log('[SSEBus] Received message:', data);

      if (data.type) {
        console.log('[SSEBus] Emitting message type:', data.type);
        this.emitMessageType(data.type, data);
      }

      this.emit('message', data);
    });

    this.eventSource.addEventListener('chat', (event) => {
      const data = this.safeParse(event.data);
      if (!data) return;
      this.emit('chat', data);
    });

    this.eventSource.addEventListener('members-updated', (event) => {
      const data = this.safeParse(event.data);
      if (!data) return;
      this.emit('members-updated', data);
    });

    this.eventSource.onerror = (error) => {
      this.emit('error', error);
    };
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.roomId = null;
    }
  }

  on(eventName, handler) {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    const handlers = this.eventHandlers.get(eventName);
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  onMessageType(type, handler) {
    if (!this.messageTypeHandlers.has(type)) {
      this.messageTypeHandlers.set(type, new Set());
    }
    const handlers = this.messageTypeHandlers.get(type);
    handlers.add(handler);
    console.log(`[SSEBus] Registered handler for message type: ${type} (total: ${handlers.size})`);
    return () => {
      handlers.delete(handler);
      console.log(`[SSEBus] Unregistered handler for message type: ${type}`);
    };
  }

  emit(eventName, payload) {
    const handlers = this.eventHandlers.get(eventName);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (error) {
        console.error('[SSEBus] handler error:', error);
      }
    }
  }

  emitMessageType(type, payload) {
    const handlers = this.messageTypeHandlers.get(type);
    console.log(`[SSEBus] emitMessageType called for type: ${type}, handlers count: ${handlers ? handlers.size : 0}`);
    if (!handlers) {
      console.warn(`[SSEBus] No handlers registered for message type: ${type}`);
      return;
    }
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (error) {
        console.error('[SSEBus] message handler error:', error);
      }
    }
  }

  safeParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error('[SSEBus] Failed to parse event payload:', error);
      return null;
    }
  }
}

export const sseBus = new SSEBus();
