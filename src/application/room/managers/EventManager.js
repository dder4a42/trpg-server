// Application layer: Event manager
// Wraps EventEmitter to publish game events
import { EventEmitter } from 'events';
export class EventManager {
    emitter = new EventEmitter();
    getEmitter() {
        return this.emitter;
    }
    onGameEvent(handler) {
        this.emitter.on('game-event', handler);
    }
    offGameEvent(handler) {
        this.emitter.off('game-event', handler);
    }
    emitGameEvent(event) {
        this.emitter.emit('game-event', event);
    }
}
