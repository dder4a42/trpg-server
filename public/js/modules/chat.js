/**
 * Chat Management Module
 * Handles loading, rendering and sending chat messages
 */

import { fetchJson } from './api.js';

export class ChatManager {
  constructor(roomId) {
    this.roomId = roomId;
    this.currentUserId = this.getCurrentUserId();
    this.messagesContainer = document.getElementById('chat-messages');
  }

  getCurrentUserId() {
    const metaTag = document.querySelector('meta[name="user-id"]');
    return metaTag ? metaTag.getAttribute('content') : null;
  }

  async loadInitialMessages() {
    if (!this.messagesContainer) return;

    try {
      const { ok, data } = await fetchJson(`/api/chat/rooms/${this.roomId}/messages?limit=50`);

      if (ok && data?.success && data.messages) {
        this.messagesContainer.innerHTML = '';
        data.messages.forEach((msg) => this.renderMessage(msg));
        this.scrollToBottom();
      } else {
        this.messagesContainer.innerHTML = '<div class="chat-loading">No messages yet</div>';
      }
    } catch (error) {
      console.error('[Chat] Failed to load messages:', error);
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
    if (!this.messagesContainer) return;

    // Remove loading indicator if present
    const loading = this.messagesContainer.querySelector('.chat-loading');
    if (loading) loading.remove();

    const isSelf = this.currentUserId === message.playerId;
    const isSystem = message.type === 'system';

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message${isSelf ? ' self' : ''}${isSystem ? ' system' : ''}`;
    messageDiv.dataset.messageId = message.id;

    const time = new Date(message.timestamp);
    const timeStr = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

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
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Setup chat form handlers
   */
  setupFormHandler() {
    const form = document.getElementById('chat-form');
    if (!form) return;

    const textarea = form.querySelector('textarea[name="message"]');
    if (!textarea) return;

    // Auto-resize textarea as user types
    const autoResize = () => {
      textarea.style.height = '42px'; // Reset to min-height
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 42), 120);
      textarea.style.height = newHeight + 'px';
    };

    textarea.addEventListener('input', autoResize);

    // Handle Enter key to send, Shift+Enter for new line
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.dispatchEvent(new Event('submit'));
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const messageContent = textarea.value.trim();
      if (!messageContent) return;

      const originalMessage = messageContent;
      textarea.value = '';
      autoResize();

      const button = form.querySelector('button');
      if (button) button.disabled = true;

      try {
        const { ok, data } = await fetchJson(`/api/chat/rooms/${this.roomId}/send`, {
          method: 'POST',
          body: { message: messageContent }
        });

        if (!ok) {
          console.error('[Chat] Failed to send:', data?.error);
          textarea.value = originalMessage;
          autoResize();
        }
      } catch (error) {
        console.error('[Chat] Error sending:', error);
        textarea.value = originalMessage;
        autoResize();
      } finally {
        if (button) button.disabled = false;
        textarea.focus();
      }
    });
  }
}
