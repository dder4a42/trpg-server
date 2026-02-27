/**
 * Cleanup Script: Remove legacy StatusBar data and unused arrays
 *
 * This script removes:
 * - statusBarEntries (legacy)
 * - statusBarFlags (legacy)
 * - worldContexts (unused, kept in gameStates instead)
 * - characterOverlays (unused, kept in gameStates instead)
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/trpg.db');

console.log('Starting legacy StatusBar cleanup...');

// Read database
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

// Create backup
const backupPath = path.join(
  __dirname,
  '../data/trpg.db.pre-cleanup.backup.json'
);
fs.writeFileSync(backupPath, JSON.stringify(db, null, 2));
console.log('Backup created:', backupPath);

// Record what we're removing
const removalStats = {
  statusBarEntries: db.statusBarEntries?.length || 0,
  statusBarFlags: db.statusBarFlags?.length || 0,
  worldContexts: db.worldContexts?.length || 0,
  characterOverlays: db.characterOverlays?.length || 0,
};

// Remove the legacy and unused arrays
delete db.statusBarEntries;
delete db.statusBarFlags;
delete db.worldContexts;
delete db.characterOverlays;

// Write cleaned database
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

console.log('');
console.log('Cleanup complete!');
console.log('Removed:');
console.log('  - statusBarEntries:', removalStats.statusBarEntries, 'entries');
console.log('  - statusBarFlags:', removalStats.statusBarFlags, 'entries');
console.log('  - worldContexts (unused):', removalStats.worldContexts, 'entries');
console.log('  - characterOverlays (unused):', removalStats.characterOverlays, 'entries');
console.log('');
console.log('WorldContext and CharacterOverlay are persisted via gameStates table.');
