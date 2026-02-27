// public/js/modules/sseBus.js
var SSEBus = class {
  constructor() {
    this.eventSource = null;
    this.roomId = null;
    this.eventHandlers = /* @__PURE__ */ new Map();
    this.messageTypeHandlers = /* @__PURE__ */ new Map();
  }
  connect(roomId) {
    if (this.eventSource && this.roomId === roomId) {
      return;
    }
    this.disconnect();
    this.roomId = roomId;
    this.eventSource = new EventSource(`/api/stream/rooms/${roomId}/stream`);
    this.eventSource.addEventListener("connected", () => {
      this.emit("connected", { roomId });
    });
    this.eventSource.addEventListener("message", (event) => {
      const data = this.safeParse(event.data);
      if (!data)
        return;
      console.log("[SSEBus] Received message:", data);
      if (data.type) {
        console.log("[SSEBus] Emitting message type:", data.type);
        this.emitMessageType(data.type, data);
      }
      this.emit("message", data);
    });
    this.eventSource.addEventListener("chat", (event) => {
      const data = this.safeParse(event.data);
      if (!data)
        return;
      this.emit("chat", data);
    });
    this.eventSource.addEventListener("members-updated", (event) => {
      const data = this.safeParse(event.data);
      if (!data)
        return;
      this.emit("members-updated", data);
    });
    this.eventSource.onerror = (error) => {
      this.emit("error", error);
    };
  }
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.roomId = null;
    }
  }
  on(eventName, handler) {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, /* @__PURE__ */ new Set());
    }
    const handlers = this.eventHandlers.get(eventName);
    handlers.add(handler);
    return () => handlers.delete(handler);
  }
  onMessageType(type, handler) {
    if (!this.messageTypeHandlers.has(type)) {
      this.messageTypeHandlers.set(type, /* @__PURE__ */ new Set());
    }
    const handlers = this.messageTypeHandlers.get(type);
    handlers.add(handler);
    console.log(`[SSEBus] Registered handler for message type: ${type} (total: ${handlers.size})`);
    return () => {
      handlers.delete(handler);
      console.log(`[SSEBus] Unregistered handler for message type: ${type}`);
    };
  }
  emit(eventName, payload) {
    const handlers = this.eventHandlers.get(eventName);
    if (!handlers)
      return;
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (error) {
        console.error("[SSEBus] handler error:", error);
      }
    }
  }
  emitMessageType(type, payload) {
    const handlers = this.messageTypeHandlers.get(type);
    console.log(`[SSEBus] emitMessageType called for type: ${type}, handlers count: ${handlers ? handlers.size : 0}`);
    if (!handlers) {
      console.warn(`[SSEBus] No handlers registered for message type: ${type}`);
      return;
    }
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (error) {
        console.error("[SSEBus] message handler error:", error);
      }
    }
  }
  safeParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error("[SSEBus] Failed to parse event payload:", error);
      return null;
    }
  }
};
var sseBus = new SSEBus();

// public/js/modules/api.js
function normalizeOptions(options = {}) {
  const normalized = { ...options };
  normalized.credentials = options.credentials || "include";
  normalized.headers = {
    ...options.headers || {}
  };
  if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
    normalized.body = JSON.stringify(options.body);
    normalized.headers["Content-Type"] = normalized.headers["Content-Type"] || "application/json";
  }
  return normalized;
}
async function fetchResponse(url, options = {}) {
  const normalized = normalizeOptions(options);
  return fetch(url, normalized);
}
async function fetchJson(url, options = {}) {
  const normalized = normalizeOptions(options);
  normalized.headers = {
    Accept: "application/json",
    ...normalized.headers
  };
  const response = await fetch(url, normalized);
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }
  return { ok: response.ok, status: response.status, data, response };
}
async function fetchText(url, options = {}) {
  const normalized = normalizeOptions(options);
  normalized.headers = {
    Accept: "text/html, */*",
    ...normalized.headers
  };
  const response = await fetch(url, normalized);
  const text = await response.text();
  return { ok: response.ok, status: response.status, text, response };
}

