// Application layer: Event manager
// Wraps EventEmitter to publish game events

import { EventEmitter } from 'events';
import type { SessionEvent } from '@/domain/game/session.js';

export class EventManager {
  private emitter = new EventEmitter();

  getEmitter(): EventEmitter {
    return this.emitter;
  }

  onGameEvent(handler: (event: SessionEvent) => void): void {
    this.emitter.on('game-event', handler);
  }

  offGameEvent(handler: (event: SessionEvent) => void): void {
    this.emitter.off('game-event', handler);
  }

  emitGameEvent(event: SessionEvent): void {
    this.emitter.emit('game-event', event);
  }
}
