# 2026-02-24 前端重构设计（适配最新后端 + 战斗扩展）

## 背景与目标

当前前端以多份原始脚本（`public/js/*.js`）+ 少量 ES modules（`public/js/modules/*.js`）混用，存在重复实现、入口不清晰、交互缺口，以及与最新后端 rooms 路由拆分/SSE 事件格式不完全对齐的问题。

本设计文档定义一次“以游戏页为核心”的前端重构方案，覆盖：
- 移除过时代码（避免两套逻辑并存）
- 模块化（单一入口 + 统一依赖与事件流）
- 更新交互逻辑（tabs、战斗日志、行动限制、状态栏刷新等）
- 适配最新后端（rooms/actions/notes/state/streaming/chat/messages/partials）
- 预留面向战斗系统的扩展接口（插件式事件处理）

## 范围

### In Scope
- 游戏页（Game Page）交互与脚本组织：
  - SSE 事件消费（流式文本、骰子、行动限制、成员变化、聊天）
  - Tabs（Status/Combat/Chat/Saves）切换逻辑
  - Notes、Chat、Saves、Members 的加载/刷新
  - Status panel 的 partial 刷新与增量重初始化
- 对接后端 API 的调用层抽象（统一 fetch/错误处理）
- Combat UI 扩展点（只定义接口与默认实现，不引入完整战斗系统 UI）

### Out of Scope（本轮不做）
- UI 视觉重设计、CSS 大改
- 引入大型前端框架（React/Vue/Svelte）
- Ready Room 的全面模块化（可在后续作为第二阶段；本设计预留接入点）

## 现状问题（从交互与维护成本角度）

### 1) 脚本入口混乱与重复实现
- 已存在模块化入口：游戏页加载 `public/js/game-client.js`（type=module），其内部使用 `public/js/modules/*`。
- 但仍存在 legacy 脚本：
  - `public/js/game.js`（旧版 TRPGClient）
  - `public/js/streaming.js`（包含 SSEConnection/StreamingManager/DiceRollManager/ActionRestrictionManager/Tab logic 等）
  - `public/js/members.js`（独立 EventSource 连接 + members-updated 监听）
- 结果：同一需求（SSE、tab、骰子、限制）有两套实现，但游戏页实际只用其中一套，导致：
  - 交互缺失（例如 dice-roll/action-restriction 在模块链路未消费）
  - 未来维护误改（改了未被加载的 legacy 文件，以为生效）

### 2) 交互缺口（真实用户可见）
- Tabs：页面有 Combat tab 与 `#combat-log-panel`，但 `public/js/game-client.js` 的 tabs 仅处理 status/chat/saves，导致 Combat tab 无法正确显示。
- SSE 游戏事件：后端会在 `event: message` 内广播 `type: dice-roll` 与 `type: action-restriction`，模块化 SSE 处理目前主要关注 streaming 文本与 chat，导致战斗/规则反馈缺失。
- Notes 空态：status partial 的 empty-state 默认隐藏；Notes Manager 初始化不强制刷新空态状态，导致“无笔记时区域空白”。

### 3) 与最新后端契约需要显式化
后端已拆分路由并形成更稳定的契约：
- Rooms Actions：`/api/rooms/collect-action`、`/api/rooms/process-actions`、`/api/rooms/action`
- Notes：`/api/rooms/:roomId/notes`、`/api/rooms/:roomId/notes/:noteId`（稳定 noteId）
- SSE：`/api/stream/rooms/:roomId/stream`（`event: message|chat|...`）
- Markdown finalize：`/api/messages/markdown`
- Status partial：`/partials/room/:roomId/status`

前端需要把这些 endpoint、payload、事件类型收敛为单一“契约层”，避免分散在多个 manager 内。

## 目标架构（模块化与可扩展）

### 设计原则
- 单页单入口：游戏页只有一个入口模块负责装配（composition root）。
- 单 SSE 连接：同一 room 页面只创建一个 EventSource，所有功能通过订阅该连接的事件总线实现。
- 单 API client：统一 `fetchJson`/`fetchText`/错误处理/重试策略（必要时）
- 插件式事件扩展：Combat/Rules 事件通过注册 handler 扩展，避免核心模块变成大杂烩。

### 推荐文件结构（在现有 `public/js/modules/` 基础上增补）

- `public/js/game-client.js`：游戏页 composition root（保留）。
- `public/js/modules/api.js`：统一的 API client（新增）。
- `public/js/modules/sseBus.js`：单 SSE 连接 + event 分发（新增）。
- `public/js/modules/tabs.js`：tabs 切换（新增或从 game-client.js 拆出）。
- `public/js/modules/storyStream.js`：streaming 容器定位 + chunk/complete/error（新增或从 modules/game.js 抽出）。
- `public/js/modules/combatEvents.js`：dice-roll、action-restriction 默认渲染（新增）。
- `public/js/modules/members.js`：成员列表渲染（将 legacy members.js 模块化并改为订阅 SSE bus）。
- `public/js/modules/notes.js`：保留，增加“空态修复/与 status partial 重初始化契约”。
- `public/js/modules/chat.js`：保留。
- `public/js/modules/saves.js`：保留。