// public/js/modules/store.js
var initialState = {
  roomId: null,
  streaming: {
    active: false,
    targetElementId: null,
    buffer: [],
    fullText: "",
    lastCompleteAt: null
  },
  members: {
    byUserId: {},
    order: [],
    version: 0
  },
  chat: {
    lastSeenTimestamp: 0
  },
  notes: {
    byId: {},
    order: [],
    version: 0
  },
  combat: {
    entries: [],
    seenKeys: /* @__PURE__ */ new Set(),
    maxEntries: 200,
    maxSeenKeys: 500
  },
  statusPanel: {
    lastLoadedAt: null,
    loading: false,
    requestSeq: 0
  }
};
var Store = class {
  constructor(initialState2) {
    this.state = {
      roomId: initialState2.roomId,
      streaming: { ...initialState2.streaming, buffer: [] },
      members: {
        byUserId: {},
        order: [],
        version: 0
      },
      chat: { ...initialState2.chat },
      notes: {
        byId: {},
        order: [],
        version: 0
      },
      combat: {
        entries: [],
        seenKeys: /* @__PURE__ */ new Set(),
        // Preserve Set object
        maxEntries: initialState2.combat.maxEntries,
        maxSeenKeys: initialState2.combat.maxSeenKeys
      },
      statusPanel: { ...initialState2.statusPanel }
    };
    this.listeners = /* @__PURE__ */ new Set();
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
      case "INIT_ROOM":
        return { ...state, roomId: action.payload };
      case "STREAMING_START":
        return {
          ...state,
          streaming: {
            ...state.streaming,
            active: true,
            targetElementId: action.payload.targetElementId || null,
            buffer: [],
            fullText: ""
          }
        };
      case "STREAMING_SET_TARGET":
        return {
          ...state,
          streaming: {
            ...state.streaming,
            targetElementId: action.payload
          }
        };
      case "STREAMING_CHUNK":
        return {
          ...state,
          streaming: {
            ...state.streaming,
            buffer: [...state.streaming.buffer, action.payload],
            fullText: state.streaming.fullText + action.payload
          }
        };
      case "STREAMING_FLUSH_BUFFER":
        return {
          ...state,
          streaming: {
            ...state.streaming,
            buffer: []
          }
        };
      case "STREAMING_RESET":
        return {
          ...state,
          streaming: {
            active: false,
            targetElementId: null,
            buffer: [],
            fullText: "",
            lastCompleteAt: null
          }
        };
      case "STREAMING_COMPLETE":
        return {
          ...state,
          streaming: {
            ...state.streaming,
            active: false,
            lastCompleteAt: Date.now()
          }
        };
      case "MEMBERS_UPDATED": {
        const members = action.payload || [];
        const byUserId = {};
        const order = [];
        members.forEach((m) => {
          byUserId[m.userId] = m;
          order.push(m.userId);
        });
        return {
          ...state,
          members: {
            byUserId,
            order,
            version: state.members.version + 1
          }
        };
      }
      case "NOTES_SYNCED": {
        const notes = action.payload || [];
        const byId = {};
        const order = [];
        notes.forEach((n) => {
          byId[n.id] = n;
          order.push(n.id);
        });
        return {
          ...state,
          notes: {
            byId,
            order,
            version: state.notes.version + 1
          }
        };
      }
      case "COMBAT_ADD_ENTRY": {
        const key = action.payload.key;
        if (!(state.combat.seenKeys instanceof Set)) {
          console.error("[Store] seenKeys is not a Set! Reinitializing...");
          state.combat.seenKeys = /* @__PURE__ */ new Set();
        }
        if (state.combat.seenKeys.has(key)) {
          console.log("[Store] Duplicate combat entry detected, skipping:", key);
          return state;
        }
        const newSeenKeys = new Set(state.combat.seenKeys);
        newSeenKeys.add(key);
        if (newSeenKeys.size > state.combat.maxSeenKeys) {
          const arr = Array.from(newSeenKeys);
          const toRemove = arr.slice(0, arr.length - state.combat.maxSeenKeys);
          toRemove.forEach((k) => newSeenKeys.delete(k));
        }
        const newEntries = [action.payload.entry, ...state.combat.entries].slice(0, state.combat.maxEntries);
        return {
          ...state,
          combat: {
            ...state.combat,
            entries: newEntries,
            seenKeys: newSeenKeys
          }
        };
      }
      case "STATUS_PANEL_LOADING":
        return {
          ...state,
          statusPanel: {
            ...state.statusPanel,
            loading: true,
            requestSeq: state.statusPanel.requestSeq + 1
          }
        };
      case "STATUS_PANEL_LOADED":
        if (action.payload.seq < state.statusPanel.requestSeq) {
          return state;
        }
        return {
          ...state,
          statusPanel: {
            ...state.statusPanel,
            loading: false,
            lastLoadedAt: Date.now()
          }
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
    if (this.pendingRender)
      return;
    this.pendingRender = true;
    requestAnimationFrame(() => {
      this.pendingRender = false;
      this.listeners.forEach((listener) => {
        try {
          listener(this.state);
        } catch (error) {
          console.error("[Store] Listener error:", error);
        }
      });
    });
  }
};
var store = new Store(initialState);

// public/js/modules/saves.js
var SaveMenuManager = class {
  constructor(roomId) {
    this.roomId = roomId;
    this.container = document.getElementById("save-menu");
    if (!this.container)
      return;
    this.bindEvents();
    this.refreshMenu();
  }
  bindEvents() {
    this.container.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button)
        return;
      const action = button.dataset.action;
      const slotName = button.dataset.slot;
      if (action === "save") {
        this.handleSave();
      } else if (action === "load" && slotName) {
        this.handleLoad(slotName);
      } else if (action === "delete" && slotName) {
        this.handleDelete(slotName);
      }
    });
  }
  setStatus(message, isError = false) {
    const status = this.container.querySelector(".save-status");
    if (!status)
      return;
    status.textContent = message;
    status.classList.toggle("error", isError);
  }
  async refreshMenu() {
    try {
      const { ok, text } = await fetchText(`/partials/room/${this.roomId}/saves`);
      if (!ok)
        throw new Error("Failed to load saves");
      const html = text;
      this.container.innerHTML = html;
      this.setStatus("");
    } catch (error) {
      console.error("[SaveMenu] Refresh failed:", error);
      this.setStatus("Failed to load saves", true);
    }
  }
  getFormValues() {
    const slotInput = this.container.querySelector('input[name="slotName"]');
    const descInput = this.container.querySelector('input[name="description"]');
    const slotName = slotInput ? slotInput.value.trim() : "";
    const description = descInput ? descInput.value.trim() : "";
    return {
      slotName: slotName || void 0,
      description: description || void 0
    };
  }
  async handleSave() {
    const payload = this.getFormValues();
    this.setStatus("Saving...");
    try {
      const { ok } = await fetchJson(`/api/saves/rooms/${this.roomId}/save`, {
        method: "POST",
        body: payload
      });
      if (!ok)
        throw new Error("Save failed");
      this.setStatus("Save complete.");
      await this.refreshMenu();
    } catch (error) {
      console.error("[SaveMenu] Save failed:", error);
      this.setStatus("Save failed.", true);
    }
  }
  async handleLoad(slotName) {
    if (!confirm(`Load game from slot "${slotName}"? This will replace current game state and reload the page.`))
      return;
    this.setStatus("Loading...");
    try {
      const { ok } = await fetchJson(`/api/saves/rooms/${this.roomId}/load`, {
        method: "POST",
        body: { slotName }
      });
      if (!ok)
        throw new Error("Load failed");
      this.setStatus("Load complete. Refreshing page...");
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error("[SaveMenu] Load failed:", error);
      this.setStatus("Load failed.", true);
    }
  }
  async handleDelete(slotName) {
    if (!confirm(`Delete slot "${slotName}"?`))
      return;
    this.setStatus("Deleting...");
    try {
      const { ok } = await fetchJson(`/api/saves/rooms/${this.roomId}/${encodeURIComponent(slotName)}`, {
        method: "DELETE"
      });
      if (!ok)
        throw new Error("Delete failed");
      this.setStatus("Delete complete.");
      await this.refreshMenu();
    } catch (error) {
      console.error("[SaveMenu] Delete failed:", error);
      this.setStatus("Delete failed.", true);
    }
  }
  async refreshStory() {
    const story = document.getElementById("story-output");
    if (!story)
      return;
    const { ok, text } = await fetchText(`/partials/room/${this.roomId}/story`);
    if (!ok)
      throw new Error("Failed to refresh story");
    story.innerHTML = text;
    story.scrollTop = story.scrollHeight;
  }
  async refreshStatus() {
    const statusBody = document.getElementById("status-body");
    if (!statusBody)
      return;
    const { ok, text } = await fetchText(`/partials/room/${this.roomId}/status`);
    if (!ok)
      throw new Error("Failed to refresh status");
    statusBody.innerHTML = text;
  }
};

