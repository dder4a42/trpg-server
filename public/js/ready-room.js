// Ready Room frontend (state-driven, no HTMX)
// Uses Fetch + SSE(JSON) to update only the necessary DOM parts.

(function () {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options && options.headers ? options.headers : {}),
      },
    });
    const data = await res.json().catch(() => null);
    return { res, data };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const container = qs('.ready-room-container');
    if (!container) return;

    const roomId = container.dataset.roomId;
    if (!roomId) return;

    const state = {
      room: null,
      currentUser: null,
      members: [],
      userMembership: { characterId: undefined, isReady: false },
      userCharacters: [],
      selectedCharacterName: null,
      canStart: false,
    };

    let eventSource = null;

    function renderError(text) {
      const el = qs('#ready-room-error');
      if (!el) return;
      if (!text) {
        el.style.display = 'none';
        el.textContent = '';
        return;
      }
      el.style.display = '';
      el.textContent = text;
    }

    function renderModule() {
      const moduleValue = state.room?.moduleName || 'Default Adventure';
      const label = qs('#module-label');
      if (label) label.textContent = moduleValue;

      const select = qs('#module-select');
      const isOwner = !!state.currentUser?.isOwner;
      if (select) {
        select.disabled = !isOwner || !!state.room?.initializedAt;
        // Ensure select option exists
        const existing = qsa('option', select).map((o) => o.value);
        if (!existing.includes(moduleValue)) {
          const opt = document.createElement('option');
          opt.value = moduleValue;
          opt.textContent = moduleValue;
          select.appendChild(opt);
        }
        select.value = moduleValue;
      }

      const hint = qs('#module-hint');
      if (hint) {
        if (state.room?.initializedAt) {
          hint.textContent = 'Module is locked after initialization.';
        } else if (!isOwner) {
          hint.textContent = 'Only the owner can change the module.';
        } else {
          hint.textContent = '';
        }
      }
    }

    function renderCharacterList() {
      const list = qs('#character-list');
      if (!list) return;

      list.innerHTML = '';

      const locked = !!state.userMembership?.isReady || !!state.room?.initializedAt;
      const selectedId = state.userMembership?.characterId;

      if (!state.userCharacters || state.userCharacters.length === 0) {
        list.innerHTML = '<div class="empty-state">No characters yet.</div>';
        return;
      }

      for (const ch of state.userCharacters) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'character-card';
        btn.dataset.characterId = ch.id;
        const isSelected = selectedId && ch.id === selectedId;
        if (isSelected) {
          btn.style.outline = '2px solid rgba(212, 165, 116, 0.35)';
        }
        btn.innerHTML = `
          <div class="character-name">${escapeHtml(ch.name)}</div>
          <div class="character-summary">${escapeHtml(ch.race)} ${escapeHtml(ch.characterClass)} • Lv.${escapeHtml(ch.level)}</div>
          <div class="character-summary">HP: ${escapeHtml(ch.currentHp)}/${escapeHtml(ch.maxHp)}</div>
        `;

        btn.disabled = locked;
        btn.addEventListener('click', () => onSelectCharacter(ch.id));
        list.appendChild(btn);
      }

      const sel = qs('#character-selection-hint');
      if (sel) {
        if (state.room?.initializedAt) {
          sel.textContent = 'Character locked after initialization.';
        } else {
          sel.textContent = locked
            ? 'Character locked after you are Ready.'
            : 'Click a character to preview; press Ready to lock.';
        }
      }
    }

    function renderCharacterCard() {
      const card = qs('#character-card');
      if (!card) return;

      const selectedId = state.userMembership?.characterId;
      if (!selectedId) {
        card.innerHTML = '<div class="empty-state">Select a character to see details.</div>';
        return;
      }

      const ch = (state.userCharacters || []).find((c) => c.id === selectedId);
      if (!ch) {
        card.innerHTML = '<div class="empty-state">Character not found.</div>';
        return;
      }

      card.innerHTML = `
        <div style="display:flex; gap: var(--space-lg); align-items: flex-start;">
          <div class="panel" style="padding: var(--space-lg); margin: 0; width: 140px; text-align:center;">
            <div style="opacity:0.7; font-size:0.8rem;">Avatar</div>
            <div style="height:90px; border:1px dashed rgba(212,165,116,0.25); border-radius:10px; margin-top: var(--space-sm);"></div>
          </div>
          <div style="flex:1;">
            <div class="character-name" style="font-size:1.1rem;">${escapeHtml(ch.name)}</div>
            <div class="character-summary">${escapeHtml(ch.race)} ${escapeHtml(ch.characterClass)} • Lv.${escapeHtml(ch.level)}</div>
            <div class="character-summary">HP: ${escapeHtml(ch.currentHp)}/${escapeHtml(ch.maxHp)}</div>
            <div class="character-summary">AC: ${escapeHtml(ch.armorClass)}</div>
          </div>
        </div>
      `;
    }

    function renderParty() {
      const list = qs('#party-members');
      if (!list) return;

      list.innerHTML = '';

      const me = state.currentUser?.id;
      for (const m of state.members || []) {
        const row = document.createElement('div');
        row.className = `member-status ${m.isReady ? 'ready' : 'not-ready'}`;

        const left = document.createElement('div');
        left.className = 'member-info';
        left.innerHTML = `
          <span class="member-name">${escapeHtml(m.username)}</span>
          <span class="character-name">— ${escapeHtml(m.characterName || 'No character')}</span>
        `;

        const right = document.createElement('div');
        right.className = 'ready-toggle';

        if (m.userId === me) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `btn-small ${m.isReady ? 'btn-unready' : 'btn-ready'}`;
          btn.textContent = m.isReady ? 'Unready' : 'Ready!';
          btn.disabled = !state.userMembership?.characterId && !m.isReady;
          btn.addEventListener('click', () => onToggleReady());

          right.appendChild(btn);

          const leaveBtn = document.createElement('button');
          leaveBtn.type = 'button';
          leaveBtn.className = 'btn-small';
          if (state.room?.initializedAt) {
            leaveBtn.textContent = 'Return to Lobby';
            leaveBtn.addEventListener('click', () => onReturnToLobby());
          } else {
            leaveBtn.textContent = 'Leave';
            leaveBtn.addEventListener('click', () => onLeave());
          }
          right.appendChild(leaveBtn);
        } else {
          const span = document.createElement('span');
          span.className = 'status-indicator';
          span.textContent = m.isReady ? '✓ Ready' : 'Preparing...';
          right.appendChild(span);
        }

        row.appendChild(left);
        row.appendChild(right);
        list.appendChild(row);
      }

      const startBtn = qs('#start-game-btn') || qs('#enter-room-btn');
      const instructions = qs('#party-instructions');
      if (startBtn) {
        const owner = !!state.currentUser?.isOwner;
        startBtn.style.display = owner ? '' : 'none';
        startBtn.disabled = !state.canStart;
      }
      if (instructions) {
        instructions.textContent = state.canStart
          ? 'Everyone is ready. You may enter the room.'
          : 'Wait for all members to join and become ready.';
      }
    }

    function renderAll() {
      renderModule();
      renderCharacterList();
      renderCharacterCard();
      renderParty();
    }

    async function loadState() {
      renderError('');
      const { data } = await fetchJson(`/api/ready-room/${roomId}/state`);
      if (!data) {
        renderError('Failed to load state');
        return;
      }
      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      if (!data.success) {
        renderError('Failed to load state');
        return;
      }
      const s = data.state;
      state.room = s.room;
      state.currentUser = s.currentUser;
      state.members = s.members;
      state.userMembership = s.userMembership;
      state.userCharacters = s.userCharacters;
      state.selectedCharacterName = s.selectedCharacterName;
      state.canStart = s.canStart;
      renderAll();
    }

    async function onSelectCharacter(characterId) {
      renderError('');
      if (state.room?.initializedAt) {
        renderError('Character is locked after initialization.');
        return;
      }
      if (state.userMembership?.isReady) {
        renderError('You are Ready; unready to change character.');
        return;
      }

      const { data } = await fetchJson(`/api/ready-room/${roomId}/select-character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId }),
      });

      if (!data || !data.success) {
        if (data?.error?.code === 'CHARACTER_LOCKED') {
          renderError('Character is locked after initialization.');
          return;
        }
        renderError('Failed to select character');
        return;
      }

      const s = data.state;
      state.room = s.room;
      state.currentUser = s.currentUser;
      state.members = s.members;
      state.userMembership = s.userMembership;
      state.userCharacters = s.userCharacters;
      state.selectedCharacterName = s.selectedCharacterName;
      state.canStart = s.canStart;
      renderAll();
    }

    async function onToggleReady() {
      renderError('');
      const { data } = await fetchJson(`/api/ready-room/${roomId}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!data) {
        renderError('Failed to update ready status');
        return;
      }
      if (!data.success) {
        if (data.error?.code === 'SELECT_CHARACTER_FIRST') {
          renderError('Select a character first.');
          return;
        }
        renderError('Failed to update ready status');
        return;
      }

      const s = data.state;
      state.room = s.room;
      state.currentUser = s.currentUser;
      state.members = s.members;
      state.userMembership = s.userMembership;
      state.userCharacters = s.userCharacters;
      state.selectedCharacterName = s.selectedCharacterName;
      state.canStart = s.canStart;
      renderAll();
    }

    async function onLeave() {
      if (state.room?.initializedAt) {
        renderError('You cannot leave after initialization. Use Return to Lobby.');
        return;
      }
      if (!confirm('Leave the ready room?')) return;
      const { data } = await fetchJson(`/api/ready-room/${roomId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const redirect = data?.redirect || '/lobby';
      window.location.href = redirect;
    }

    function onReturnToLobby() {
      window.location.href = '/lobby';
    }

    async function onStart() {
      renderError('');
      const { data } = await fetchJson(`/api/ready-room/${roomId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!data) {
        renderError('Failed to start');
        return;
      }
      if (!data.success) {
        const code = data.error?.code;
        if (code === 'NOT_ALL_READY') renderError('Not all members are ready.');
        else if (code === 'MEMBERS_NOT_PRESENT') renderError('All bound members must join this ready room first.');
        else if (code === 'OWNER_NOT_READY') renderError('Owner must be ready.');
        else renderError('Failed to start.');
        return;
      }

      if (data.redirect) {
        window.location.href = data.redirect;
      }
    }

    async function onModuleChange(value) {
      renderError('');
      const { data } = await fetchJson(`/api/ready-room/${roomId}/module`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleName: value }),
      });

      if (!data || !data.success) {
        if (data?.error?.code === 'MODULE_LOCKED') {
          renderError('Module is locked after initialization.');
          return;
        }
        renderError('Failed to update module');
        return;
      }

      const s = data.state;
      state.room = s.room;
      state.currentUser = s.currentUser;
      state.members = s.members;
      state.userMembership = s.userMembership;
      state.userCharacters = s.userCharacters;
      state.selectedCharacterName = s.selectedCharacterName;
      state.canStart = s.canStart;
      renderAll();
    }

    function connectSse() {
      if (eventSource) eventSource.close();
      eventSource = new EventSource(`/api/ready-room/${roomId}/status`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.gameStarted) {
            eventSource.close();
            window.location.href = `/game/${roomId}`;
            return;
          }

          if (typeof data.moduleName !== 'undefined') {
            state.room = state.room || {};
            state.room.moduleName = data.moduleName;
            state.room.lifecycleState = data.lifecycleState;
            state.room.initializedAt = data.initializedAt;
          }

          if (Array.isArray(data.members)) {
            state.members = data.members;
          }

          if (typeof data.canStart === 'boolean') {
            state.canStart = data.canStart;
          }

          renderParty();
          renderModule();
        } catch {
          // ignore
        }
      };

      eventSource.onerror = (err) => {
        console.error('[ReadyRoom] SSE error', err);
      };

      window.addEventListener('beforeunload', () => {
        if (eventSource) eventSource.close();
      });
    }

    // Wire handlers
    const startBtn = qs('#start-game-btn') || qs('#enter-room-btn');
    if (startBtn) startBtn.addEventListener('click', () => onStart());


    const moduleSelect = qs('#module-select');
    if (moduleSelect) {
      moduleSelect.addEventListener('change', () => onModuleChange(moduleSelect.value));
    }

    // Chat (simple append)
    const chatForm = qs('#ready-room-chat-form');
    if (chatForm) {
      chatForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const input = qs('#message-input');
        if (!input) return;
        const msg = input.value.trim();
        if (!msg) return;

        const { data } = await fetchJson(`/api/ready-room/${roomId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg }),
        });

        // Always clear input
        input.value = '';

        const placeholder = qs('#ready-room-chat .chat-placeholder');
        if (placeholder) placeholder.remove();

        const chat = qs('#ready-room-chat');
        if (!chat) return;

        if (!data || !data.success) {
          renderError('Failed to send message');
          return;
        }

        const m = data.message;
        const time = new Date(m.timestamp).toLocaleTimeString();
        const html = `<div class="chat-message"><span class="chat-user">${escapeHtml(m.username)}</span><span class="chat-time"> ${escapeHtml(time)}</span><div class="chat-text">${escapeHtml(m.message)}</div></div>`;
        chat.insertAdjacentHTML('beforeend', html);
      });
    }

    // Init
    loadState().then(connectSse);
  });
})();
