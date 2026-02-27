/**
 * Room Members Module
 * Renders member list and subscribes to members-updated SSE events.
 */

import { sseBus } from './sseBus.js';
import { fetchJson } from './api.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

export class RoomMembersManager {
  constructor(roomId) {
    this.roomId = roomId;
    this.membersList = document.getElementById('members-list');
    this.currentUserId = this.getCurrentUserId();
    this.unsubscribe = null;
  }

  getCurrentUserId() {
    const metaTag = document.querySelector('meta[name="user-id"]');
    return metaTag ? metaTag.getAttribute('content') : null;
  }

  async loadInitialMembers() {
    if (!this.membersList) return;

    try {
      const { ok, data } = await fetchJson(`/api/rooms/${this.roomId}/members`);

      if (ok && data?.success) {
        this.renderMembers(data.members, data.maxPlayers);
      } else {
        this.renderError('Failed to load members');
      }
    } catch (error) {
      console.error('[Members] Failed to load:', error);
      this.renderError('Failed to load members');
    }
  }

  connect() {
    sseBus.connect(this.roomId);
    this.unsubscribe = sseBus.on('members-updated', (data) => {
      if (!data) return;
      this.renderMembers(data.members || [], data.maxPlayers || 0);
    });
  }

  renderMembers(members, maxPlayers) {
    if (!this.membersList) return;

    const loading = this.membersList.querySelector('.members-loading');
    if (loading) loading.remove();

    const error = this.membersList.querySelector('.members-error');
    if (error) error.remove();

    const safeMax = maxPlayers || members.length || 0;
    this.membersList.innerHTML = `
      <div class="members-count">${members.length}/${safeMax}</div>
    `;

    if (members.length === 0) {
      this.membersList.innerHTML += '<div class="empty-members">No members yet</div>';
      return;
    }

    members.forEach(member => {
      const isSelf = this.currentUserId === member.userId;
      const div = document.createElement('div');
      div.className = `member-item${isSelf ? ' self' : ''}`;
      div.innerHTML = `
        <span class="member-name">${escapeHtml(member.username)}</span>${member.characterName ? ` <span class="member-character">(${escapeHtml(member.characterName)})</span>` : ''}
      `;
      this.membersList.appendChild(div);
    });
  }

  renderError(message) {
    if (!this.membersList) return;

    const loading = this.membersList.querySelector('.members-loading');
    if (loading) loading.remove();

    this.membersList.innerHTML = `<div class="members-error">${escapeHtml(message)}</div>`;
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
