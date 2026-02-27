/**
 * Game Page Entry Point
 * Initializes game-specific functionality
 */
import { TRPGClient, SaveMenuManager, CharacterForm } from './modules/game.js';
import { PlayerNotesManager } from './modules/notes.js';
import { ChatManager } from './modules/chat.js';
import { RoomMembersManager } from './modules/members.js';
import { registerCombatHandlers } from './modules/combatEvents.js';
import { sseBus } from './modules/sseBus.js';
import { fetchText } from './modules/api.js';
import { store } from './modules/store.js';

// Global references
let playerNotesManager = null;
let roomChat = null;
let roomMembers = null;
let unregisterCombatHandlers = null;

/**
 * Rehydrate status panel subtree after HTML replacement
 */
function rehydrateStatusSubtree(roomId, userId) {
  if (userId && roomId) {
    playerNotesManager = new PlayerNotesManager(roomId, userId);
    playerNotesManager.init();
  }
}

/**
 * Load and refresh the status panel content
 */
window.loadStatusPanel = async function() {
  const statusPanel = document.getElementById('status-panel');
  if (!statusPanel) return;

  const gamePage = document.querySelector('.game-container');
  const roomId = gamePage?.getAttribute('data-room-id');
  if (!roomId) return;

  const state = store.getState();
  const currentSeq = state.statusPanel.requestSeq;
  store.dispatch({ type: 'STATUS_PANEL_LOADING' });
  const requestSeq = store.getState().statusPanel.requestSeq;

  try {
    const { ok, text } = await fetchText(`/partials/room/${roomId}/status`);
    if (ok) {
      const html = text;
      const statusBody = document.getElementById('status-body');
      if (statusBody) {
        statusBody.innerHTML = html;
        
        store.dispatch({ 
          type: 'STATUS_PANEL_LOADED', 
          payload: { seq: requestSeq } 
        });

        const userMeta = document.querySelector('meta[name="user-id"]');
        const userId = userMeta ? userMeta.getAttribute('content') : null;
        rehydrateStatusSubtree(roomId, userId);
      }
    }
  } catch (error) {
    console.error('[Status Panel] Failed to load:', error);
    store.dispatch({ 
      type: 'STATUS_PANEL_LOADED', 
      payload: { seq: requestSeq } 
    });
  }
};

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're on the game page
  const gameContainer = document.querySelector('.game-container');
  const roomId = gameContainer?.dataset.roomId;
  
  if (roomId) {
    // Initialize store with room
    store.dispatch({ type: 'INIT_ROOM', payload: roomId });

    // Initialize game client
    window.gameClient = new TRPGClient(roomId);

    // Initialize save menu manager
    window.saveMenu = new SaveMenuManager(roomId);

    // Initialize dice roll and action restriction areas
    createGameEventAreas();

    // Register combat event handlers BEFORE connecting SSE
    console.log('[GameClient] Registering combat handlers with sseBus');
    unregisterCombatHandlers = registerCombatHandlers(sseBus);
    console.log('[GameClient] Combat handlers registered');

    // Handle action form submission
    const actionForm = document.getElementById('action-form');
    if (actionForm) {
      actionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        window.gameClient.sendAction(actionForm);
      });
    }

    // Initialize player notes manager
    const userMeta = document.querySelector('meta[name="user-id"]');
    const userId = userMeta ? userMeta.getAttribute('content') : null;
    rehydrateStatusSubtree(roomId, userId);

    // Initialize chat manager
    roomChat = new ChatManager(roomId);
    roomChat.loadInitialMessages();
    roomChat.setupFormHandler();

    // Initialize members manager
    roomMembers = new RoomMembersManager(roomId);
    roomMembers.loadInitialMembers();
    roomMembers.connect();

    // Setup tab switching
    setupTabs();

    // Connect to SSE stream
    window.gameClient.connectSSE({
      onChat: (msg) => roomChat.renderMessage(msg)
    });

    // Refresh status panel for ALL room players when any turn ends
    sseBus.onMessageType('turn_end', () => {
      if (typeof window.loadStatusPanel === 'function') {
        window.loadStatusPanel();
      }
    });

    // Setup MutationObserver to catch new streaming-response elements
    setupMutationObserver(window.gameClient);
  }

  // Initialize character form if on character creation page
  const characterForm = document.querySelector('.character-form');
  if (characterForm) {
    new CharacterForm();
  }

  window.addEventListener('beforeunload', () => {
    if (roomMembers) roomMembers.destroy();
    if (unregisterCombatHandlers) unregisterCombatHandlers();
  });
});

/**
 * Create game event display areas (dice rolls, action restrictions)
 */
