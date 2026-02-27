/**
 * Player Notes Management Module
 * Handles adding, deleting and syncing player notes
 */

import { fetchJson } from './api.js';

export class PlayerNotesManager {
  constructor(roomId, userId) {
    this.roomId = roomId;
    this.userId = userId;
    this.notesList = null;
    this.input = null;
    this.addButton = null;
  }

  init() {
    // Cache DOM references
    this.notesList = document.getElementById('player-notes-list');
    this.input = document.querySelector('.note-input');
    this.addButton = document.querySelector('.note-add');

    if (!this.notesList || !this.input || !this.addButton) {
      console.warn('[PlayerNotes] Required DOM elements not found');
      return;
    }

    // Setup event listeners
    this.setupEventListeners();

    // Setup delete handlers for existing notes (rendered server-side)
    this.setupExistingNoteHandlers();

    // Setup SSE listeners for real-time updates from other players
    this.setupSSEListeners();

    // Sync empty state on initial load
    this.updateEmptyState();

    console.log('[PlayerNotes] Initialized for room', this.roomId);
  }

  setupExistingNoteHandlers() {
    // We'll use event delegation on notesList instead of individual listeners
    if (this.notesList) {
      // Remove old delegation if it exists to avoid double triggers
      // (though in current setup simple replacement should be fine)
      const newList = this.notesList.cloneNode(true);
      this.notesList.replaceWith(newList);
      this.notesList = newList;

      this.notesList.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.note-delete');
        if (deleteBtn) {
          e.preventDefault();
          e.stopPropagation();
          const noteElement = deleteBtn.closest('.note-item');
          const noteId = deleteBtn.getAttribute('data-note-id');
          if (noteElement && noteId) {
            this.handleDeleteNote(noteElement, noteId);
          }
        }
      });
    }
  }

  setupEventListeners() {
    // Add button click handler
    this.addButton.addEventListener('click', (e) => this.handleAddNote(e));

    // Enter key in input handler
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleAddNote(e);
      }
    });

    // Auto-resize textarea
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = (this.input.scrollHeight) + 'px';
    });
  }

  setupSSEListeners() {
    // SSE listeners for real-time sync will be added later
    console.log('[PlayerNotes] SSE listeners disabled for now');
  }

  async handleAddNote(e) {
    e.preventDefault();
    e.stopPropagation();

    if (this.addButton.disabled) return;

    const note = this.input.value.trim();
    if (!note) return;

    const trimmed = note.slice(0, 200);

    // Optimistic UI: show loading state
    this.addButton.disabled = true;
    this.addButton.textContent = '...';
    const originalValue = this.input.value;
    this.input.value = '';

    try {
      const { ok, data } = await fetchJson(`/api/rooms/${this.roomId}/notes`, {
        method: 'POST',
        body: { note: trimmed }
      });

      if (ok && data?.success) {
        const newNote = data.notes[data.notes.length - 1];
        if (newNote) {
          this.addNoteToDOM(newNote);
        }
      } else {
        this.input.value = originalValue;
        alert(data?.error || 'Failed to add note');
      }
    } catch (error) {
      console.error('[PlayerNotes] Failed to add note:', error);
      this.input.value = originalValue;
      alert('Failed to add note');
    } finally {
      this.addButton.disabled = false;
      this.addButton.textContent = 'Add';
      this.input.style.height = 'auto';
      this.input.focus();
    }
  }

  async handleDeleteNote(noteElement, noteId) {
    if (noteElement.dataset.deleting === 'true') return;

    noteElement.dataset.deleting = 'true';
    noteElement.style.opacity = '0.5';

    try {
      const { ok, data } = await fetchJson(`/api/rooms/${this.roomId}/notes/${noteId}`, {
        method: 'DELETE'
      });

      if (ok && data?.success) {
        noteElement.remove();
        // No longer need to resync indices - notes have stable IDs
        this.updateEmptyState();
      } else {
        noteElement.dataset.deleting = '';
        noteElement.style.opacity = '1';
        alert(data?.error || 'Failed to delete note');
      }
    } catch (error) {
      console.error('[PlayerNotes] Failed to delete note:', error);
      noteElement.dataset.deleting = '';
      noteElement.style.opacity = '1';
      alert('Failed to delete note');
    } finally {
      setTimeout(() => {
        if (noteElement.parentNode) {
          delete noteElement.dataset.deleting;
        }
      }, 100);
    }
  }

  addNoteToDOM(note) {
    const noteElement = document.createElement('div');
    noteElement.className = 'note-item';
    noteElement.dataset.noteId = note.id;

    noteElement.innerHTML = `
      <span class="note-text">${this.escapeHtml(note.content)}</span>
      <button class="note-delete" data-note-id="${note.id}" title="Delete note">×</button>
    `;

    const emptyState = this.notesList.querySelector('.empty-state');
    if (emptyState) {
      emptyState.style.display = 'none';
    }

    this.notesList.appendChild(noteElement);
  }

  updateEmptyState() {
    const hasNotes = this.notesList.querySelectorAll('.note-item').length > 0;
    const emptyState = this.notesList.querySelector('.empty-state');
    if (emptyState) {
      emptyState.style.display = hasNotes ? 'none' : 'block';
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