说明：不引入 bundler，继续采用原生 ES modules；新增文件保持小而清晰。

## 与后端的契约（Endpoints & Payload）

### 1) 行动提交（turn-based）
- `POST /api/rooms/collect-action`
  - body：`{ roomId, userId, username, action, characterId? }`
  - 若带 `X-Requested-With: XMLHttpRequest` 或 htmx，则返回 HTML 片段（玩家消息 + 可能的 DM streaming 容器）。
  - 当“所有玩家已行动”时，后端会通过 SSE `event: message` 广播：
    - `type: streaming-chunk`（多次）
    - `type: streaming-complete`
    - 或 `type: streaming-error`
    - 同时可能广播 `type: dice-roll` / `type: action-restriction`

前端约定：
- 仍使用 collect-action（与当前页面 form 结构一致），并保留 MutationObserver/显式 hook 用于将 streaming 输出绑定到刚插入的 DM 容器。

### 2) 单人输入（可选）
- `POST /api/rooms/action`：body `{ roomId, input, stream, userId?, username?, characterId? }`

前端约定：
- 作为未来“非回合制/单人模式”的扩展路径；本轮不替换默认游戏页回合制提交。

### 3) Notes（稳定 ID）
- `GET /api/rooms/:roomId/notes` → `{ success, notes: PlayerNote[] }`
- `POST /api/rooms/:roomId/notes` body `{ note }` → `{ success, notes: PlayerNote[] }`
- `DELETE /api/rooms/:roomId/notes/:noteId` → `{ success, notes: PlayerNote[] }`

前端约定：
- UI DOM 绑定以 `data-note-id = note.id` 为准，不再做 index-based resync。
- status partial 重载后，需要重新初始化 Notes manager，并立刻刷新空态。

### 4) SSE（事件流）
- `GET /api/stream/rooms/:roomId/stream`
- 事件：
  - `event: message`：JSON（流式/游戏事件）
  - `event: chat`：JSON（聊天消息）
  - `event: members-updated`：JSON（成员变化）

前端约定：
- `sseBus` 统一接入，按 event 名称分发到各模块订阅者。
- `event: message` 内部再按 `data.type` 分发：
  - `streaming-chunk|streaming-complete|streaming-error`
  - `dice-roll`
  - `action-restriction`

### 5) Markdown finalize
- `POST /api/messages/markdown` body `{ content }` → `{ html }`

前端约定：
- streaming complete 后，若需要将纯文本转换为最终 HTML，可调用该接口并替换容器内容。

## 交互逻辑重构要点

### 1) Tabs（Status/Combat/Chat/Saves）
- 将 tabs 切换逻辑收敛到 `modules/tabs.js`（或扩展 game-client.js），保证：
  - Combat tab 会显示 `#combat-log-panel`
  - 现有 Status panel 切换时触发 `loadStatusPanel()` 仍成立

### 2) Combat/Rules 事件展示（默认实现）
- 新增 `modules/combatEvents.js`：
  - `onDiceRoll(event)`：渲染到 `#combat-log` 与 `#combat-log-full`（若存在）
  - `onActionRestriction(event)`：渲染到 `#turn-gate-status`（或单独容器）
- 仅实现“可见反馈”，不引入复杂交互。

### 3) Members
- 将 legacy `public/js/members.js` 的核心渲染提取为 `modules/members.js`，并改为订阅 `members-updated` SSE 事件，避免单页多 EventSource。

### 4) Notes
- `modules/notes.js`：
  - init 完成后立即 `updateEmptyState()`
  - status partial 替换 DOM 后，重初始化 Notes manager

## DOM 更新与数据状态管理方案（应对一致性/状态/组件更新）

本节给出一个“不引入框架、仍用原生 ES modules”的状态与渲染方案，用于解决：
- 数据一致性：多数据源（SSE + 本地操作 + partial 刷新）冲突
- 数据状态：状态分散在 DOM/manager 实例里导致难以推理
- 组件更新：频繁 `innerHTML` 替换导致事件丢失/重复绑定

### 1) 核心原则：单向数据流 + 明确数据权威

定义：
- **事件输入**：SSE（push）、HTTP API（pull + mutation）、用户交互（click/submit）
- **唯一状态树**：`RoomUIState` 作为页面上的单一事实来源（source of truth）
- **渲染输出**：DOM 只由 state 派生（或在少数“流式增量”场景允许增量写入）

