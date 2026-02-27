/**
 * Migration Script: StatusBar → WorldContext/CharacterOverlay
 *
 * This script migrates existing statusBarEntries and statusBarFlags
 * to the new worldContexts and characterOverlays format.
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/trpg.db');

console.log('Starting migration...');

// Read database
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

// Create backup
const backupPath = path.join(
  __dirname,
  '../data/trpg.db.backup-' + Date.now() + '.json'
);
fs.writeFileSync(backupPath, JSON.stringify(db, null, 2));
console.log('Backup created:', backupPath);

// Helper to group by room
function groupBy(arr, key) {
  return arr.reduce((groups, item) => {
    const k = item[key];
    if (!groups[k]) groups[k] = [];
    groups[k].push(item);
    return groups;
  }, {});
}

// Group statusBarEntries by room_id
const entriesByRoom = groupBy(db.statusBarEntries || [], 'room_id');

// Group statusBarFlags by room_id
const flagsByRoom = groupBy(db.statusBarFlags || [], 'room_id');

// Get all unique room IDs
const roomIds = new Set([
  ...Object.keys(entriesByRoom),
  ...Object.keys(flagsByRoom)
]);

// Build worldContexts array
const worldContexts = [];

for (const roomId of roomIds) {
  const entries = entriesByRoom[roomId] || [];
  const flags = flagsByRoom[roomId] || [];

  // Separate short_term and long_term memories
  const recentEvents = entries
    .filter(e => e.memory_type === 'short_term')
    .map(e => e.content);

  const worldFacts = entries
    .filter(e => e.memory_type === 'long_term')
    .map(e => e.content);

  // Convert flags array to object
  const flagsObj = {};
  for (const f of flags) {
    flagsObj[f.flag_key] = f.flag_value;
  }

  // Find latest updated_at timestamp
  const allTimestamps = [
    ...entries.map(e => new Date(e.created_at || 0).getTime()),
    ...flags.map(f => new Date(f.updated_at || 0).getTime())
  ];
  const updatedAt = Math.max(...allTimestamps, Date.now());

  worldContexts.push({
    roomId,
    recentEvents,
    worldFacts,
    flags: flagsObj,
    updatedAt
  });
}

// Add new collections to database
db.worldContexts = worldContexts;
db.characterOverlays = []; // Start empty - no character conditions in old data

// Write updated database
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

console.log('');
console.log('Migration complete!');
console.log('  - Migrated ' + roomIds.size + ' rooms to worldContexts');
console.log('  - Created ' + worldContexts.length + ' worldContext entries');
console.log('  - Created empty characterOverlays array');
console.log('');
console.log('Sample worldContext:');
console.log(JSON.stringify(worldContexts[0], null, 2));