// public/js/modules/game.js
var TRPGClient = class {
  constructor(roomId) {
    this.roomId = roomId;
    this.eventSource = null;
    this.messageBuffer = [];
    this.isProcessing = false;
    this.currentStreamingElementId = null;
    this.currentStreamingContent = "";
    this.unsubscribeHandlers = [];
    this.processedElementIds = /* @__PURE__ */ new Set();
  }
  /**
   * Set the current element to receive streaming updates
   */
  setStreamingElementId(id, force = false) {
    if (!force && this.processedElementIds.has(id)) {
      console.log("[TRPGClient] Element already processed, skipping:", id);
      return;
    }
    const element = document.getElementById(id);
    if (!element) {
      console.warn("[TRPGClient] Element not found:", id);
      return;
    }
    const hasContent = Array.from(element.childNodes).some((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim())
        return true;
      if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains("streaming-indicator"))
        return true;
      return false;
    });
    if (hasContent && !force) {
      console.log("[TRPGClient] Element already has content, skipping:", id);
      this.processedElementIds.add(id);
      return;
    }
    console.log("[TRPGClient] Setting streaming target:", id);
    this.currentStreamingElementId = id;
    this.currentStreamingContent = "";
    this.processedElementIds.add(id);
    store.dispatch({ type: "STREAMING_SET_TARGET", payload: id });
    this.flushStreamingBuffer();
  }
  /**
   * Flush buffered chunks to the target element
   */
  flushStreamingBuffer() {
    const state = store.getState();
    const buffer = state.streaming.buffer;
    const target = this.currentStreamingElementId ? document.getElementById(this.currentStreamingElementId) : null;
    if (!target || buffer.length === 0)
      return;
    const indicator = target.querySelector(".streaming-indicator");
    if (indicator)
      indicator.remove();
    buffer.forEach((chunk) => {
      target.appendChild(document.createTextNode(chunk));
    });
    const output = document.getElementById("story-output");
    if (output)
      output.scrollTop = output.scrollHeight;
    store.dispatch({ type: "STREAMING_FLUSH_BUFFER" });
  }
  /**
   * Initialize SSE connection for real-time updates
   */
  connectSSE(handlers = {}) {
    this.unsubscribeHandlers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeHandlers = [];
    sseBus.connect(this.roomId);
    this.unsubscribeHandlers.push(
      sseBus.onMessageType("streaming-chunk", (data) => this.handleStreamingChunk(data))
    );
    this.unsubscribeHandlers.push(
      sseBus.onMessageType("streaming-complete", (data) => this.handleStreamingComplete(data))
    );
    this.unsubscribeHandlers.push(
      sseBus.onMessageType("streaming-error", (data) => this.handleStreamingError(data))
    );
    this.unsubscribeHandlers.push(
      sseBus.on("message", (data) => {
        if (data?.type)
          return;
        this.appendMessage(data?.chunk || data?.content || data);
      })
    );
    if (handlers.onChat) {
      this.unsubscribeHandlers.push(
        sseBus.on("chat", (message) => handlers.onChat?.(message))
      );
    }
    this.unsubscribeHandlers.push(
      sseBus.on("error", (error) => {
        console.error("SSE error:", error);
      })
    );
  }
  /**
   * Handle an incoming streaming chunk
   */
  handleStreamingChunk(data) {
    const chunk = data.content;
    if (!chunk)
      return;
    this.currentStreamingContent += chunk;
    store.dispatch({ type: "STREAMING_CHUNK", payload: chunk });
    const target = this.currentStreamingElementId ? document.getElementById(this.currentStreamingElementId) : null;
    if (target) {
      const indicator = target.querySelector(".streaming-indicator");
      if (indicator)
        indicator.remove();
      target.appendChild(document.createTextNode(chunk));
      const output = document.getElementById("story-output");
      if (output)
        output.scrollTop = output.scrollHeight;
    }
  }
  /**
   * Handle streaming completion
   */
  async handleStreamingComplete(data) {
    console.log("[TRPGClient] Streaming complete");
    const target = this.currentStreamingElementId ? document.getElementById(this.currentStreamingElementId) : null;
    const finalContent = data.content || this.currentStreamingContent;
    if (target && finalContent) {
      try {
        const { ok, data: data2 } = await fetchJson("/api/messages/markdown", {
          method: "POST",
          body: { content: finalContent }
        });
        if (ok && data2?.html) {
          target.innerHTML = data2.html;
          const output = document.getElementById("story-output");
          if (output) {
            output.scrollTop = output.scrollHeight;
          }
        } else {
          console.warn("[TRPGClient] Markdown render request failed");
        }
      } catch (err) {
        console.error("[TRPGClient] Failed to render markdown:", err);
      }
    } else if (!target) {
      console.warn("[TRPGClient] No target element for markdown rendering");
    }
    this.setProcessing(false);
    this.refreshStatus();
    this.currentStreamingElementId = null;
    this.currentStreamingContent = "";
    store.dispatch({ type: "STREAMING_COMPLETE" });
  }
  /**
   * Handle streaming error
   */
  handleStreamingError(data) {
    console.error("[TRPGClient] Streaming error:", data.error);
    const target = this.currentStreamingElementId ? document.getElementById(this.currentStreamingElementId) : null;
    if (target) {
      target.innerHTML = "";
      const errorDiv = document.createElement("div");
      errorDiv.className = "error-message";
      errorDiv.textContent = `Error: ${data.error || "Unknown error"}`;
      target.appendChild(errorDiv);
    }
    this.setProcessing(false);
  }
  /**
   * Disconnect SSE
   */
  disconnectSSE() {
    this.unsubscribeHandlers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeHandlers = [];
  }
  /**
   * Append message to story output (Legacy fallback)
   */
  appendMessage(content) {
    const output = document.getElementById("story-output");
    if (!output)
      return;
    const msgDiv = document.createElement("div");
    msgDiv.className = "message assistant streaming";
    msgDiv.textContent = typeof content === "string" ? content : JSON.stringify(content);
    output.appendChild(msgDiv);
    output.scrollTop = output.scrollHeight;
    setTimeout(() => {
      msgDiv.classList.remove("streaming");
    }, 100);
  }
  /**
   * Set processing state
   */
  setProcessing(processing) {
    this.isProcessing = processing;
    const actionForm = document.getElementById("action-form");
    const input = actionForm ? actionForm.querySelector("#action-input") : document.querySelector("#action-input");
    const button = actionForm ? actionForm.querySelector('button[type="submit"]') : null;
    const spinner = document.getElementById("input-spinner");
    if (input) {
      input.disabled = processing;
    }
    if (button) {
      button.disabled = processing;
    }
    if (spinner) {
      spinner.classList.toggle("visible", processing);
    }
  }
  /**
   * Send action via fetch
   */
  async sendAction(form) {
    if (this.isProcessing)
      return;
    const formData = new FormData(form);
    const action = formData.get("action");
    if (!action)
      return;
    console.log("[TRPGClient] Starting new action, resetting streaming state");
    this.currentStreamingElementId = null;
    this.currentStreamingContent = "";
    store.dispatch({ type: "STREAMING_RESET" });
    this.setProcessing(true);
    const input = form.querySelector("#action-input");
    if (input) {
      input.value = "";
      input.focus();
    }
    try {
      const response = await fetchResponse("/api/rooms/collect-action", {
        method: "POST",
        headers: {
          "X-Requested-With": "XMLHttpRequest"
        },
        body: Object.fromEntries(formData.entries())
      });
      if (!response.ok) {
        throw new Error("Failed to send action");
      }
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        const html = await response.text();
        const output = document.getElementById("story-output");
        if (output) {
          output.insertAdjacentHTML("beforeend", html);
          output.scrollTop = output.scrollHeight;
        }
      } else {
        const data = await response.json();
        console.log("Action recorded:", data);
      }
    } catch (error) {
      console.error("Error sending action:", error);
      alert("Failed to send action. Please try again.");
      this.setProcessing(false);
    }
  }
  /**
   * Append user message to output
   */
  appendUserMessage(content) {
    const output = document.getElementById("story-output");
    if (!output)
      return;
    const msgDiv = document.createElement("div");
    msgDiv.className = "message user";
    msgDiv.innerHTML = `<div class="message-header">You</div><div class="message-content">${this.escapeHtml(content)}</div>`;
    output.appendChild(msgDiv);
    output.scrollTop = output.scrollHeight;
  }
  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  /**
   * Refresh status bar
   */
  async refreshStatus() {
    if (typeof window.loadStatusPanel === "function") {
      return window.loadStatusPanel();
    }
  }
};
var CharacterForm = class {
  constructor() {
    this.initAbilityScoreModifiers();
    this.initPointBuy();
  }
  /**
   * Update modifier display when ability scores change
   */
  initAbilityScoreModifiers() {
    const inputs = document.querySelectorAll(".ability-score input");
    inputs.forEach((input) => {
      input.addEventListener("input", () => {
        this.updateModifier(input);
        this.updatePointBuyTotal();
      });
    });
  }
  /**
   * Update modifier display for an ability score
   */
  updateModifier(input) {
    const score = parseInt(input.value) || 10;
    const modifier = Math.floor((score - 10) / 2);
    const modifierSpan = input.parentElement.querySelector(".modifier");
    if (modifierSpan) {
      modifierSpan.textContent = modifier >= 0 ? `+${modifier}` : `${modifier}`;
    }
  }
  /**
   * Initialize point buy system (optional)
   */
  initPointBuy() {
  }
  /**
   * Update point buy total
   */
  updatePointBuyTotal() {
  }
};

