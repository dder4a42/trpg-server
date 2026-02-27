/**
 * Main Entry Point
 * Initializes global functionality across all pages
 */
import { AuthFormHandler, initLogout } from './modules/auth.js';
import { CharacterForm } from './modules/game.js';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  // Initialize authentication forms if present
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  if (loginForm || registerForm) {
    new AuthFormHandler();
  }

  // Initialize logout handler
  initLogout();

  // Initialize character form if present
  const characterForm = document.querySelector('.character-form');
  if (characterForm) {
    new CharacterForm();
  }

  // Handle character deletion
  document.body.addEventListener('click', async (evt) => {
    if (evt.target.matches('.delete-character-btn')) {
      const btn = evt.target;
      const charId = btn.dataset.characterId;
      const message = btn.dataset.confirm || 'Are you sure you want to delete this character?';
      
      if (confirm(message)) {
        try {
          const response = await fetch(`/api/characters/${charId}`, {
             method: 'DELETE'
          });
          
          if (response.ok) {
             window.location.reload();
          } else {
             console.error('Delete failed');
             alert('Failed to delete character');
          }
        } catch (err) {
          console.error('Delete error', err);
          alert('Error deleting character');
        }
      }
    }
  });
});

/**
 * Export for use in inline scripts (legacy support)
 */
window.TRPGClient = () => import('./modules/game.js').then(m => m.TRPGClient);
window.CharacterForm = () => import('./modules/game.js').then(m => m.CharacterForm);
window.SaveMenuManager = () => import('./modules/saves.js').then(m => m.SaveMenuManager);
