/**
 * Room UI State Store
 * Single source of truth for game page state with reactive updates.
 */

const initialState = {
  roomId: null,

  streaming: {
    active: false,
    targetElementId: null,
    buffer: [],
    fullText: '',
    lastCompleteAt: null,
  },

  members: {
    byUserId: {},
    order: [],
    version: 0,
  },

  chat: {
    lastSeenTimestamp: 0,
  },

  notes: {
    byId: {},
    order: [],
    version: 0,
  },

  combat: {
    entries: [],
    seenKeys: new Set(),
    maxEntries: 200,
    maxSeenKeys: 500,
  },

  statusPanel: {
    lastLoadedAt: null,
    loading: false,
    requestSeq: 0,
  },
};

class Store {
  constructor(initialState) {
    // Deep clone manually to preserve Set objects
    this.state = {
      roomId: initialState.roomId,
      streaming: { ...initialState.streaming, buffer: [] },
      members: {
        byUserId: {},
        order: [],
        version: 0,
      },
      chat: { ...initialState.chat },
      notes: {
        byId: {},
        order: [],
        version: 0,
      },
      combat: {
        entries: [],
        seenKeys: new Set(), // Preserve Set object
        maxEntries: initialState.combat.maxEntries,
        maxSeenKeys: initialState.combat.maxSeenKeys,
      },
      statusPanel: { ...initialState.statusPanel },
    };
    this.listeners = new Set();
    this.pendingRender = false;
  }

  getState() {
    return this.state;
  }

  dispatch(action) {
    this.state = this.reducer(this.state, action);
    this.scheduleRender();
  }

  reducer(state, action) {
    switch (action.type) {
      case 'INIT_ROOM':
        return { ...state, roomId: action.payload };

      case 'STREAMING_START':
        return {
          ...state,
          streaming: {
            ...state.streaming,
            active: true,
            targetElementId: action.payload.targetElementId || null,
            buffer: [],
            fullText: '',
          },
        };

      case 'STREAMING_SET_TARGET':
        return {
          ...state,
          streaming: {
            ...state.streaming,
            targetElementId: action.payload,
          },
        };

      case 'STREAMING_CHUNK':
        return {
          ...state,
          streaming: {
            ...state.streaming,
            buffer: [...state.streaming.buffer, action.payload],
            fullText: state.streaming.fullText + action.payload,
          },
        };

      case 'STREAMING_FLUSH_BUFFER':
        return {
          ...state,
          streaming: {
            ...state.streaming,
            buffer: [],
          },
        };

      case 'STREAMING_RESET':
        return {
          ...state,
          streaming: {
            active: false,
            targetElementId: null,
            buffer: [],
            fullText: '',
            lastCompleteAt: null,
          },
        };

      case 'STREAMING_COMPLETE':
        return {
          ...state,
          streaming: {
            ...state.streaming,
            active: false,
            lastCompleteAt: Date.now(),
          },
        };

      case 'MEMBERS_UPDATED': {
        const members = action.payload || [];
        const byUserId = {};
        const order = [];
        members.forEach(m => {
          byUserId[m.userId] = m;
          order.push(m.userId);
        });
        return {
          ...state,
          members: {
            byUserId,
            order,
            version: state.members.version + 1,
          },
        };
      }

      case 'NOTES_SYNCED': {
        const notes = action.payload || [];
        const byId = {};
        const order = [];
        notes.forEach(n => {
          byId[n.id] = n;
          order.push(n.id);
        });
        return {
          ...state,
          notes: {
            byId,
            order,
            version: state.notes.version + 1,
          },
        };
      }

      case 'COMBAT_ADD_ENTRY': {
        const key = action.payload.key;
        
        // Ensure seenKeys is a Set (defensive check)
        if (!(state.combat.seenKeys instanceof Set)) {
          console.error('[Store] seenKeys is not a Set! Reinitializing...');
          state.combat.seenKeys = new Set();
        }
        
        if (state.combat.seenKeys.has(key)) {
          console.log('[Store] Duplicate combat entry detected, skipping:', key);
          return state;
        }

        const newSeenKeys = new Set(state.combat.seenKeys);
        newSeenKeys.add(key);

        // LRU cleanup if exceeds max
        if (newSeenKeys.size > state.combat.maxSeenKeys) {
          const arr = Array.from(newSeenKeys);
          const toRemove = arr.slice(0, arr.length - state.combat.maxSeenKeys);
          toRemove.forEach(k => newSeenKeys.delete(k));
        }

        const newEntries = [action.payload.entry, ...state.combat.entries].slice(0, state.combat.maxEntries);

        return {
          ...state,
          combat: {
            ...state.combat,
            entries: newEntries,
            seenKeys: newSeenKeys,
          },
        };
      }

      case 'STATUS_PANEL_LOADING':
        return {
          ...state,
          statusPanel: {
            ...state.statusPanel,
            loading: true,
            requestSeq: state.statusPanel.requestSeq + 1,
          },
        };

      case 'STATUS_PANEL_LOADED':
        if (action.payload.seq < state.statusPanel.requestSeq) {
          return state;
        }
        return {
          ...state,
          statusPanel: {
            ...state.statusPanel,
            loading: false,
            lastLoadedAt: Date.now(),
          },
        };

      default:
        return state;
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  scheduleRender() {
    if (this.pendingRender) return;
    this.pendingRender = true;
    requestAnimationFrame(() => {
      this.pendingRender = false;
      this.listeners.forEach(listener => {
        try {
          listener(this.state);
        } catch (error) {
          console.error('[Store] Listener error:', error);
        }
      });
    });
  }
}

export const store = new Store(initialState);