// public/js/modules/notes.js
var PlayerNotesManager = class {
  constructor(roomId, userId) {
    this.roomId = roomId;
    this.userId = userId;
    this.notesList = null;
    this.input = null;
    this.addButton = null;
  }
  init() {
    this.notesList = document.getElementById("player-notes-list");
    this.input = document.querySelector(".note-input");
    this.addButton = document.querySelector(".note-add");
    if (!this.notesList || !this.input || !this.addButton) {
      console.warn("[PlayerNotes] Required DOM elements not found");
      return;
    }
    this.setupEventListeners();
    this.setupExistingNoteHandlers();
    this.setupSSEListeners();
    this.updateEmptyState();
    console.log("[PlayerNotes] Initialized for room", this.roomId);
  }
  setupExistingNoteHandlers() {
    if (this.notesList) {
      const newList = this.notesList.cloneNode(true);
      this.notesList.replaceWith(newList);
      this.notesList = newList;
      this.notesList.addEventListener("click", (e) => {
        const deleteBtn = e.target.closest(".note-delete");
        if (deleteBtn) {
          e.preventDefault();
          e.stopPropagation();
          const noteElement = deleteBtn.closest(".note-item");
          const noteId = deleteBtn.getAttribute("data-note-id");
          if (noteElement && noteId) {
            this.handleDeleteNote(noteElement, noteId);
          }
        }
      });
    }
  }
  setupEventListeners() {
    this.addButton.addEventListener("click", (e) => this.handleAddNote(e));
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleAddNote(e);
      }
    });
    this.input.addEventListener("input", () => {
      this.input.style.height = "auto";
      this.input.style.height = this.input.scrollHeight + "px";
    });
  }
  setupSSEListeners() {
    console.log("[PlayerNotes] SSE listeners disabled for now");
  }
  async handleAddNote(e) {
    e.preventDefault();
    e.stopPropagation();
    if (this.addButton.disabled)
      return;
    const note = this.input.value.trim();
    if (!note)
      return;
    const trimmed = note.slice(0, 200);
    this.addButton.disabled = true;
    this.addButton.textContent = "...";
    const originalValue = this.input.value;
    this.input.value = "";
    try {
      const { ok, data } = await fetchJson(`/api/rooms/${this.roomId}/notes`, {
        method: "POST",
        body: { note: trimmed }
      });
      if (ok && data?.success) {
        const newNote = data.notes[data.notes.length - 1];
        if (newNote) {
          this.addNoteToDOM(newNote);
        }
      } else {
        this.input.value = originalValue;
        alert(data?.error || "Failed to add note");
      }
    } catch (error) {
      console.error("[PlayerNotes] Failed to add note:", error);
      this.input.value = originalValue;
      alert("Failed to add note");
    } finally {
      this.addButton.disabled = false;
      this.addButton.textContent = "Add";
      this.input.style.height = "auto";
      this.input.focus();
    }
  }
  async handleDeleteNote(noteElement, noteId) {
    if (noteElement.dataset.deleting === "true")
      return;
    noteElement.dataset.deleting = "true";
    noteElement.style.opacity = "0.5";
    try {
      const { ok, data } = await fetchJson(`/api/rooms/${this.roomId}/notes/${noteId}`, {
        method: "DELETE"
      });
      if (ok && data?.success) {
        noteElement.remove();
        this.updateEmptyState();
      } else {
        noteElement.dataset.deleting = "";
        noteElement.style.opacity = "1";
        alert(data?.error || "Failed to delete note");
      }
    } catch (error) {
      console.error("[PlayerNotes] Failed to delete note:", error);
      noteElement.dataset.deleting = "";
      noteElement.style.opacity = "1";
      alert("Failed to delete note");
    } finally {
      setTimeout(() => {
        if (noteElement.parentNode) {
          delete noteElement.dataset.deleting;
        }
      }, 100);
    }
  }
  addNoteToDOM(note) {
    const noteElement = document.createElement("div");
    noteElement.className = "note-item";
    noteElement.dataset.noteId = note.id;
    noteElement.innerHTML = `
      <span class="note-text">${this.escapeHtml(note.content)}</span>
      <button class="note-delete" data-note-id="${note.id}" title="Delete note">\xD7</button>
    `;
    const emptyState = this.notesList.querySelector(".empty-state");
    if (emptyState) {
      emptyState.style.display = "none";
    }
    this.notesList.appendChild(noteElement);
  }
  updateEmptyState() {
    const hasNotes = this.notesList.querySelectorAll(".note-item").length > 0;
    const emptyState = this.notesList.querySelector(".empty-state");
    if (emptyState) {
      emptyState.style.display = hasNotes ? "none" : "block";
    }
  }
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
};

