// API layer: Room route store
// Shared in-memory room map accessors

import type { IRoom } from '@/domain/index.js';

let getRoomsMap: () => Map<string, IRoom>;
let rooms: Map<string, IRoom>;

export function setRoomsMap(getRoomsFn: () => Map<string, IRoom>): void {
  getRoomsMap = getRoomsFn;
  rooms = getRoomsFn();
}

export function getRoomsMapRef(): () => Map<string, IRoom> {
  return getRoomsMap;
}

export function getRoomsMapInstance(): Map<string, IRoom> {
  return rooms;
}
