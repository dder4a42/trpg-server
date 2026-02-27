/**
 * Save/Load Menu Manager
 * Handles game state saving and loading
 */
import { fetchJson, fetchText } from './api.js';

export class SaveMenuManager {
  constructor(roomId) {
    this.roomId = roomId;
    this.container = document.getElementById('save-menu');
    if (!this.container) return;

    this.bindEvents();
    this.refreshMenu();
  }

  bindEvents() {
    this.container.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;

      const action = button.dataset.action;
      const slotName = button.dataset.slot;

      if (action === 'save') {
        this.handleSave();
      } else if (action === 'load' && slotName) {
        this.handleLoad(slotName);
      } else if (action === 'delete' && slotName) {
        this.handleDelete(slotName);
      }
    });
  }

  setStatus(message, isError = false) {
    const status = this.container.querySelector('.save-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  async refreshMenu() {
    try {
      const { ok, text } = await fetchText(`/partials/room/${this.roomId}/saves`);
      if (!ok) throw new Error('Failed to load saves');
      const html = text;
      this.container.innerHTML = html;
      this.setStatus('');
    } catch (error) {
      console.error('[SaveMenu] Refresh failed:', error);
      this.setStatus('Failed to load saves', true);
    }
  }

  getFormValues() {
    const slotInput = this.container.querySelector('input[name="slotName"]');
    const descInput = this.container.querySelector('input[name="description"]');
    const slotName = slotInput ? slotInput.value.trim() : '';
    const description = descInput ? descInput.value.trim() : '';
    return {
      slotName: slotName || undefined,
      description: description || undefined,
    };
  }

  async handleSave() {
    const payload = this.getFormValues();
    this.setStatus('Saving...');

    try {
      const { ok } = await fetchJson(`/api/saves/rooms/${this.roomId}/save`, {
        method: 'POST',
        body: payload,
      });
      if (!ok) throw new Error('Save failed');

      this.setStatus('Save complete.');
      await this.refreshMenu();
    } catch (error) {
      console.error('[SaveMenu] Save failed:', error);
      this.setStatus('Save failed.', true);
    }
  }

  async handleLoad(slotName) {
    if (!confirm(`Load game from slot "${slotName}"? This will replace current game state and reload the page.`)) return;
    this.setStatus('Loading...');

    try {
      const { ok } = await fetchJson(`/api/saves/rooms/${this.roomId}/load`, {
        method: 'POST',
        body: { slotName },
      });
      if (!ok) throw new Error('Load failed');

      this.setStatus('Load complete. Refreshing page...');
      
      // Reload the entire page to show restored conversation history
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('[SaveMenu] Load failed:', error);
      this.setStatus('Load failed.', true);
    }
  }

  async handleDelete(slotName) {
    if (!confirm(`Delete slot "${slotName}"?`)) return;
    this.setStatus('Deleting...');

    try {
      const { ok } = await fetchJson(`/api/saves/rooms/${this.roomId}/${encodeURIComponent(slotName)}`, {
        method: 'DELETE',
      });
      if (!ok) throw new Error('Delete failed');

      this.setStatus('Delete complete.');
      await this.refreshMenu();
    } catch (error) {
      console.error('[SaveMenu] Delete failed:', error);
      this.setStatus('Delete failed.', true);
    }
  }

  async refreshStory() {
    const story = document.getElementById('story-output');
    if (!story) return;

    const { ok, text } = await fetchText(`/partials/room/${this.roomId}/story`);
    if (!ok) throw new Error('Failed to refresh story');
    story.innerHTML = text;
    story.scrollTop = story.scrollHeight;
  }

  async refreshStatus() {
    const statusBody = document.getElementById('status-body');
    if (!statusBody) return;

    const { ok, text } = await fetchText(`/partials/room/${this.roomId}/status`);
    if (!ok) throw new Error('Failed to refresh status');
    statusBody.innerHTML = text;
  }
}