// public/js/modules/chat.js
var ChatManager = class {
  constructor(roomId) {
    this.roomId = roomId;
    this.currentUserId = this.getCurrentUserId();
    this.messagesContainer = document.getElementById("chat-messages");
  }
  getCurrentUserId() {
    const metaTag = document.querySelector('meta[name="user-id"]');
    return metaTag ? metaTag.getAttribute("content") : null;
  }
  async loadInitialMessages() {
    if (!this.messagesContainer)
      return;
    try {
      const { ok, data } = await fetchJson(`/api/chat/rooms/${this.roomId}/messages?limit=50`);
      if (ok && data?.success && data.messages) {
        this.messagesContainer.innerHTML = "";
        data.messages.forEach((msg) => this.renderMessage(msg));
        this.scrollToBottom();
      } else {
        this.messagesContainer.innerHTML = '<div class="chat-loading">No messages yet</div>';
      }
    } catch (error) {
      console.error("[Chat] Failed to load messages:", error);
      if (this.messagesContainer) {
        this.messagesContainer.innerHTML = '<div class="chat-loading">Failed to load messages</div>';
      }
    }
  }
  /**
   * Render a single chat message
   * @param {Object} message - Message object
   */
  renderMessage(message) {
    if (!this.messagesContainer)
      return;
    const loading = this.messagesContainer.querySelector(".chat-loading");
    if (loading)
      loading.remove();
    const isSelf = this.currentUserId === message.playerId;
    const isSystem = message.type === "system";
    const messageDiv = document.createElement("div");
    messageDiv.className = `chat-message${isSelf ? " self" : ""}${isSystem ? " system" : ""}`;
    messageDiv.dataset.messageId = message.id;
    const time = new Date(message.timestamp);
    const timeStr = time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    messageDiv.innerHTML = `
      <div class="chat-message-header">
        <span class="chat-message-player">${this.escapeHtml(message.playerName)}</span>
        <span class="chat-message-time">${timeStr}</span>
      </div>
      <div class="chat-message-text">${this.escapeHtml(message.message)}</div>
    `;
    this.messagesContainer.appendChild(messageDiv);
  }
  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  /**
   * Setup chat form handlers
   */
  setupFormHandler() {
    const form = document.getElementById("chat-form");
    if (!form)
      return;
    const textarea = form.querySelector('textarea[name="message"]');
    if (!textarea)
      return;
    const autoResize = () => {
      textarea.style.height = "42px";
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 42), 120);
      textarea.style.height = newHeight + "px";
    };
    textarea.addEventListener("input", autoResize);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.dispatchEvent(new Event("submit"));
      }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const messageContent = textarea.value.trim();
      if (!messageContent)
        return;
      const originalMessage = messageContent;
      textarea.value = "";
      autoResize();
      const button = form.querySelector("button");
      if (button)
        button.disabled = true;
      try {
        const { ok, data } = await fetchJson(`/api/chat/rooms/${this.roomId}/send`, {
          method: "POST",
          body: { message: messageContent }
        });
        if (!ok) {
          console.error("[Chat] Failed to send:", data?.error);
          textarea.value = originalMessage;
          autoResize();
        }
      } catch (error) {
        console.error("[Chat] Error sending:", error);
        textarea.value = originalMessage;
        autoResize();
      } finally {
        if (button)
          button.disabled = false;
        textarea.focus();
      }
    });
  }
};

