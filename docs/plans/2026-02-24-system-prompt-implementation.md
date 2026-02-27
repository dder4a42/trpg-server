# System Prompt Polishing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current list-style system prompt with an immersive, SCENE-framework-based prompt that produces richer narratives and distinct NPC personalities.

**Architecture:** Single file replacement with backup. The new prompt provides structured guidance (SCENE framework, dialogue patterns, output format rules) while keeping Chinese language and ~500 word length.

**Tech Stack:** Markdown file, prompt loading via `loadPrompt()` function, in-memory cache

---

## Task 1: Backup Current Prompt

**Files:**
- Create: `data/prompts/system_prompt_legacy.md`

**Step 1: Read current system prompt**

Run: `cat data/prompts/system_prompt.md`

Expected: See current ~150 word Chinese prompt

**Step 2: Copy to backup file**

```bash
cp data/prompts/system_prompt.md data/prompts/system_prompt_legacy.md
```

**Step 3: Verify backup was created**

Run: `cat data/prompts/system_prompt_legacy.md`

Expected: Content matches original

**Step 4: Commit backup**

```bash
git add data/prompts/system_prompt_legacy.md
git commit -m "chore: backup legacy system prompt before polishing"
```

---

## Task 2: Update System Prompt File

**Files:**
- Modify: `data/prompts/system_prompt.md`

**Step 1: Replace content with new prompt**

Replace entire file content with:

```markdown
# TRPG AI 地下城主系统指令

你是一位富有表现力、注重沉浸感的 TRPG 主持人（偏 D&D 5e 规则）。你的职责是创造引人入胜的冒险体验。

---

## 核心原则

1. **Show, Don't Tell** - 用感官细节描述，而非抽象概括
2. **NPC 是活人** - 每个角色有自己的声音、动机、性情
3. **玩家选择重要** - 不要替玩家决定，但要说明后果
4. **保持节奏** - 张弛有度，适时制造悬念和高潮

---

## SCENE 叙事框架

每个叙事回应应遵循 SCENE 结构：

**S - Setting（场景）** - 用 1-2 句话建立环境氛围（视觉、听觉、嗅觉）
**C - Characters（角色）** - 呈现 NPC 的当前状态和反应
**E - Event（事件）** - 交代刚刚发生的事
**N - Next（下一步）** - 给出玩家的具体选择（2-3个）
**E - End Hook（钩子）** - 结尾添加悬念或张力

---

## 对话风格指南

**NPC 对话要体现个性：**
- 老酒保：热情话痨，爱打听消息
- 城市守卫：生硬公事公办，对冒险者不屑
- 地精首领：暴躁贪婪，用尖锐声音吼叫
- 学者法师：迂腐严谨，说话时推眼镜

**格式：** 使用引号呈现对话，在旁白中描述语气和动作。

---

## 输出格式规范

**使用段落：** 场景描述、叙事推进、NPC 对话
**使用列表：** 玩家选择选项、战利品清单
**使用表格：** 复杂数据对比（如装备、价格）

**节奏控制：** 沉浸信息与清晰信息交替呈现。

---

## 骰子检定

需要检定时，说明检定类型和 DC（或合理范围），等待系统掷骰结果后再继续叙述。

---

**记住：你是在为玩家创造一段难忘的冒险回忆。让每个场景都生动起来，让每个 NPC 都鲜活起来！**
```

**Step 2: Verify file was updated**

Run: `cat data/prompts/system_prompt.md`

Expected: File now contains new ~500 word prompt with SCENE framework

**Step 3: Clear prompt cache to ensure reload**

The system caches prompts in memory. You may need to restart the dev server.

**Step 4: Commit new prompt**

```bash
git add data/prompts/system_prompt.md
git commit -m "feat: implement polished system prompt with SCENE framework"
```

---

## Task 3: Test with Sample Scenarios

**Files:**
- Test: Manual testing via game interface

**Step 1: Start dev server**

Run: `npm run dev`

Expected: Server starts successfully

**Step 2: Open game in browser**

Navigate to: `http://localhost:3000/game/<room-id>`

**Step 3: Send test action and observe output**

Test input: "我走进一家酒馆，环顾四周"

Expected response should:
- ✅ Start directly with sensory description (not "场景：" header)
- ✅ Include atmospheric details (sights, sounds, smells)
- ✅ Describe NPCs with personality if present
- ✅ End with concrete player choices

❌ Should NOT:
- ❌ Start with section headers
- ❌ Use bullet lists for narrative
- ❌ Feel robotic or generic

**Step 4: Test another scenario - combat**

Test input: "两只地精突然从阴影中出现攻击我们"

Expected response should:
- ✅ Use SCENE framework (Setting → Characters → Event → Next → Hook)
- ✅ Show goblins with distinct personality (aggressive, greedy)
- ✅ Give clear action choices
- ✅ Include tension/urgency

**Step 5: Verify prompt cache clearing if needed**

If output doesn't change, stop dev server and restart:

```bash
# Ctrl+C to stop
npm run dev
```

The `loadPrompt()` function uses caching by default. Restarting ensures fresh load.

---

## Task 4: Optional Tuning

**Files:**
- Modify: `data/prompts/system_prompt.md`

**Step 1: Monitor actual outputs**

Play through several scenarios and note patterns.

**Step 2: Identify needed adjustments**

Common issues to watch for:
- Still using lists too much → strengthen "使用段落" guidance
- NPCs still sounding same → add more voice examples
- Missing sensory details → emphasize Setting in SCENE

**Step 3: Make targeted edits**

Edit specific sections only, don't rewrite entire prompt.

**Step 4: Clear cache and retest**

```bash
# Add to prompts.ts or restart server
```

**Step 5: Commit improvements**

```bash
git add data/prompts/system_prompt.md
git commit -m "tune: strengthen [specific area] guidance based on testing"
```

---

## Verification Checklist

- [ ] Backup created at `data/prompts/system_prompt_legacy.md`
- [ ] New prompt includes SCENE framework
- [ ] New prompt includes dialogue guidelines with NPC examples
- [ ] New prompt includes output format rules
- [ ] No response starts with section headers (e.g., "场景：")
- [ ] NPCs have distinct personalities in dialogue
- [ ] Sensory details appear in scene descriptions
- [ ] Lists used only for choices/loot (not narrative)
- [ ] Prompt cache clearing works (restart shows new prompt)

---

## rollback Procedure (if needed)

If new prompt causes issues:

```bash
# Restore legacy prompt
cp data/prompts/system_prompt_legacy.md data/prompts/system_prompt.md

# Restart dev server to clear cache
# Test that behavior returns to previous state

# Commit rollback with note
git add data/prompts/system_prompt.md
git commit -m "revert: restore legacy system prompt due to [reason]"
```
