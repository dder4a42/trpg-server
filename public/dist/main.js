var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// public/js/modules/sseBus.js
var SSEBus, sseBus;
var init_sseBus = __esm({
  "public/js/modules/sseBus.js"() {
    SSEBus = class {
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
    sseBus = new SSEBus();
  }
});

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
var init_api = __esm({
  "public/js/modules/api.js"() {
  }
});

// public/js/modules/store.js
var initialState, Store, store;
var init_store = __esm({
  "public/js/modules/store.js"() {
    initialState = {
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
    Store = class {
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
    store = new Store(initialState);
  }
});

// public/js/modules/saves.js
var saves_exports = {};
__export(saves_exports, {
  SaveMenuManager: () => SaveMenuManager
});
var SaveMenuManager;
var init_saves = __esm({
  "public/js/modules/saves.js"() {
    init_api();
    SaveMenuManager = class {
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
  }
});

// public/js/modules/game.js
var game_exports = {};
__export(game_exports, {
  CharacterForm: () => CharacterForm,
  SaveMenuManager: () => SaveMenuManager,
  TRPGClient: () => TRPGClient
});
var TRPGClient, CharacterForm;
var init_game = __esm({
  "public/js/modules/game.js"() {
    init_sseBus();
    init_api();
    init_store();
    init_saves();
    TRPGClient = class {
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
    CharacterForm = class {
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
  }
});

// public/js/modules/auth.js
var AuthFormHandler = class {
  constructor() {
    this.initLoginForm();
    this.initRegisterForm();
  }
  /**
   * Initialize login form handler
   */
  initLoginForm() {
    const form = document.getElementById("loginForm");
    if (!form)
      return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorDiv = document.getElementById("loginError");
      errorDiv.classList.remove("visible");
      const formData = new FormData(e.target);
      const data = {
        usernameOrEmail: formData.get("usernameOrEmail"),
        password: formData.get("password")
      };
      try {
        const response = await fetch("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok && result.success) {
          e.target.reset();
          document.getElementById("usernameOrEmail").value = "";
          document.getElementById("password").value = "";
          window.location.href = "/";
        } else {
          errorDiv.textContent = result.error?.message || "Login failed";
          errorDiv.classList.add("visible");
        }
      } catch (error) {
        errorDiv.textContent = "Network error. Please try again.";
        errorDiv.classList.add("visible");
      }
    });
  }
  /**
   * Initialize register form handler
   */
  initRegisterForm() {
    const form = document.getElementById("registerForm");
    if (!form)
      return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorDiv = document.getElementById("registerError");
      errorDiv.classList.remove("visible");
      const formData = new FormData(e.target);
      const data = {
        username: formData.get("username"),
        email: formData.get("email"),
        password: formData.get("password")
      };
      try {
        const response = await fetch("/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok && result.success) {
          e.target.reset();
          document.getElementById("regUsername").value = "";
          document.getElementById("regEmail").value = "";
          document.getElementById("regPassword").value = "";
          window.location.href = "/";
        } else {
          errorDiv.textContent = result.error?.message || "Registration failed";
          errorDiv.classList.add("visible");
        }
      } catch (error) {
        errorDiv.textContent = "Network error. Please try again.";
        errorDiv.classList.add("visible");
      }
    });
  }
};
function initLogout() {
  const form = document.getElementById("logoutForm");
  if (!form)
    return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await fetch("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  });
}

// public/js/main.js
init_game();
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  if (loginForm || registerForm) {
    new AuthFormHandler();
  }
  initLogout();
  const characterForm = document.querySelector(".character-form");
  if (characterForm) {
    new CharacterForm();
  }
  document.body.addEventListener("click", async (evt) => {
    if (evt.target.matches(".delete-character-btn")) {
      const btn = evt.target;
      const charId = btn.dataset.characterId;
      const message = btn.dataset.confirm || "Are you sure you want to delete this character?";
      if (confirm(message)) {
        try {
          const response = await fetch(`/api/characters/${charId}`, {
            method: "DELETE"
          });
          if (response.ok) {
            window.location.reload();
          } else {
            console.error("Delete failed");
            alert("Failed to delete character");
          }
        } catch (err) {
          console.error("Delete error", err);
          alert("Error deleting character");
        }
      }
    }
  });
});
window.TRPGClient = () => Promise.resolve().then(() => (init_game(), game_exports)).then((m) => m.TRPGClient);
window.CharacterForm = () => Promise.resolve().then(() => (init_game(), game_exports)).then((m) => m.CharacterForm);
window.SaveMenuManager = () => Promise.resolve().then(() => (init_saves(), saves_exports)).then((m) => m.SaveMenuManager);
//# sourceMappingURL=main.js.map