// public/js/modules/members.js
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}
var RoomMembersManager = class {
  constructor(roomId) {
    this.roomId = roomId;
    this.membersList = document.getElementById("members-list");
    this.currentUserId = this.getCurrentUserId();
    this.unsubscribe = null;
  }
  getCurrentUserId() {
    const metaTag = document.querySelector('meta[name="user-id"]');
    return metaTag ? metaTag.getAttribute("content") : null;
  }
  async loadInitialMembers() {
    if (!this.membersList)
      return;
    try {
      const { ok, data } = await fetchJson(`/api/rooms/${this.roomId}/members`);
      if (ok && data?.success) {
        this.renderMembers(data.members, data.maxPlayers);
      } else {
        this.renderError("Failed to load members");
      }
    } catch (error) {
      console.error("[Members] Failed to load:", error);
      this.renderError("Failed to load members");
    }
  }
  connect() {
    sseBus.connect(this.roomId);
    this.unsubscribe = sseBus.on("members-updated", (data) => {
      if (!data)
        return;
      this.renderMembers(data.members || [], data.maxPlayers || 0);
    });
  }
  renderMembers(members, maxPlayers) {
    if (!this.membersList)
      return;
    const loading = this.membersList.querySelector(".members-loading");
    if (loading)
      loading.remove();
    const error = this.membersList.querySelector(".members-error");
    if (error)
      error.remove();
    const safeMax = maxPlayers || members.length || 0;
    this.membersList.innerHTML = `
      <div class="members-count">${members.length}/${safeMax}</div>
    `;
    if (members.length === 0) {
      this.membersList.innerHTML += '<div class="empty-members">No members yet</div>';
      return;
    }
    members.forEach((member) => {
      const isSelf = this.currentUserId === member.userId;
      const div = document.createElement("div");
      div.className = `member-item${isSelf ? " self" : ""}`;
      div.innerHTML = `
        <span class="member-name">${escapeHtml(member.username)}</span>${member.characterName ? ` <span class="member-character">(${escapeHtml(member.characterName)})</span>` : ""}
      `;
      this.membersList.appendChild(div);
    });
  }
  renderError(message) {
    if (!this.membersList)
      return;
    const loading = this.membersList.querySelector(".members-loading");
    if (loading)
      loading.remove();
    this.membersList.innerHTML = `<div class="members-error">${escapeHtml(message)}</div>`;
  }
  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
};

