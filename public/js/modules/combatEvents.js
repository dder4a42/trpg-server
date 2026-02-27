/**
 * Combat Events
 * Default renderers for dice rolls and action restrictions.
 */

import { store } from './store.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

function getCombatTargets() {
  return {
    fullLog: document.getElementById('combat-log-full'),
    status: document.getElementById('turn-gate-status')
  };
}

function renderDiceRollEntry(rollData) {
  const entry = document.createElement('div');
  const success = !!rollData?.success;
  entry.className = `dice-roll-entry ${success ? 'success' : 'failure'}`;

  const characterName = escapeHtml(rollData?.characterName || 'Unknown');
  const checkType = escapeHtml(rollData?.checkType || 'Check');
  const ability = escapeHtml(rollData?.ability || '');
  const dc = rollData?.dc !== undefined ? `DC ${escapeHtml(rollData.dc)}` : '';
  const formula = escapeHtml(rollData?.roll?.formula || '');
  const total = rollData?.roll?.total !== undefined ? rollData.roll.total : '';
  const reason = escapeHtml(rollData?.reason || '');

  // Match CSS class names: .roll-header, .character-name, .check-type, etc.
  entry.innerHTML = `
    <div class="roll-header">
      <span class="character-name">${characterName}</span>
      <span class="check-type">${checkType.replace('_', ' ')}</span>
    </div>
    <div class="roll-detail">
      <span class="ability">${ability}</span>
      <span class="dc">${dc}</span>
    </div>
    <div class="roll-detail">
      <span>${formula} = <strong>${escapeHtml(total)}</strong></span>
      <span class="result ${success ? 'success' : 'failure'}">${success ? '✓ Success' : '✗ Failure'}</span>
    </div>
    ${reason ? `<div class="roll-reason">${reason}</div>` : ''}
  `;

  return entry;
}

function renderActionRestriction(eventData) {
  const { status } = getCombatTargets();
  if (!status) return;

  const reason = escapeHtml(eventData?.reason || 'Action restricted');
  const allowed = Array.isArray(eventData?.allowedCharacterIds)
    ? eventData.allowedCharacterIds.join(', ')
    : '';

  status.innerHTML = `
    <div class="action-restriction">
      <div class="action-restriction-title">Action Restricted</div>
      <div class="action-restriction-reason">${reason}</div>
      ${allowed ? `<div class="action-restriction-allowed">Allowed: ${escapeHtml(allowed)}</div>` : ''}
    </div>
  `;
}

function generateDedupeKey(type, data) {
  return `${type}-${JSON.stringify(data)}`;
}

function renderDiceRoll(rollData) {
  console.log('[CombatEvents] renderDiceRoll called with:', rollData);
  const key = generateDedupeKey('dice-roll', rollData);
  const entry = renderDiceRollEntry(rollData);

  store.dispatch({
    type: 'COMBAT_ADD_ENTRY',
    payload: { key, entry: rollData },
  });

  const { fullLog } = getCombatTargets();

  console.log('[CombatEvents] fullLog element:', fullLog);
  console.log('[CombatEvents] Checking for #combat-log-full:', document.getElementById('combat-log-full'));

  if (fullLog) {
    // Remove empty state if present
    const emptyState = fullLog.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
      console.log('[CombatEvents] Removed empty state');
    }
    fullLog.prepend(entry);
    console.log('[CombatEvents] Added dice roll entry to combat log');
  } else {
    console.error('[CombatEvents] fullLog element not found! Looking for #combat-log-full');
    console.error('[CombatEvents] All elements with id containing "combat":', 
      Array.from(document.querySelectorAll('[id*="combat"]')).map(el => el.id)
    );
  }
}

export function registerCombatHandlers(sseBus) {
  if (!sseBus) {
    console.error('[CombatEvents] sseBus is null or undefined!');
    return () => {};
  }

  console.log('[CombatEvents] Registering combat handlers');

  const unsubDice = sseBus.onMessageType('dice-roll', (payload) => {
    console.log('[CombatEvents] dice-roll event received:', payload);
    if (payload?.data) {
      renderDiceRoll(payload.data);
    } else {
      console.warn('[CombatEvents] dice-roll payload has no data:', payload);
    }
  });

  const unsubRestriction = sseBus.onMessageType('action-restriction', (payload) => {
    console.log('[CombatEvents] action-restriction event received:', payload);
    renderActionRestriction(payload);
  });

  console.log('[CombatEvents] Combat handlers registered successfully');

  return () => {
    console.log('[CombatEvents] Unregistering combat handlers');
    unsubDice?.();
    unsubRestriction?.();
  };
}
