# Combat Log 检定结果显示 - 增强指南

## 当前实现状态 ✅

检定结果显示功能已完整实现，架构如下：

### 数据流
```
玩家行动 
  → LLM 判断需要检定 
  → 调用 request_ability_check / request_saving_throw 工具
  → GameEngine.abilityCheck() / savingThrow() 执行检定
  → 生成 DiceRollEvent
  → SSE 广播 {type: 'dice-roll', data: {...}}
  → 前端 sseBus 接收
  → combatEvents.renderDiceRoll() 渲染
  → 显示在 #combat-log-full
```

### 支持的检定类型
- ✅ **Ability Check** (属性检定)
- ✅ **Saving Throw** (豁免检定)
- ✅ **Group Check** (集体检定) - 后端已实现，前端可扩展
- ⏳ **Attack Roll** (攻击检定) - 待集成到 Combat State

## 使用方法

### 1. 触发检定
在游戏中输入行动，例如：
```
我想潜行靠近敌人            → DEX (Stealth) 检定
我尝试说服守卫              → CHA (Persuasion) 检定
我搜索房间寻找线索          → INT (Investigation) 检定
我攀爬墙壁                  → STR (Athletics) 检定
我试图抵抗魅惑              → WIS Saving Throw
```

### 2. 查看结果
1. 点击右侧边栏的 **Combat** 标签页
2. 检定结果实时显示，包含：
   - 角色名 + 检定类型 + 属性
   - DC 难度值
   - 掷骰公式（如 `1d20+3`）
   - 总计结果
   - 成功/失败（绿色/红色高亮）
   - 检定原因

## 可选增强功能

### 1. 添加技能检定类型显示

当前只显示属性，可以增加具体技能名（如 Stealth, Persuasion）。

**修改文件**: `public/js/modules/combatEvents.js`

```javascript
function renderDiceRollEntry(rollData) {
  const entry = document.createElement('div');
  const success = !!rollData?.success;
  entry.className = `dice-roll-entry ${success ? 'success' : 'failure'}`;

  const characterName = escapeHtml(rollData?.characterName || 'Unknown');
  const checkType = escapeHtml(rollData?.checkType || 'Check');
  const ability = escapeHtml(rollData?.ability || '');
  const skill = escapeHtml(rollData?.skill || ''); // 新增
  const dc = rollData?.dc !== undefined ? `DC ${escapeHtml(rollData.dc)}` : '';
  const formula = escapeHtml(rollData?.roll?.formula || '');
  const total = rollData?.roll?.total !== undefined ? rollData.roll.total : '';
  const reason = escapeHtml(rollData?.reason || '');

  entry.innerHTML = `
    <div class="dice-roll-header">
      <span class="dice-roll-character">${characterName}</span>
      <span class="dice-roll-check">${checkType}</span>
      <span class="dice-roll-ability">${ability}${skill ? ` (${skill})` : ''}</span>
      <span class="dice-roll-dc">${dc}</span>
    </div>
    <div class="dice-roll-body">
      <span class="dice-roll-formula">${formula}</span>
      <span class="dice-roll-total">${escapeHtml(total)}</span>
      <span class="dice-roll-result">${success ? '✓ Success' : '✗ Fail'}</span>
      ${reason ? `<span class="dice-roll-reason">${reason}</span>` : ''}
    </div>
  `;

  return entry;
}
```

### 2. 改进样式（高亮和图标）

**文件**: `public/css/game.css`