// public/js/modules/combatEvents.js
function escapeHtml2(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}
function getCombatTargets() {
  return {
    fullLog: document.getElementById("combat-log-full"),
    status: document.getElementById("turn-gate-status")
  };
}
function renderDiceRollEntry(rollData) {
  const entry = document.createElement("div");
  const success = !!rollData?.success;
  entry.className = `dice-roll-entry ${success ? "success" : "failure"}`;
  const characterName = escapeHtml2(rollData?.characterName || "Unknown");
  const checkType = escapeHtml2(rollData?.checkType || "Check");
  const ability = escapeHtml2(rollData?.ability || "");
  const dc = rollData?.dc !== void 0 ? `DC ${escapeHtml2(rollData.dc)}` : "";
  const formula = escapeHtml2(rollData?.roll?.formula || "");
  const total = rollData?.roll?.total !== void 0 ? rollData.roll.total : "";
  const reason = escapeHtml2(rollData?.reason || "");
  entry.innerHTML = `
    <div class="roll-header">
      <span class="character-name">${characterName}</span>
      <span class="check-type">${checkType.replace("_", " ")}</span>
    </div>
    <div class="roll-detail">
      <span class="ability">${ability}</span>
      <span class="dc">${dc}</span>
    </div>
    <div class="roll-detail">
      <span>${formula} = <strong>${escapeHtml2(total)}</strong></span>
      <span class="result ${success ? "success" : "failure"}">${success ? "\u2713 Success" : "\u2717 Failure"}</span>
    </div>
    ${reason ? `<div class="roll-reason">${reason}</div>` : ""}
  `;
  return entry;
}
function renderActionRestriction(eventData) {
  const { status } = getCombatTargets();
  if (!status)
    return;
  const reason = escapeHtml2(eventData?.reason || "Action restricted");
  const allowed = Array.isArray(eventData?.allowedCharacterIds) ? eventData.allowedCharacterIds.join(", ") : "";
  status.innerHTML = `
    <div class="action-restriction">
      <div class="action-restriction-title">Action Restricted</div>
      <div class="action-restriction-reason">${reason}</div>
      ${allowed ? `<div class="action-restriction-allowed">Allowed: ${escapeHtml2(allowed)}</div>` : ""}
    </div>
  `;
}
function generateDedupeKey(type, data) {
  return `${type}-${JSON.stringify(data)}`;
}
function renderDiceRoll(rollData) {
  console.log("[CombatEvents] renderDiceRoll called with:", rollData);
  const key = generateDedupeKey("dice-roll", rollData);
  const entry = renderDiceRollEntry(rollData);
  store.dispatch({
    type: "COMBAT_ADD_ENTRY",
    payload: { key, entry: rollData }
  });
  const { fullLog } = getCombatTargets();
  console.log("[CombatEvents] fullLog element:", fullLog);
  console.log("[CombatEvents] Checking for #combat-log-full:", document.getElementById("combat-log-full"));
  if (fullLog) {
    const emptyState = fullLog.querySelector(".empty-state");
    if (emptyState) {
      emptyState.remove();
      console.log("[CombatEvents] Removed empty state");
    }
    fullLog.prepend(entry);
    console.log("[CombatEvents] Added dice roll entry to combat log");
  } else {
    console.error("[CombatEvents] fullLog element not found! Looking for #combat-log-full");
    console.error(
      '[CombatEvents] All elements with id containing "combat":',
      Array.from(document.querySelectorAll('[id*="combat"]')).map((el) => el.id)
    );
  }
}
function registerCombatHandlers(sseBus2) {
  if (!sseBus2) {
    console.error("[CombatEvents] sseBus is null or undefined!");
    return () => {
    };
  }
  console.log("[CombatEvents] Registering combat handlers");
  const unsubDice = sseBus2.onMessageType("dice-roll", (payload) => {
    console.log("[CombatEvents] dice-roll event received:", payload);
    if (payload?.data) {
      renderDiceRoll(payload.data);
    } else {
      console.warn("[CombatEvents] dice-roll payload has no data:", payload);
    }
  });
  const unsubRestriction = sseBus2.onMessageType("action-restriction", (payload) => {
    console.log("[CombatEvents] action-restriction event received:", payload);
    renderActionRestriction(payload);
  });
  console.log("[CombatEvents] Combat handlers registered successfully");
  return () => {
    console.log("[CombatEvents] Unregistering combat handlers");
    unsubDice?.();
    unsubRestriction?.();
  };
}

