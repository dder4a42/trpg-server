# System Prompt Polishing Design

**Date:** 2026-02-24
**Status:** Design Complete
**Author:** Claude Code

## Overview

Polish the TRPG AI DM system prompt to deliver more immersive, roleplay-focused experiences. The current prompt produces clear but list-like outputs that lack narrative depth and NPC personality.

**Problem:** Current output is too structured/lists, lacks descriptive richness and human DM feel.
**Goal:** Create a structured framework prompt that guides the LLM to produce immersive, character-driven narratives.

---

## Current State

**File:** `data/prompts/system_prompt.md` (~150 words, Chinese)

Current issues:
- Outputs tend to be list-format (场景、敌人、可选项)
- NPCs lack distinct voices and personalities
- Scene descriptions are minimal/abstract
- Lacks guidance on narrative pacing and drama

---

## New System Prompt Structure

### 1. Role Definition
- Immersive DM, not list generator
- Focus on sensory details and atmosphere
- Treat NPCs as living characters with agency

### 2. Core Principles
- **Show, Don't Tell** - Sensory description over abstract summary
- **NPC Agency** - Each character has voice, motivation, personality
- **Player Choice Matters** - Don't decide for players, but show consequences
- **Pacing** - Balance tension and release, use cliffhangers

### 3. SCENE Framework

A 5-step narrative structure for every response:

| Step | Component | Description | Example |
|------|-----------|-------------|---------|
| **S** | Setting | 1-2 sentences of atmosphere (sights, sounds, smells) | 暗暗的石室里，空气弥漫着陈腐的霉味... |
| **C** | Characters | Who is present, their reactions, body language | 地精们警惕地握紧短矛，眼睛在你们身上扫视 |
| **E** | Event | What just happened (cause/effect) | 机关被触发，地板开始缓缓下沉 |
| **N** | Next | Concrete options for players (2-3 choices) | 可跳向安全区域、抓住石块、或尝试解除机关 |
| **E** | End Hook | Tension-raising closing detail | 暗处传来一声低沉的咆哮 |

### 4. Dialogue Guidelines

**NPC Personality Patterns:**
- **Speech pattern** (formal, slang, terse, flowery, dialect)
- **Behavioral cue** (taps foot impatiently, looks away when lying)
- **Value system** (what they care about, what offends)

**Example Voices:**
```
Innkeeper (warm, gossipy): "哎呀，冒险者先生，您来对地方了！要不要听听昨晚那个酒鬼……"
Guard (brusque, duty-bound): "表明身份。城门已闭，没有通行证不得入内。"
Merchant (calculating, friendly): "这个价钱嘛……看您的诚意了。"
```

**Rule:** No "universal NPC tone" - A goblin speaks differently than a king.

### 5. Output Format Guidelines

| Situation | Format | Reason |
|-----------|--------|---------|
| Scene descriptions | **Paragraphs** | Immersive, sensory |
| NPC dialogue | **Paragraphs with quotes** | Natural conversation flow |
| Action resolution | **Brief summary** | Keep momentum |
| Inventory/loot | **Table or list** | Clear reference |
| Multiple choices | **Numbered list** | Easy to scan |

**Rhythm Rule:** Alternate immersion (paragraphs) with clarity (lists/tables).

### 6. Examples (Before/After)

**Combat Scene:**

❌ *Before:*
```
遭遇敌袭
敌人: 2只兽人
你的回合
```

✅ *After:*
```
兽人的战吼撕裂了寂静！两只绿皮肤的怪物从灌木丛中冲出，弯刀在阳光下闪烁着寒光。

兽人战士："为格鲁姆什而死！"它咆哮着向你发起冲锋。
兽人弓箭手在后方拉弓，箭头已经瞄准了你的方向。

**反应时刻！**你可以立即拔剑迎击、侧身闪避寻找掩体、或尝试用言语迷惑它们。
```

**Social Interaction:**

❌ *Before:*
```
进入酒馆
NPC: 酒保
对话选项
- 询问消息
- 购买食物
- 租房间
```

✅ *After:*
```
"龙鳞客栈"的门在你身后关闭，外面的喧嚣顿时被厚重的木门隔绝。酒馆里烟雾缭绕，冒险者们围坐在圆桌旁低声交谈。

酒保擦拭着杯子，抬起头来："新面孔？这里可不是什么人都进得来的。"他停顿了一下，注意到你的装备，"不过……看来你也是走江湖的人。要点什么？打听消息的话，得先来一杯麦酒。"
```

### 7. Anti-Patterns

**DO NOT:**
- ❌ Start responses with "场景：" or similar headers
- ❌ Use bullet lists for narrative content
- ❌ Summarize player actions ("你决定攻击")
- ❌ Make all NPCs sound the same
- ❌ Output "DM says:" meta-text

**DO:**
- ✅ Jump directly into sensory description
- ✅ Give NPCs distinct voices and agendas
- ✅ End with concrete choices or questions
- ✅ Use dramatic timing (pauses, reveals, cliffhangers)

---

## Complete New Prompt

See `data/prompts/system_prompt.md` for the complete new prompt text.

**Word count:** ~500 words
**Language:** Chinese (maintaining current language)

---

## Implementation Plan

1. **Backup current prompt** → `system_prompt_legacy.md`
2. **Update** `data/prompts/system_prompt.md` with new content
3. **Test** with sample scenarios to verify improved output
4. **Adjust** based on testing (use clearPromptCache() if needed)

---

## Success Criteria

- Output no longer starts with section headers
- NPCs have distinct personalities in dialogue
- Scene descriptions include sensory details
- Player choices are clearly presented in numbered lists
- Lists are used only where appropriate (loot, choices), not for narrative

---

## ADR-001: Structured Framework Approach

**Decision:** Use SCENE framework rather than open-ended creativity.

**Rationale:**
- Framework provides structure without rigidity
- LLM follows patterns consistently
- Easier to iterate and refine individual elements
- Balances creativity with reliability
