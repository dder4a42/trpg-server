/**
 * Character Modal Module
 * Handles character detail modal display and interactions
 */

(function() {
  'use strict';

  let modal = null;
  let closeBtns = null;

  /**
   * Initialize the modal
   */
  function init() {
    modal = document.getElementById('character-modal');
    if (!modal) return;

    closeBtns = modal.querySelectorAll('.modal-close');

    console.log('Character modal initialized');

    bindEvents();

    // Ensure modal starts hidden
    if (modal && !modal.classList.contains('active')) {
      modal.setAttribute('data-modal-hidden', 'true');
    }
  }

  /**
   * Bind event listeners
   */
  function bindEvents() {
    // View details buttons
    document.querySelectorAll('.view-details-btn').forEach(btn => {
      btn.addEventListener('click', handleViewDetails);
    });

    // Close buttons
    closeBtns.forEach(btn => {
      btn.addEventListener('click', closeModal);
    });

    // Close on modal background click (but not on content)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // Close on escape key
    document.addEventListener('keydown', handleEscape);
  }

  /**
   * Handle view details button click
   */
  function handleViewDetails(e) {
    const btn = e.currentTarget;
    const characterId = btn.dataset.characterId;
    const character = window.charactersData?.find(c => c._id === characterId);

    if (character) {
      showCharacterDetails(character);
      openModal();
    } else {
      console.error('Character not found:', characterId);
    }
  }

  /**
   * Show character details in modal
   */
  function showCharacterDetails(char) {
    const detailsContainer = document.getElementById('modal-character-details');
    if (!detailsContainer) return;

    try {
      // Set title
      document.getElementById('modal-character-name').textContent = char.name;

      // Clear previous content
      detailsContainer.innerHTML = '';

      // Build sections
      renderBasicInfo(char, detailsContainer);
      renderCombatStats(char, detailsContainer);
      renderAbilityScores(char, detailsContainer);
      renderOptionalSections(char, detailsContainer);

    } catch (error) {
      console.error('Error rendering character details:', error);
      detailsContainer.innerHTML = '<p class="detail-text">Error loading character details. Please try again.</p>';
    }
  }

  /**
   * Render basic info section
   */
  function renderBasicInfo(char, container) {
    const section = createSection('Basic Info');
    const grid = document.createElement('div');
    grid.className = 'detail-grid';

    const info = [
      { label: 'Race', value: char.race || 'Human' },
      { label: 'Class', value: char.characterClass || 'Fighter' },
      { label: 'Level', value: String(char.level || 1) },
      { label: 'Alignment', value: char.alignment || 'Neutral' }
    ];

    info.forEach(item => {
      const div = document.createElement('div');
      div.className = 'detail-item';
      div.appendChild(createDetailItem(item.label, item.value));
      grid.appendChild(div);
    });

    section.appendChild(grid);
    container.appendChild(section);
  }

  /**
   * Render combat stats section
   */
  function renderCombatStats(char, container) {
    const section = createSection('Combat Stats');
    const grid = document.createElement('div');
    grid.className = 'stats-grid';

    const hp = document.createElement('div');
    hp.className = 'stat-box';
    hp.innerHTML = `
      <span class="stat-label">Hit Points</span>
      <span class="stat-value">${char.currentHp || char.maxHp}/${char.maxHp}</span>
    `;

    const ac = document.createElement('div');
    ac.className = 'stat-box';
    ac.innerHTML = `
      <span class="stat-label">Armor Class</span>
      <span class="stat-value">${char.armorClass || 10}</span>
    `;

    grid.appendChild(hp);
    grid.appendChild(ac);
    section.appendChild(grid);
    container.appendChild(section);
  }

  /**
   * Render ability scores section
   */
  function renderAbilityScores(char, container) {
    const abilities = char.abilityScores || {};
    const entries = Object.entries(abilities);

    if (entries.length === 0) return;

    const section = createSection('Ability Scores');
    const grid = document.createElement('div');
    grid.className = 'abilities-grid';

    entries.forEach(([key, value]) => {
      const modifier = Math.floor((value - 10) / 2);
      const div = document.createElement('div');
      div.className = 'ability-score-detail';
      div.innerHTML = `
        <span class="ability-label">${escapeHtml(key.slice(0, 3).toUpperCase())}</span>
        <span class="ability-value">${value}</span>
        <span class="ability-mod">(${modifier >= 0 ? '+' : ''}${modifier})</span>
      `;
      grid.appendChild(div);
    });

    section.appendChild(grid);
    container.appendChild(section);
  }

  /**
   * Render optional sections (background, appearance, etc.)
   */
  function renderOptionalSections(char, container) {
    const optionalFields = [
      { key: 'background', title: 'Background' },
      { key: 'appearance', title: 'Appearance' },
      { key: 'personalityTraits', title: 'Personality Traits' },
      { key: 'backstory', title: 'Backstory' }
    ];

    optionalFields.forEach(field => {
      if (char[field.key]) {
        const section = createSection(field.title);
        const p = document.createElement('p');
        p.className = 'detail-text';
        p.textContent = char[field.key];
        section.appendChild(p);
        container.appendChild(section);
      }
    });

    // Status effects (array)
    if (char.statusEffects && char.statusEffects.length > 0) {
      const section = createSection('Status Effects');
      const list = document.createElement('div');
      list.className = 'status-effects-list';

      char.statusEffects.forEach(effect => {
        const span = document.createElement('span');
        span.className = 'status-effect';
        span.textContent = effect;
        list.appendChild(span);
      });

      section.appendChild(list);
      container.appendChild(section);
    }
  }

  /**
   * Create a section with heading
   */
  function createSection(title) {
    const section = document.createElement('div');
    section.className = 'character-detail-section';

    const h3 = document.createElement('h3');
    h3.textContent = title;

    section.appendChild(h3);
    return section;
  }

  /**
   * Create a detail item (label + value)
   */
  function createDetailItem(label, value) {
    const labelSpan = document.createElement('span');
    labelSpan.className = 'detail-label';
    labelSpan.textContent = label;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'detail-value';
    valueSpan.textContent = value;

    const fragment = document.createDocumentFragment();
    fragment.appendChild(labelSpan);
    fragment.appendChild(valueSpan);

    return fragment;
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Open the modal
   */
  function openModal() {
    if (modal) {
      modal.removeAttribute('data-modal-hidden');
      modal.classList.add('active');
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
  }

  /**
   * Close the modal
   */
  function closeModal() {
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('data-modal-hidden', 'true');
      document.body.style.overflow = ''; // Restore scrolling
    }
  }

  /**
   * Handle escape key
   */
  function handleEscape(e) {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
      closeModal();
    }
  }

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose public API
  window.CharacterModal = {
    open: (character) => {
      showCharacterDetails(character);
      openModal();
    },
    close: closeModal
  };
})();