```css
/* 检定结果条目 */
.dice-roll-entry {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 6px;
  border-left: 4px solid var(--accent-color);
  background: rgba(255, 255, 255, 0.05);
  font-size: 0.9rem;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dice-roll-entry.success {
  border-left-color: #4ade80;
  background: rgba(74, 222, 128, 0.1);
}

.dice-roll-entry.failure {
  border-left-color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}

.dice-roll-header {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.dice-roll-character {
  font-weight: bold;
  color: var(--primary-color);
}

.dice-roll-check {
  color: var(--text-muted);
  text-transform: capitalize;
}

.dice-roll-ability {
  font-family: monospace;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
}

.dice-roll-dc {
  font-weight: bold;
  color: var(--warning-color);
}

.dice-roll-body {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.dice-roll-formula {
  font-family: monospace;
  color: var(--text-muted);
}

.dice-roll-total {
  font-size: 1.3em;
  font-weight: bold;
  color: var(--accent-color);
}

.dice-roll-result {
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.85em;
}

.dice-roll-entry.success .dice-roll-result {
  background: #4ade80;
  color: #1a1a1a;
}

.dice-roll-entry.failure .dice-roll-result {
  background: #f87171;
  color: #1a1a1a;
}

.dice-roll-reason {
  font-style: italic;
  color: var(--text-muted);
  flex: 1 1 100%;
}
```

### 3. 添加过滤和排序功能

允许玩家按角色、检定类型过滤 Combat Log。

**新增文件**: `public/js/modules/combatFilters.js`

```javascript
/**
 * Combat Log Filtering
 */
export class CombatLogFilter {
  constructor() {
    this.filters = {
      character: 'all',
      checkType: 'all',
      result: 'all'
    };
    this.setupUI();
  }

  setupUI() {
    const combatPanel = document.getElementById('combat-log-panel');
    if (!combatPanel) return;

    const filterBar = document.createElement('div');
    filterBar.className = 'combat-filter-bar';
    filterBar.innerHTML = `
      <select id="filter-character">
        <option value="all">All Characters</option>
      </select>
      <select id="filter-check-type">
        <option value="all">All Checks</option>
        <option value="ability_check">Ability Check</option>
        <option value="saving_throw">Saving Throw</option>
      </select>
      <select id="filter-result">
        <option value="all">All Results</option>
        <option value="success">Success Only</option>
        <option value="failure">Failure Only</option>
      </select>
      <button id="clear-combat-log" class="btn-secondary">Clear Log</button>
    `;

    combatPanel.insertBefore(filterBar, combatPanel.firstChild.nextSibling);

    // Event listeners
    document.getElementById('filter-character')?.addEventListener('change', (e) => {
      this.filters.character = e.target.value;
      this.applyFilters();
    });

    document.getElementById('filter-check-type')?.addEventListener('change', (e) => {
      this.filters.checkType = e.target.value;
      this.applyFilters();
    });

    document.getElementById('filter-result')?.addEventListener('change', (e) => {
      this.filters.result = e.target.value;
      this.applyFilters();
    });

    document.getElementById('clear-combat-log')?.addEventListener('click', () => {
      this.clearLog();
    });
  }

  applyFilters() {
    const entries = document.querySelectorAll('#combat-log-full .dice-roll-entry');
    
    entries.forEach(entry => {
      const character = entry.querySelector('.dice-roll-character')?.textContent;
      const checkType = entry.dataset.checkType;
      const isSuccess = entry.classList.contains('success');

      let visible = true;

      if (this.filters.character !== 'all' && character !== this.filters.character) {
        visible = false;
      }

      if (this.filters.checkType !== 'all' && checkType !== this.filters.checkType) {
        visible = false;
      }

      if (this.filters.result === 'success' && !isSuccess) {
        visible = false;
      } else if (this.filters.result === 'failure' && isSuccess) {
        visible = false;
      }

      entry.style.display = visible ? 'block' : 'none';
    });
  }

  clearLog() {
    const log = document.getElementById('combat-log-full');
    if (log && confirm('Clear all combat log entries?')) {
      log.innerHTML = '<div class="empty-state">No dice rolls yet</div>';
    }
  }

  updateCharacterFilter(characters) {
    const select = document.getElementById('filter-character');
    if (!select) return;

    const current = select.value;
    select.innerHTML = '<option value="all">All Characters</option>';
    
    characters.forEach(char => {
      const option = document.createElement('option');
      option.value = char;
      option.textContent = char;
      select.appendChild(option);
    });

    select.value = current;
  }
}
```