权威来源规则（建议默认）：
- **members**：以 SSE `members-updated` 为准（无需每次 fetch 全量刷新）；首次进入页面可 fetch 初值。
- **chat**：以 SSE `event: chat` 为准；首次进入页面拉取 `GET /api/chat/.../messages`。
- **notes**：以 Notes API 的返回 `notes[]` 为准（提交/删除返回全量），partial 只负责展示但不作为权威。
- **combat log / rules**：以 SSE `event: message` 内 `type` 为准，前端只做渲染与去重。
- **status panel**：以 `/partials/room/:roomId/status` 为准（服务端汇总视图），但其 DOM 子树是“可替换的展示层”，交互能力由前端重初始化/rehydrate 保证。

### 2) 状态模型：RoomUIState（最小可用）

建议定义一个轻量 store（不依赖第三方）：

```js
// 概念定义（建议放在 public/js/modules/store.js）
const initialState = {
  roomId: null,

  streaming: {
    active: false,
    targetElementId: null,
    buffer: [],
    fullText: '',
    lastCompleteAt: null,
  },

  members: {
    byUserId: {},
    order: [],
    version: 0,
  },

  chat: {
    lastSeenTimestamp: 0,
  },

  notes: {
    byId: {},
    order: [],
    version: 0,
  },

  combat: {
    // 只存最近 N 条用于渲染；去重用 seenKeys
    entries: [],
    seenKeys: [],
    maxEntries: 200,
  },

  statusPanel: {
    lastLoadedAt: null,
    loading: false,
    requestSeq: 0,
  },
};
```

要点：
- `version/requestSeq` 用于避免竞态覆盖（例如多次并发刷新 status panel）。
- `byId/order` 用于按 key 做幂等更新（notes/members）。
- streaming 允许“先到 chunk 后到 target”时缓存 `buffer`。

### 3) 事件→Action→Reducer→Render 的流程

建议把所有外部输入映射为 action：

```js
dispatch({ type: 'SSE_MESSAGE', payload });
dispatch({ type: 'MEMBERS_UPDATED', payload });
dispatch({ type: 'NOTES_SYNCED', payload: notes });
dispatch({ type: 'STATUS_PARTIAL_LOADED', payload: { html, seq } });
```

Reducer 只做“纯数据变换”，DOM 更新由订阅者统一调度：
- `subscribe(render)`
- 将多次 dispatch 合并到同一帧执行（`requestAnimationFrame`）避免抖动。

### 4) DOM 更新策略：稳定根节点 + 局部 patch + 可替换展示子树

#### A. 稳定根节点
保证这些容器节点 **不被 partial 替换**，便于挂载交互：
- `#story-output`（流式文本 + 历史）
- `#members-list`（成员）
- `#combat-log` / `#combat-log-full`（战斗日志）
- `#turn-gate-status`（限制/状态提示）

#### B. Partial 替换的边界（Status Panel）
`#status-body` 可整段 `innerHTML = html`，但替换后必须调用：
- `rehydrateStatusSubtree()`：重建 notes 的事件绑定、空态、以及任何将来新增的 status 内交互。

同时引入 **并发保护**：
- 每次刷新 status 时递增 `requestSeq`，响应回来若 `seq < currentSeq` 则丢弃（避免旧响应覆盖新 UI）。

#### C. 列表渲染的 key 与幂等
- members：以 `userId` 为 key，渲染时先构造 DocumentFragment，再一次性替换内容（避免逐行抖动）。
- notes：以 `note.id` 为 key；删除/新增后以 API 返回的 notes 全量重建 `byId/order`（避免“局部补丁”引发不同步）。
- combat entries：后端 payload 可能没有稳定 id，前端生成 `dedupeKey = hash(type + JSON.stringify(data))`，保存最近 500 个 key 的环形队列；收到重复事件直接丢弃。

### 5) SSE 竞态与流式一致性（streaming buffer/replay）

问题：chunk 可能先到，而 DM 的 `streaming-response-xxx` 容器由 collect-action 返回的 HTML 片段稍后插入。

策略：
- streaming state 始终维护 `buffer[]`。
- 当 `targetElementId` 为空时：
  - 将 chunk 写入 `buffer`，并累积 `fullText`。
- 当 MutationObserver 发现新容器后：
  - 立即设置 `targetElementId`
  - flush `buffer` 到 DOM（按顺序 append）
- complete 到达时：
  - 若有 target：调用 `/api/messages/markdown` 得到 html 覆盖
  - 若无 target：将 fullText 作为 fallback 插入（或先等待短暂窗口，如 300ms）

### 6) 组件生命周期：绑定一次、可重入的 init/rehydrate

所有 manager（notes/chat/saves/members）应满足：
- `init()` 可重复调用（不会重复绑定导致 double trigger）
- `destroy()` 可选，用于页面卸载时释放订阅

