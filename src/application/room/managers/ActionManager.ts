// Application layer: Action manager
// Collects and manages player actions for a room

import type { PlayerAction, RoomMember } from '@/domain/room/types.js';
import type { TurnGate } from '@/domain/game/session.js';

export class ActionManager {
  private actions: PlayerAction[] = [];

  addAction(action: PlayerAction): void {
    const existingIndex = this.actions.findIndex((a) => a.userId === action.userId);
    if (existingIndex >= 0) {
      this.actions[existingIndex] = action;
      return;
    }

    this.actions.push(action);
  }

  getActions(): PlayerAction[] {
    return [...this.actions];
  }

  drainActions(): PlayerAction[] {
    const current = [...this.actions];
    this.actions = [];
    return current;
  }

  hasAllActed(members: RoomMember[], turnGate: TurnGate): boolean {
    return turnGate.canAdvance(this.actions, members.length);
  }
}
