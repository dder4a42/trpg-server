// API layer: Room route store
// Shared in-memory room map accessors
let getRoomsMap;
let rooms;
export function setRoomsMap(getRoomsFn) {
    getRoomsMap = getRoomsFn;
    rooms = getRoomsFn();
}
export function getRoomsMapRef() {
    return getRoomsMap;
}
export function getRoomsMapInstance() {
    return rooms;
}
