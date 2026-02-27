# Frontend Modularization Refactor Design

**Date:** 2026-02-13
**Status:** Approved for Implementation
**Approach:** Dedicated refactor sprint with ES Modules + CSS extraction

---

## Problem Statement

Current frontend has significant technical debt:
- **Excessive inline styles** in Pug templates (login, index, lobby, game pages)
- **Inline JavaScript** (78 lines in login template alone)
- **CSS duplication** across multiple files
- **No module system** - all JS is global scope
- **Maintenance burden** - changes require editing multiple places

---

## Design Goals

1. **Maintainability** - Single source of truth for styles and scripts
2. **Incremental Safety** - Each change independently testable
3. **Keep Existing Stack** - Pug templates + vanilla JS (ES modules)
4. **Zero Regressions** - All functionality preserved

---

## Architecture Overview

### File Structure After Refactor

```
public/
├── css/
│   ├── fantasy-theme.css      (existing - variables & base styles)
│   ├── game.css               (existing)
│   ├── ready-room.css         (existing)
│   ├── admin.css              (existing)
│   ├── components.css          (NEW - reusable UI components)
│   └── pages.css              (NEW - page-specific styles)
├── js/
│   ├── modules/
│   │   ├── auth.js            (NEW - AuthFormHandler, initLogout)
│   │   ├── game.js            (extracted from game.js)
│   │   ├── streaming.js       (extracted from streaming.js)
│   │   └── saves.js           (extracted from game.js)
│   ├── game.js                (existing - to be refactored)
│   ├── streaming.js           (existing - to be refactored)
│   ├── main.js                (NEW - global entry point)
│   └── game-client.js         (NEW - game page entry)
└── lib/
    └── (existing HTMX files)
```

### Module Design

#### Auth Module (`modules/auth.js`)
```javascript
export class AuthFormHandler {
  constructor() {
    this.initLoginForm();
    this.initRegisterForm();
  }
  // Form handling logic extracted from templates
}

export function initLogout() {
  // Logout handler extracted from index.pug
}
```

#### Game Module (`modules/game.js`)
```javascript
export class TRPGClient { /* existing */ }
export class CharacterForm { /* existing */ }
export class SaveMenuManager { /* existing */ }
```

#### Streaming Module (`modules/streaming.js`)
```javascript
export function connectSSE(roomId, handlers) {
  // SSE connection logic
}
```

### CSS Organization

#### components.css - Reusable UI
- `.auth-container` - login/register form wrapper
- `.auth-input` - styled form inputs
- `.auth-error` - error display with `.visible` modifier
- `.user-header` - homepage user info bar
- `.hero-section` - centered hero content
- `.hero-actions` - CTA button container
- `.hp-bar` / `.hp-fill` - health bar with CSS variable
- `.panel-content` - flex panel variant

#### pages.css - Page-specific
- `.lobby-error` - lobby error state
- `.room-id-input` - monospace room ID
- `.btn.disabled` - button disabled state
- `.room-card` / `.room-card.full` - lobby listings
- `.status-badge` - consolidated status badges

### Dynamic Styles

HP bars use inline width. Solution: CSS variables
```pug
.hp-fill(style=`--hp-percent: ${(currentHp / maxHp) * 100}%`)
```
```css
.hp-fill { width: var(--hp-percent); }
```

---

## Implementation Phases

### Phase 1: CSS Extraction (1-2 hours)
1. Create `components.css` with reusable components
2. Create `pages.css` with page-specific styles
3. Update `layout.pug` to load new stylesheets
4. Remove inline styles from templates (5 files)
5. Test each page for visual correctness

### Phase 2: JavaScript Modules (2-3 hours)
1. Create `modules/` directory
2. Extract auth logic to `modules/auth.js`
3. Refactor `game.js` into `modules/game.js`, `modules/streaming.js`, `modules/saves.js`
4. Create entry points `main.js`, `game-client.js`
5. Update all templates with new script tags
6. Remove inline `<script>` blocks

### Phase 3: Build Process (30 min)
1. Install esbuild
2. Create `esbuild.config.mjs`
3. Update `package.json` scripts
4. Test build output
5. Update templates to use bundled scripts

### Phase 4: Testing (1 hour)
1. Login flow
2. Register flow
3. Homepage navigation
4. Lobby join/create
5. Character creation
6. Game page (SSE, chat, saves)

---

## Templates Requiring Updates

| Template | Inline Styles | Inline Scripts |
|----------|---------------|----------------|
| `login/index.pug` | 8 instances | 78 lines |
| `index.pug` | 5 instances | 8 lines |
| `lobby/index.pug` | 4 instances | 0 |
| `game/index.pug` | 3 instances | 0 |
| `characters/create.pug` | 2 instances | 0 |
| `ready-room/index.pug` | 0 | 0 |
| `layout.pug` | 1 inline style block | Update script loading |

---

## Success Criteria

- [ ] Zero inline `style="..."` attributes in templates
- [ ] Zero inline `<script>` blocks in templates
- [ ] All JS uses ES modules (import/export)
- [ ] CSS follows BEM naming convention
- [ ] All pages function identically to before
- [ ] Build process produces working bundles
- [ ] No console errors on any page

---

## Rollback Plan

If issues arise:
1. Git revert specific file(s) that broke
2. Keep old `game.js` and `streaming.js` as backup
3. Inline styles can be restored from git history
4. Each phase is independently reversible