function createGameEventAreas() {
  const statusBody = document.getElementById('status-body');
  if (!statusBody) {
    console.warn('[GameClient] status-body not found');
    return;
  }

  // Create turn gate status area if not exists
  let turnGateStatus = document.getElementById('turn-gate-status');
  if (!turnGateStatus) {
    turnGateStatus = document.createElement('div');
    turnGateStatus.id = 'turn-gate-status';
    statusBody.appendChild(turnGateStatus);
    console.log('[GameClient] Created turn-gate-status element');
  }

  // Check if combat-log-full exists
  const combatLogFull = document.getElementById('combat-log-full');
  if (combatLogFull) {
    console.log('[GameClient] combat-log-full element found:', combatLogFull);
  } else {
    console.error('[GameClient] combat-log-full element NOT FOUND in DOM!');
  }
}

/**
 * Setup MutationObserver to detect new elements from HTMX or actions
 */
function setupMutationObserver(client) {
  const storyOutput = document.getElementById('story-output');
  if (!storyOutput) return;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if this node is a streaming response container
            const streamingContainer = node.id?.startsWith('streaming-response-') 
              ? node 
              : node.querySelector('[id^="streaming-response-"]');

            if (streamingContainer && streamingContainer.id) {
              // Only set if this is a freshly added element (just added to DOM)
              // The element should be empty or only contain a streaming indicator
              // Use children.length instead of childNodes.length to ignore whitespace text nodes
              const isEmpty = streamingContainer.children.length === 0 ||
                (streamingContainer.children.length === 1 &&
                 streamingContainer.querySelector('.streaming-indicator'));

              if (isEmpty) {
                console.log('[MutationObserver] New streaming container detected:', streamingContainer.id);
                client.setStreamingElementId(streamingContainer.id);
              } else {
                console.log('[MutationObserver] Streaming container has content, skipping:', streamingContainer.id);
              }
            }
          }
        }
      }
    }
  });

  observer.observe(storyOutput, { childList: true, subtree: true });
}

/**
 * Setup tab switching logic
 */
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const statusPanel = document.getElementById('status-panel');
  const combatPanel = document.getElementById('combat-log-panel');
  const notesPanel = document.getElementById('notes-panel');
  const chatPanel = document.getElementById('chat-panel');
  const savesPanel = document.getElementById('saves-panel');

  // Setup scrollable tabs functionality
  setupScrollableTabs();

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Hide all panels
      [statusPanel, combatPanel, notesPanel, chatPanel, savesPanel].forEach(p => {
        if (p) {
          p.classList.add('hidden');
          p.style.display = 'none';
        }
      });

      // Show selected panel
      let selectedPanel = null;
      if (tab === 'status') selectedPanel = statusPanel;
      else if (tab === 'combat-log') selectedPanel = combatPanel;
      else if (tab === 'notes') selectedPanel = notesPanel;
      else if (tab === 'chat') selectedPanel = chatPanel;
      else if (tab === 'saves') selectedPanel = savesPanel;

      if (selectedPanel) {
        selectedPanel.classList.remove('hidden');
        selectedPanel.style.display = '';

        // Load status panel content when tab is shown
        if (tab === 'status') {
          window.loadStatusPanel();
        }
      }
    });
  });
}

/**
 * Setup scrollable tabs with arrow buttons and fade indicators
 */
function setupScrollableTabs() {
  const wrapper = document.getElementById('sidebar-tabs-wrapper');
  const tabsContainer = document.getElementById('sidebar-tabs');
  const scrollLeftBtn = document.getElementById('tab-scroll-left');
  const scrollRightBtn = document.getElementById('tab-scroll-right');

  if (!wrapper || !tabsContainer) return;

  // Check scroll state and update UI
  function updateScrollState() {
    const canScrollLeft = tabsContainer.scrollLeft > 0;
    const canScrollRight = tabsContainer.scrollLeft < (tabsContainer.scrollWidth - tabsContainer.clientWidth - 1);

    wrapper.classList.toggle('can-scroll-left', canScrollLeft);
    wrapper.classList.toggle('can-scroll-right', canScrollRight);

    if (scrollLeftBtn) scrollLeftBtn.disabled = !canScrollLeft;
    if (scrollRightBtn) scrollRightBtn.disabled = !canScrollRight;
  }

  // Scroll buttons
  if (scrollLeftBtn) {
    scrollLeftBtn.addEventListener('click', () => {
      tabsContainer.scrollBy({ left: -100, behavior: 'smooth' });
    });
  }

  if (scrollRightBtn) {
    scrollRightBtn.addEventListener('click', () => {
      tabsContainer.scrollBy({ left: 100, behavior: 'smooth' });
    });
  }

  // Update scroll state on scroll and resize
  tabsContainer.addEventListener('scroll', updateScrollState);
  window.addEventListener('resize', updateScrollState);

  // Initial check
  setTimeout(updateScrollState, 100);
}