尤其是 status partial 场景：
- `loadStatusPanel()` 只负责替换 `#status-body` + 调用 `PlayerNotesManager.init()`
- Notes manager 内部使用事件代理（已做）并在 init 时先 clone node 清理旧监听（已做）

### 7) 质量闸：一致性验收（新增）

在原 DoD 基础上补充：
- status panel 连续刷新（快速切 tab）不会出现旧内容覆盖新内容。
- streaming chunk 在 target 未就绪时不会丢失（buffer flush 后内容连续）。
- combat log 不会因 SSE 重连/重复广播产生重复条目（去重生效）。
- notes 在 status partial 刷新后不会出现重复事件绑定或无法删除。

## 战斗系统扩展接口（预留）

目标：未来战斗系统会引入更多 `message` 内的 `type`（例如 `combat-state`, `initiative-updated`, `hp-changed`, `status-effect-added` 等），前端不应把所有 `switch(type)` 堆到一个文件。

### 事件类型与插件接口
定义约定：
- 所有“游戏事件”仍由 SSE `event: message` 承载。
- `data` 结构：`{ type: string, ... }`

插件接口（概念）：
- `GameEventHandler = (evt, ctx) => void`
- `ctx` 提供：
  - `roomId`
  - `renderTarget`（一组已知 DOM 容器获取函数）
  - `api`（统一 api client）

实现建议：
- `sseBus` 暴露 `registerMessageType(type, handler)`
- `combatEvents.js` 作为默认插件注册：
  - `dice-roll` → handler
  - `action-restriction` → handler

这样未来新增战斗事件只需要新增一个插件模块并注册，不需要改动核心入口。

## 移除/下线过时代码清单（候选）

本轮重构完成后，以下文件应明确“不可再被页面加载/不可再维护”，并计划删除或移入 `public/js/legacy/`：
- `public/js/game.js`（旧版 TRPGClient，已被 modules 体系替代）
- `public/js/streaming.js`（包含重复的 SSE/tab/combat 逻辑；游戏页未加载）

说明：如果仍有页面在使用这些文件，应先通过全局检索确认引用点，再分阶段移除。

此外，`views/layout.pug` 当前会在所有页面加载：
- `script(defer, src='/js/members.js')`

建议改为：
- members 只在需要显示 members 的页面加载（例如 game page），或将其并入 game-client 的模块体系。

## 迁移计划（分阶段、可回滚）

### Phase 0：基线与盘点
- 全局检索确认以下 legacy 脚本是否仍被任何页面引用：`public/js/game.js`、`public/js/streaming.js`。
- 建立“单入口”规则：游戏页只由 `public/js/game-client.js` 装配。

### Phase 1：SSE Bus 与 Combat 默认事件
- 引入 `modules/sseBus.js`，让 game-client 使用它建立唯一 SSE 连接。
- 在 modules 体系中实现 `dice-roll` 与 `action-restriction` 的默认渲染。

### Phase 2：Tabs 修复与 UI 对齐
- 抽出/修复 tabs 切换，确保 combat tab 可用。
- Status panel 刷新与 Notes 初始化逻辑固定化。

### Phase 3：Members 模块化与单 SSE
- 将 members 的渲染逻辑迁移到模块体系，移除 game 页额外 EventSource。

### Phase 4：删除/下线 legacy 文件
- 移除对 legacy 文件的引用（若仍有）。
- 删除/归档 legacy 文件。

## 验收标准（DoD）

- 游戏页只创建 1 个 EventSource 连接。
- Combat tab 可正常切换，并显示 `dice-roll` 事件产生的日志条目。
- 行动限制（action-restriction）在 UI 有可见反馈（至少文本提示）。
- Notes：新增/删除稳定按 noteId 工作；无笔记时显示空态；status partial 刷新后 notes 功能仍可用。
- members-updated 能更新成员列表且不额外创建 SSE 连接。
- 仓库内不存在“看似可用但实际未加载”的重复实现（legacy 文件已下线/删除/隔离）。

---

## 附：与现有文件的对应关系（便于实施）

- 游戏页入口：`views/game/index.pug` → `script(type='module', src='/js/game-client.js')`
- 现有模块：
  - `public/js/modules/api.js`（统一 fetch：json/text/response）
  - `public/js/modules/sseBus.js`（单 SSE 连接 + event/type 分发）
  - `public/js/modules/game.js`（TRPGClient：流式渲染 + action 提交）
  - `public/js/modules/combatEvents.js`（dice-roll / action-restriction 默认展示）
  - `public/js/modules/members.js`（成员渲染 + 订阅 members-updated）
  - `public/js/modules/notes.js`、`public/js/modules/chat.js`、`public/js/modules/saves.js`
- 现有 partial：`/partials/room/:roomId/status` → `views/partials/status-bar.pug`
