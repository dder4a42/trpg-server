/**
 * Combat Log Diagnostic Script
 * Paste this into browser console to diagnose issues
 */

console.log('=== Combat Log Diagnostic ===');

// 1. Check if elements exist
console.log('\n1. DOM Elements Check:');
const combatLogFull = document.getElementById('combat-log-full');
const combatLogPanel = document.getElementById('combat-log-panel');
const turnGateStatus = document.getElementById('turn-gate-status');

console.log('  #combat-log-full:', combatLogFull ? '✓ Found' : '✗ NOT FOUND');
console.log('  #combat-log-panel:', combatLogPanel ? '✓ Found' : '✗ NOT FOUND');
console.log('  #turn-gate-status:', turnGateStatus ? '✓ Found' : '✗ NOT FOUND');

// 2. Check sseBus
console.log('\n2. SSE Bus Check:');
if (typeof sseBus !== 'undefined') {
  console.log('  sseBus:', '✓ Available');
  console.log('  messageTypeHandlers:', sseBus.messageTypeHandlers);
  
  const diceRollHandlers = sseBus.messageTypeHandlers.get('dice-roll');
  console.log('  dice-roll handlers:', diceRollHandlers ? `✓ ${diceRollHandlers.size} registered` : '✗ None');
} else {
  console.log('  sseBus: ✗ NOT AVAILABLE');
}

// 3. Check store
console.log('\n3. Store Check:');
if (typeof store !== 'undefined') {
  console.log('  store:', '✓ Available');
  const state = store.getState();
  console.log('  combat entries:', state.combat.entries.length);
  console.log('  seen keys:', state.combat.seenKeys.size);
} else {
  console.log('  store: ✗ NOT AVAILABLE');
}

// 4. Check game client
console.log('\n4. Game Client Check:');
if (typeof gameClient !== 'undefined') {
  console.log('  gameClient:', '✓ Available');
  console.log('  roomId:', gameClient.roomId);
} else {
  console.log('  gameClient: ✗ NOT AVAILABLE');
}

// 5. List all combat-related IDs
console.log('\n5. All Elements with "combat" in ID:');
const combatElements = Array.from(document.querySelectorAll('[id*="combat"]'));
combatElements.forEach(el => {
  console.log(`  - #${el.id}:`, el.tagName, el.className);
});

// 6. Test message handler directly
console.log('\n6. Testing Message Handler:');
console.log('  To manually test, run:');
console.log('  testDiceRoll()');

window.testDiceRoll = function() {
  const testData = {
    type: 'dice-roll',
    data: {
      checkType: 'ability_check',
      characterId: 'test-char',
      characterName: 'Test Character',
      ability: 'intelligence',
      dc: 15,
      roll: {
        formula: '1d20+3',
        rolls: [12],
        modifier: 3,
        total: 15,
        reason: 'test check'
      },
      success: true,
      reason: 'Manual test'
    }
  };
  
  console.log('Dispatching test dice-roll event...');
  if (typeof sseBus !== 'undefined') {
    sseBus.emitMessageType('dice-roll', testData);
    console.log('✓ Test event dispatched');
  } else {
    console.error('✗ sseBus not available');
  }
};

console.log('\n=== Diagnostic Complete ===');
console.log('If errors found, report the output above.');