### 4. 添加统计面板

显示成功率、最常见的检定类型等。

**新增**: `public/js/modules/combatStats.js`

```javascript
/**
 * Combat Log Statistics
 */
export class CombatStats {
  constructor() {
    this.stats = {
      totalChecks: 0,
      successCount: 0,
      byCharacter: {},
      byCheckType: {}
    };
  }

  recordCheck(rollData) {
    this.stats.totalChecks++;
    
    if (rollData.success) {
      this.stats.successCount++;
    }

    const char = rollData.characterName || 'Unknown';
    if (!this.stats.byCharacter[char]) {
      this.stats.byCharacter[char] = { total: 0, success: 0 };
    }
    this.stats.byCharacter[char].total++;
    if (rollData.success) {
      this.stats.byCharacter[char].success++;
    }

    const type = rollData.checkType;
    if (!this.stats.byCheckType[type]) {
      this.stats.byCheckType[type] = { total: 0, success: 0 };
    }
    this.stats.byCheckType[type].total++;
    if (rollData.success) {
      this.stats.byCheckType[type].success++;
    }
  }

  getSuccessRate() {
    return this.stats.totalChecks > 0 
      ? (this.stats.successCount / this.stats.totalChecks * 100).toFixed(1)
      : 0;
  }

  renderStats() {
    return `
      <div class="combat-stats">
        <h4>Session Statistics</h4>
        <div class="stat-row">
          <span>Total Checks:</span>
          <span>${this.stats.totalChecks}</span>
        </div>
        <div class="stat-row">
          <span>Success Rate:</span>
          <span>${this.getSuccessRate()}%</span>
        </div>
      </div>
    `;
  }
}
```

### 5. 集成到 combatEvents.js

**修改**: `public/js/modules/combatEvents.js`

```javascript
import { store } from './store.js';
import { CombatStats } from './combatStats.js';

const combatStats = new CombatStats();

function renderDiceRoll(rollData) {
  console.log('[CombatEvents] renderDiceRoll called with:', rollData);
  
  const key = generateDedupeKey('dice-roll', rollData);
  const entry = renderDiceRollEntry(rollData);
  
  // Add data attributes for filtering
  entry.dataset.checkType = rollData.checkType;
  entry.dataset.character = rollData.characterName;

  store.dispatch({
    type: 'COMBAT_ADD_ENTRY',
    payload: { key, entry: rollData },
  });

  // Record in stats
  combatStats.recordCheck(rollData);

  const { fullLog } = getCombatTargets();

  if (fullLog) {
    const emptyState = fullLog.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }
    fullLog.prepend(entry);
    
    // Update stats display (if exists)
    updateStatsDisplay();
  }
}

function updateStatsDisplay() {
  let statsPanel = document.getElementById('combat-stats-panel');
  if (!statsPanel) {
    statsPanel = document.createElement('div');
    statsPanel.id = 'combat-stats-panel';
    const combatPanel = document.getElementById('combat-log-panel');
    combatPanel?.appendChild(statsPanel);
  }
  statsPanel.innerHTML = combatStats.renderStats();
}
```

## 后续扩展

### 支持更多检定类型
- **技能检定**: 需要后端 GameEngine 区分技能（如 Stealth, Persuasion）
- **攻击检定**: 当进入 Combat State 时自动启用
- **伤害掷骰**: 在攻击命中后显示伤害

### 数据持久化
将 Combat Log 保存到 `GameState`，允许：
- 会话恢复后查看历史检定
- 导出战斗日志为 PDF/JSON
- 跨设备同步

### 实时通知
检定结果发生时：
- 浏览器通知（Notification API）
- 音效提示（成功/失败不同音效）
- Combat tab 未读计数徽章

---

**当前状态**: 核心功能已完整实现 ✅  
**文档更新**: 2026-02-24
