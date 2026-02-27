/**
 * TRPG Game Client
 * Main game logic and character form handling
 */
import { sseBus } from './sseBus.js';
import { fetchJson, fetchResponse } from './api.js';
import { store } from './store.js';
export { SaveMenuManager } from './saves.js';

/**
 * TRPG Game Client
 * Manages SSE connections and game actions
 */
export class TRPGClient {
  constructor(roomId) {
    this.roomId = roomId;
    this.eventSource = null;
    this.messageBuffer = [];
    this.isProcessing = false;
    this.currentStreamingElementId = null;
    this.currentStreamingContent = '';
    this.unsubscribeHandlers = [];
    this.processedElementIds = new Set(); // Track processed streaming elements
  }

  /**
   * Set the current element to receive streaming updates
   */
  setStreamingElementId(id, force = false) {
    // Skip if already processed this element
    if (!force && this.processedElementIds.has(id)) {
      console.log('[TRPGClient] Element already processed, skipping:', id);
      return;
    }

    const element = document.getElementById(id);
    if (!element) {
      console.warn('[TRPGClient] Element not found:', id);
      return;
    }

    // Check if element already has significant content (not just indicator)
    const hasContent = Array.from(element.childNodes).some(node => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return true;
      if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('streaming-indicator')) return true;
      return false;
    });

    if (hasContent && !force) {
      console.log('[TRPGClient] Element already has content, skipping:', id);
      this.processedElementIds.add(id);
      return;
    }

    console.log('[TRPGClient] Setting streaming target:', id);
    this.currentStreamingElementId = id;
    this.currentStreamingContent = '';
    this.processedElementIds.add(id);
    
    store.dispatch({ type: 'STREAMING_SET_TARGET', payload: id });
    this.flushStreamingBuffer();
  }

  /**
   * Flush buffered chunks to the target element
   */
  flushStreamingBuffer() {
    const state = store.getState();
    const buffer = state.streaming.buffer;
    const target = this.currentStreamingElementId 
      ? document.getElementById(this.currentStreamingElementId)
      : null;

    if (!target || buffer.length === 0) return;

    const indicator = target.querySelector('.streaming-indicator');
    if (indicator) indicator.remove();

    buffer.forEach(chunk => {
      target.appendChild(document.createTextNode(chunk));
    });

    const output = document.getElementById('story-output');
    if (output) output.scrollTop = output.scrollHeight;

    store.dispatch({ type: 'STREAMING_FLUSH_BUFFER' });
  }

  /**
   * Initialize SSE connection for real-time updates
   */
  connectSSE(handlers = {}) {
    this.unsubscribeHandlers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeHandlers = [];

    sseBus.connect(this.roomId);

    this.unsubscribeHandlers.push(
      sseBus.onMessageType('streaming-chunk', (data) => this.handleStreamingChunk(data))
    );
    this.unsubscribeHandlers.push(
      sseBus.onMessageType('streaming-complete', (data) => this.handleStreamingComplete(data))
    );
    this.unsubscribeHandlers.push(
      sseBus.onMessageType('streaming-error', (data) => this.handleStreamingError(data))
    );

    this.unsubscribeHandlers.push(
      sseBus.on('message', (data) => {
        if (data?.type) return;
        this.appendMessage(data?.chunk || data?.content || data);
      })
    );

    if (handlers.onChat) {
      this.unsubscribeHandlers.push(
        sseBus.on('chat', (message) => handlers.onChat?.(message))
      );
    }

    this.unsubscribeHandlers.push(
      sseBus.on('error', (error) => {
        console.error('SSE error:', error);
      })
    );
  }

  /**
   * Handle an incoming streaming chunk
   */
  handleStreamingChunk(data) {
    const chunk = data.content;
    if (!chunk) return;

    this.currentStreamingContent += chunk;
    store.dispatch({ type: 'STREAMING_CHUNK', payload: chunk });

    const target = this.currentStreamingElementId 
      ? document.getElementById(this.currentStreamingElementId)
      : null;

    if (target) {
      // Remove indicator on first chunk
      const indicator = target.querySelector('.streaming-indicator');
      if (indicator) indicator.remove();

      // Append text
      target.appendChild(document.createTextNode(chunk));
      
      // Scroll output
      const output = document.getElementById('story-output');
      if (output) output.scrollTop = output.scrollHeight;
    }
    // If no target, buffer will accumulate until target is set
  }

  /**
   * Handle streaming completion
   */
  async handleStreamingComplete(data) {
    console.log('[TRPGClient] Streaming complete');
    
    const target = this.currentStreamingElementId 
      ? document.getElementById(this.currentStreamingElementId)
      : null;

    // Use full content from server if provided, otherwise fallback to collected content
    const finalContent = data.content || this.currentStreamingContent;

    if (target && finalContent) {
      try {
        // Fetch rendered markdown
        const { ok, data } = await fetchJson('/api/messages/markdown', {
          method: 'POST',
          body: { content: finalContent }
        });
        
        if (ok && data?.html) {
          target.innerHTML = data.html;
            
          // Re-scroll
          const output = document.getElementById('story-output');
          if (output) {
            output.scrollTop = output.scrollHeight;
          }
        } else {
          console.warn('[TRPGClient] Markdown render request failed');
        }
      } catch (err) {
        console.error('[TRPGClient] Failed to render markdown:', err);
      }
    } else if (!target) {
      console.warn('[TRPGClient] No target element for markdown rendering');
    }

    this.setProcessing(false);
    this.refreshStatus();
    this.currentStreamingElementId = null;
    this.currentStreamingContent = '';
    store.dispatch({ type: 'STREAMING_COMPLETE' });
  }

  /**
   * Handle streaming error
   */
  handleStreamingError(data) {
    console.error('[TRPGClient] Streaming error:', data.error);
    const target = this.currentStreamingElementId 
      ? document.getElementById(this.currentStreamingElementId)
      : null;
    
    if (target) {
      // Safe error rendering
      target.innerHTML = '';
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.textContent = `Error: ${data.error || 'Unknown error'}`;
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
    const output = document.getElementById('story-output');
    if (!output) return;

    // Create message element
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant streaming';
    msgDiv.textContent = typeof content === 'string' ? content : JSON.stringify(content);

    output.appendChild(msgDiv);
    output.scrollTop = output.scrollHeight;

    // Remove streaming class after animation
    setTimeout(() => {
      msgDiv.classList.remove('streaming');
    }, 100);
  }

  /**
   * Set processing state
   */
  setProcessing(processing) {
    this.isProcessing = processing;
    const actionForm = document.getElementById('action-form');
    const input = actionForm ? actionForm.querySelector('#action-input') : document.querySelector('#action-input');
    const button = actionForm ? actionForm.querySelector('button[type="submit"]') : null;
    const spinner = document.getElementById('input-spinner');

    if (input) {
      input.disabled = processing;
    }
    if (button) {
      button.disabled = processing;
    }

    if (spinner) {
      spinner.classList.toggle('visible', processing);
    }
  }

  /**
   * Send action via fetch
   */
  async sendAction(form) {
    if (this.isProcessing) return;

    const formData = new FormData(form);
    const action = formData.get('action');
    if (!action) return;

    // Reset streaming state for new action
    console.log('[TRPGClient] Starting new action, resetting streaming state');
    this.currentStreamingElementId = null;
    this.currentStreamingContent = '';
    store.dispatch({ type: 'STREAMING_RESET' });

    this.setProcessing(true);

    const input = form.querySelector('#action-input');
    if (input) {
      input.value = '';
      input.focus();
    }

    try {
      const response = await fetchResponse('/api/rooms/collect-action', {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: Object.fromEntries(formData.entries()),
      });

      if (!response.ok) {
        throw new Error('Failed to send action');
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        const html = await response.text();
        const output = document.getElementById('story-output');
        if (output) {
          output.insertAdjacentHTML('beforeend', html);
          output.scrollTop = output.scrollHeight;
        }
      } else {
        const data = await response.json();
        console.log('Action recorded:', data);
      }
    } catch (error) {
      console.error('Error sending action:', error);
      alert('Failed to send action. Please try again.');
      this.setProcessing(false);
    }
  }

  /**
   * Append user message to output
   */
  appendUserMessage(content) {
    const output = document.getElementById('story-output');
    if (!output) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message user';
    msgDiv.innerHTML = `<div class="message-header">You</div><div class="message-content">${this.escapeHtml(content)}</div>`;

    output.appendChild(msgDiv);
    output.scrollTop = output.scrollHeight;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Refresh status bar
   */
  async refreshStatus() {
    if (typeof window.loadStatusPanel === 'function') {
      return window.loadStatusPanel();
    }
  }
}

/**
 * Character Form Utilities
 */
export class CharacterForm {
  constructor() {
    this.initAbilityScoreModifiers();
    this.initPointBuy();
  }

  /**
   * Update modifier display when ability scores change
   */
  initAbilityScoreModifiers() {
    const inputs = document.querySelectorAll('.ability-score input');
    inputs.forEach((input) => {
      input.addEventListener('input', () => {
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
    const modifierSpan = input.parentElement.querySelector('.modifier');
    if (modifierSpan) {
      modifierSpan.textContent = modifier >= 0 ? `+${modifier}` : `${modifier}`;
    }
  }

  /**
   * Initialize point buy system (optional)
   */
  initPointBuy() {
    // TODO: Implement point buy system
  }

  /**
   * Update point buy total
   */
  updatePointBuyTotal() {
    // TODO: Calculate point buy cost
  }
}