// public/js/game-client.js
var playerNotesManager = null;
var roomChat = null;
var roomMembers = null;
var unregisterCombatHandlers = null;
function rehydrateStatusSubtree(roomId, userId) {
  if (userId && roomId) {
    playerNotesManager = new PlayerNotesManager(roomId, userId);
    playerNotesManager.init();
  }
}
window.loadStatusPanel = async function() {
  const statusPanel = document.getElementById("status-panel");
  if (!statusPanel)
    return;
  const gamePage = document.querySelector(".game-container");
  const roomId = gamePage?.getAttribute("data-room-id");
  if (!roomId)
    return;
  const state = store.getState();
  const currentSeq = state.statusPanel.requestSeq;
  store.dispatch({ type: "STATUS_PANEL_LOADING" });
  const requestSeq = store.getState().statusPanel.requestSeq;
  try {
    const { ok, text } = await fetchText(`/partials/room/${roomId}/status`);
    if (ok) {
      const html = text;
      const statusBody = document.getElementById("status-body");
      if (statusBody) {
        statusBody.innerHTML = html;
        store.dispatch({
          type: "STATUS_PANEL_LOADED",
          payload: { seq: requestSeq }
        });
        const userMeta = document.querySelector('meta[name="user-id"]');
        const userId = userMeta ? userMeta.getAttribute("content") : null;
        rehydrateStatusSubtree(roomId, userId);
      }
    }
  } catch (error) {
    console.error("[Status Panel] Failed to load:", error);
    store.dispatch({
      type: "STATUS_PANEL_LOADED",
      payload: { seq: requestSeq }
    });
  }
};
document.addEventListener("DOMContentLoaded", () => {
  const gameContainer = document.querySelector(".game-container");
  const roomId = gameContainer?.dataset.roomId;
  if (roomId) {
    store.dispatch({ type: "INIT_ROOM", payload: roomId });
    window.gameClient = new TRPGClient(roomId);
    window.saveMenu = new SaveMenuManager(roomId);
    createGameEventAreas();
    console.log("[GameClient] Registering combat handlers with sseBus");
    unregisterCombatHandlers = registerCombatHandlers(sseBus);
    console.log("[GameClient] Combat handlers registered");
    const actionForm = document.getElementById("action-form");
    if (actionForm) {
      actionForm.addEventListener("submit", (e) => {
        e.preventDefault();
        window.gameClient.sendAction(actionForm);
      });
    }
    const userMeta = document.querySelector('meta[name="user-id"]');
    const userId = userMeta ? userMeta.getAttribute("content") : null;
    rehydrateStatusSubtree(roomId, userId);
    roomChat = new ChatManager(roomId);
    roomChat.loadInitialMessages();
    roomChat.setupFormHandler();
    roomMembers = new RoomMembersManager(roomId);
    roomMembers.loadInitialMembers();
    roomMembers.connect();
    setupTabs();
    window.gameClient.connectSSE({
      onChat: (msg) => roomChat.renderMessage(msg)
    });
    sseBus.onMessageType("turn_end", () => {
      if (typeof window.loadStatusPanel === "function") {
        window.loadStatusPanel();
      }
    });
    setupMutationObserver(window.gameClient);
  }
  const characterForm = document.querySelector(".character-form");
  if (characterForm) {
    new CharacterForm();
  }
  window.addEventListener("beforeunload", () => {
    if (roomMembers)
      roomMembers.destroy();
    if (unregisterCombatHandlers)
      unregisterCombatHandlers();
  });
});
function createGameEventAreas() {
  const statusBody = document.getElementById("status-body");
  if (!statusBody) {
    console.warn("[GameClient] status-body not found");
    return;
  }
  let turnGateStatus = document.getElementById("turn-gate-status");
  if (!turnGateStatus) {
    turnGateStatus = document.createElement("div");
    turnGateStatus.id = "turn-gate-status";
    statusBody.appendChild(turnGateStatus);
    console.log("[GameClient] Created turn-gate-status element");
  }
  const combatLogFull = document.getElementById("combat-log-full");
  if (combatLogFull) {
    console.log("[GameClient] combat-log-full element found:", combatLogFull);
  } else {
    console.error("[GameClient] combat-log-full element NOT FOUND in DOM!");
  }
}
function setupMutationObserver(client) {
  const storyOutput = document.getElementById("story-output");
  if (!storyOutput)
    return;
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const streamingContainer = node.id?.startsWith("streaming-response-") ? node : node.querySelector('[id^="streaming-response-"]');
            if (streamingContainer && streamingContainer.id) {
              const isEmpty = streamingContainer.children.length === 0 || streamingContainer.children.length === 1 && streamingContainer.querySelector(".streaming-indicator");
              if (isEmpty) {
                console.log("[MutationObserver] New streaming container detected:", streamingContainer.id);
                client.setStreamingElementId(streamingContainer.id);
              } else {
                console.log("[MutationObserver] Streaming container has content, skipping:", streamingContainer.id);
              }
            }
          }
        }
      }
    }
  });
  observer.observe(storyOutput, { childList: true, subtree: true });
}
function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const statusPanel = document.getElementById("status-panel");
  const combatPanel = document.getElementById("combat-log-panel");
  const notesPanel = document.getElementById("notes-panel");
  const chatPanel = document.getElementById("chat-panel");
  const savesPanel = document.getElementById("saves-panel");
  setupScrollableTabs();
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = btn.getAttribute("data-tab");
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      [statusPanel, combatPanel, notesPanel, chatPanel, savesPanel].forEach((p) => {
        if (p) {
          p.classList.add("hidden");
          p.style.display = "none";
        }
      });
      let selectedPanel = null;
      if (tab === "status")
        selectedPanel = statusPanel;
      else if (tab === "combat-log")
        selectedPanel = combatPanel;
      else if (tab === "notes")
        selectedPanel = notesPanel;
      else if (tab === "chat")
        selectedPanel = chatPanel;
      else if (tab === "saves")
        selectedPanel = savesPanel;
      if (selectedPanel) {
        selectedPanel.classList.remove("hidden");
        selectedPanel.style.display = "";
        if (tab === "status") {
          window.loadStatusPanel();
        }
      }
    });
  });
}
function setupScrollableTabs() {
  const wrapper = document.getElementById("sidebar-tabs-wrapper");
  const tabsContainer = document.getElementById("sidebar-tabs");
  const scrollLeftBtn = document.getElementById("tab-scroll-left");
  const scrollRightBtn = document.getElementById("tab-scroll-right");
  if (!wrapper || !tabsContainer)
    return;
  function updateScrollState() {
    const canScrollLeft = tabsContainer.scrollLeft > 0;
    const canScrollRight = tabsContainer.scrollLeft < tabsContainer.scrollWidth - tabsContainer.clientWidth - 1;
    wrapper.classList.toggle("can-scroll-left", canScrollLeft);
    wrapper.classList.toggle("can-scroll-right", canScrollRight);
    if (scrollLeftBtn)
      scrollLeftBtn.disabled = !canScrollLeft;
    if (scrollRightBtn)
      scrollRightBtn.disabled = !canScrollRight;
  }
  if (scrollLeftBtn) {
    scrollLeftBtn.addEventListener("click", () => {
      tabsContainer.scrollBy({ left: -100, behavior: "smooth" });
    });
  }
  if (scrollRightBtn) {
    scrollRightBtn.addEventListener("click", () => {
      tabsContainer.scrollBy({ left: 100, behavior: "smooth" });
    });
  }
  tabsContainer.addEventListener("scroll", updateScrollState);
  window.addEventListener("resize", updateScrollState);
  setTimeout(updateScrollState, 100);
}
//# sourceMappingURL=game-client.js.map
