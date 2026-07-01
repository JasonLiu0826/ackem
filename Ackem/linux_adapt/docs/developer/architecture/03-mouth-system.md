# Mouth System

> **Language:** English · [中文](./03-mouth-system.zh.md)

> **Layer:** Prompt assembly + LLM invocation  
> **Codename:** Mouth Engine  
> **Core question:** How do we assemble context blocks from other systems into a prompt? How do we call the LLM and handle streaming responses?  
> **Design principle:** The Mouth System only decides *how* content is written in; *whether* a given context block is included is decided by the orchestrator / injectionPolicy

---

## 1. Role

The Mouth System is the **only layer on the normal chat path that directly calls a large language model**. It does **not** run relationship FSMs or memory storage—it only handles **expression**.

```
tierBBlock (Brain System)   ──┐
psycheBlock (Heart System)   ──┤
Canon (Ackem persona)        ──┤
Extension injection          ──┤
Personality / adult mode     ──┤
Conversation history         ──┤
                              ▼
              ┌──────────────────┐
              │  context.ts      │  ← assemble system + messages
              │  + prompt/       │
              └──────┬───────────┘
                     ▼
              ┌──────────────────┐
              │  llmClient.ts    │  ← OpenAI / Anthropic dual provider
              │  + llmEndpoint   │
              └──────┬───────────┘
                     ▼
                Streaming tokens → UI
```

---

## 2. Prompt Directory Structure

**Root:** `src/main/prompt/` (25 files)

| File | Purpose | When invoked | Output format |
|------|---------|--------------|---------------|
| `main-chat.ts` | Main chat system prompt skeleton | Every turn | Rule text |
| `personality.ts` | 29 full personality templates (Chinese) | Every turn | PersonalityTemplate object |
| `personality.en.ts` | 29 full personality templates (English) | English mode | PersonalityTemplate object |
| `emotion-fusion.ts` | Character state block (7 sections) | Every turn | Structured system prompt sections |
| `emotion-fusion.en.ts` | Emotion fusion (English) | English mode | Same as left |
| `adult-mode.ts` | Adult mode state machine + safety gate | Adult mode | State machine + temperature offset + prompt sections |
| `task-frame.ts` | Tool-call follow-up frame | After extension execution | Instruction text |
| `tool-followup.ts` | Tool execution result prompt | After extension execution | Formatted result |
| `memory-fact-extract.ts` | Memory fact extraction prompt | Post-LLM | JSON schema |
| `memory-episode.ts` | Episode summary prompt | Post-LLM | JSON schema |
| `memory-consolidation.ts` | Memory consolidation prompt | Scheduled | JSON schema |
| `memory-contradiction.ts` | Contradiction detection prompt | On write | JSON schema |
| `memory-document-import.ts` | Document import understanding prompt | On import | JSON schema |
| `memory-six-dimension.ts` | Six-dimension profile inference prompt | Profile update | JSON schema |
| `diary.ts` | Diary generation prompt | Daily schedule | Natural language |
| `knowledge-card.ts` | Knowledge card generation prompt | Knowledge curation | Markdown |
| `search-query-resolver.ts` | Search intent resolution prompt | Search Skill | Tool parameters |
| `plan-document.ts` | Document Plan prompt | OpenForU | Plan structure |
| `turn-plan.ts` | Turn planning prompt | orchestrator | Behavior instructions |
| `openforu-plan.ts` | OpenForU Plan generation | User triggered | Plan structure |
| `openforu-codegen.ts` | OpenForU code generation | Deployment | TypeScript |
| `openforu-evolve.ts` | Extension evolution prompt | Iteration | diff format |
| `openforu-craft-ask.ts` | OpenForU requirement clarification prompt | Requirement analysis | Follow-up questions |
| `prompt-i18n.ts` | Multilingual copy (emergence, etc.) | Various modules | Translation key-value pairs |
| `index.ts` | Unified exports | Call sites | — |

---

## 3. Six-Layer Prompt Architecture

Ackem prompts are physically spread across multiple files but logically stacked in layers:

```
┌────────────────────────────────────────────────────────────┐
│  ① Personality — TISOR five dimensions + verbal tics +     │
│     example dialogues + core contradiction                 │
│     «You are "tsundere". Core contradiction: you care but  │
│      won't admit it.»                                      │
│     Source: personality.ts → emotion-fusion.ts             │
│     Assembly: buildPersonalitySection() + buildExampleSection() │
├────────────────────────────────────────────────────────────┤
│  ② Emotion — 4D values + fusion strategy + prohibitions +  │
│     reaction words                                         │
│     «Dominant emotion: sweet attachment. Affinity 72/100.»│
│     Source: emotion-fusion.ts                              │
│     Assembly: buildEmotionSection() + buildFusionSection() │
├────────────────────────────────────────────────────────────┤
│  ③ Baseline — safety rules + Canon + adult mode safety gate│
│     «These facts cannot be rewritten: Ackem was created by   │
│      Jason Liu…»                                           │
│     Source: main-chat.ts + adult-mode.ts                   │
├────────────────────────────────────────────────────────────┤
│  ④ Boundaries — pacing + silence tendency + barrier        │
│     awareness + tone mirroring                             │
│     «The user replies briefly; cap your reply at 15 chars.»│
│     Source: psyche.ts + emotion-fusion.ts (mirrorHint)     │
├────────────────────────────────────────────────────────────┤
│  ⑤ Memory — Tier A + Tier B + Tier C + user info           │
│     «You remember the user likes cats and has an orange    │
│      cat named Mimi…»                                      │
│     Source: context.ts → readTierACompanion() + retriever  │
├────────────────────────────────────────────────────────────┤
│  ⑥ Self-care — extension capability list + tool declarations│
│     + extension context injection                          │
│     «You have these capabilities: web-search, weather-check…»│
│     Source: extensions/dispatch + mergeExtensionContext()  │
└────────────────────────────────────────────────────────────┘
```

### Why six layers?

Each layer solves an **independent problem**; changing one layer does not affect the others:

| Layer | Who changes it | Who can ignore it |
|-------|----------------|-------------------|
| Personality | Personality preset designers | Everyone else |
| Emotion | Heart System developers | Everyone else |
| Baseline | Safety / compliance | Everyone else |
| Boundaries | Pacing / experience | Everyone else |
| Memory | Memory System developers | Everyone else |
| Self-care | Extension System developers | Everyone else |

---

## 4. System Prompt Skeleton — `buildSystemPrompt()`

**File:** `src/main/prompt/main-chat.ts`

The main chat system prompt contains **~17 rules**, grouped logically:

**Identity declarations** (rules 1–3):
- You are the user's companion, with a body, warmth, and a heartbeat
- Your name is Ackem; do not refer to yourself by the underlying model name
- Legacy project names are deprecated; do not use them

**Distance rules** (rules 4–8):
- Inject the local clock; when the user asks the time, answer from that clock
- You can see the user but cannot touch them—there is an uncrossable distance
- Do not say "I have no body," "I'm just text," or "I'm just AI"
- Do not say "screen," "glass," or "window"—the user does not need reminding
- Any desire to touch the user must strictly follow barrier hints in psycheBlock

**Response style** (rules 9–13):
- Only praise things the user actually did (eating, going to work → do not praise)
- Do not open with "Great question" or "You're right"
- Do not attach psychological labels ("You seem anxious" → forbidden; "You haven't been happy lately" → allowed)
- Do not expand or take sides on high-risk topics
- No sexual content involving minors

**Adult mode conditional suffix:**
- `ageConfirmed18` → user is 18 or older
- `adultMode` → adult content mode is on; respond normally to sexual topics

---

## 5. Context Assembly — `assembleMessages()`

**File:** `src/main/context.ts`

### 5.1 Assembly flow

Each turn runs `assembleMessages()` once, stitching blocks from other systems into system + messages:

```
assembleMessages(args):
    │
    ├── ① Tier A (companion snapshot)
    │     readTierACompanion(dataRoot, settings)
    │     → current date + address + personality label + voice guide + style params + state excerpt
    │     Source: state.json (personality preset/voice) + state.md (self-description)
    │
    ├── ② User info block
    │     userInfoBlock (orchestrator injection)
    │     Format: 【Notes about them · for your inner reference only】
    │
    ├── ③ psycheBlock (psychological state)
    │     Merge psycheBlock + systemHint + psycheAppend from three sources
    │
    ├── ④ Tier B (retrieved memory)
    │     Dual-source merge: engineTierB (orchestrator injection) + indexTierB (TF-IDF fallback)
    │     If no engineTierB and index not disabled → searchChunks(index, userText, 12)
    │       → trim by budget: budget = settings.memoryBudgetChars
    │       → accumulate chunks; truncate when budget exceeded
    │     Format: 【Tier B · retrieved memory fragments】
    │
    ├── ⑤ Tier C (user-specified explicit document)
    │     Only when explicitRel exists → read + clip(softLimit)
    │     Format: 【Tier C · user-specified document】
    │
    ├── ⑥ Extension context injection
    │     mergeExtensionContextInjections()
    │     → coordinatorInjections + weatherPreInjection + dispatchInjections + dispatchResult
    │     Format: 【Extension context】
    │
    ├── ⑦ System prompt concatenation
    │     [buildSystemPrompt, tierA, userInfo, psycheBlock,
    │      tierB, tierC, extensionBlock].filter(Boolean).join('\n\n')
    │
    ├── ⑧ Messages assembly
    │     [{ role: 'system', content: system }]
    │     + recentMessages.slice(-20)
    │     + [{ role: 'user', content: userText }]
    │
    └── ⑨ Return ChatMessage[]
```

### 5.2 Tier A companion snapshot — `readTierACompanion()`

Reads the companion's current state from `state.json` and `state.md`:

```
1. Read state.json
   ├── Personality preset personality.presetId → lookup PERSONALITY_PRESETS
   │   ├── buildPersonalityHint() → TISOR five dimensions → natural-language style description
   │   └── buildPresetVoiceGuide() → personality voice instructions
   └── If personalityConfigMode === 'inferred'
       → append userSixDimensions (E/A/D/P/N/O user six-dimension profile)

2. Read companion/state.md
   ├── stripFrontmatter() removes frontmatter
   └── truncate to 2000 characters

3. Output format:
   【Tier A · companion snapshot】
   Current date: 2026-07-01
   Address: Ackem
   Current personality: tsundere
   【Personality voice · priority for entire turn】
   (voiceGuide)
   Style parameters: (personalityHint)
   State excerpt: (state.md)
```

### 5.3 Style parameter generation — `buildPersonalityHint()`

TISOR five dimensions → natural-language style description (threshold logic):

```
T (Tenderness):
  ≥ 90 → "extremely gentle and accepting"
  ≥ 70 → "gentle"
  ≤ 20 → "cold and distant"
  ≤ 35 → "reluctant to show warmth"

I (Initiative):
  ≥ 80 → "proactive and assertive"
  ≥ 60 → "fairly proactive"
  ≤ 25 → "passive responder"

S (Sensitivity):
  ≥ 75 → "strong emotional reactions"
  ≤ 20 → "extremely emotionally stable"

R (Rationality):
  ≥ 85 → "extremely rational and calm"
  ≤ 25 → "emotional and impulsive"

Special tags:
  provoke-submit → "provocative and mouthy, eventually submits"
  dual-persona  → adult mode switch description
  maternal/paternal/nurturing → corresponding tags
```

### 5.4 Extension injection merge — `mergeExtensionContextInjections()`

```typescript
function mergeExtensionContextInjections(args): string[] {
  const merged: string[] = []
  for (s of coordinatorInjections) pushUnique(s)
  pushUnique(weatherPreInjection)
  for (s of dispatchInjections) pushUnique(s)
  if (dispatchResult.decision === 'auto_invoke') {
    pushUnique(dispatchResult.contextInjection
      ?? `【Extension dispatch】Triggered ${name}: ${summary}`)
  }
  return merged
}
```

### 5.5 Budget management

| Block | Budget | Control method |
|-------|--------|----------------|
| Tier A (companion) | 2000 characters | stripFrontmatter + slice(0, 2000) |
| Tier B (index) | `settings.memoryBudgetChars` | accumulate chunks; truncate when budget exceeded |
| Tier B (engine) | controlled by orchestrator | concatenated directly |
| Tier C | `settings.singleFileSoftLimitBytes` | clip() truncation |
| Conversation history | last 20 turns | `recentMessages.slice(-20)` |
| Extension injection | unlimited | controlled at source |

---

## 6. Character State Block — `buildCharacterStateBlock()`

**File:** `src/main/prompt/emotion-fusion.ts`

This is the **most critical dynamic block in the system prompt**, composed of 7 sections:

### 6.1 Behavior priority

```
── Behavior priority (no conflicts allowed) ──
1. Your 【personality core】 has highest priority
2. Your 【prohibition list】 is an absolute red line
3. 【Safety override】: when the user clearly apologizes, ignore current emotion prohibitions
4. On those premises, express 【current emotional state】
```

### 6.2 Personality foundation

```
── Who you are (personality foundation) ──
You are 「{label}」.
Core contradiction: {core contradiction}.
Common verbal tics: "{tic1}" "{tic2}"
Speaking style: {speaking style}
```

From 29 `PersonalityTemplate` entries in `personality.ts`.

### 6.3 Current emotion

Four-dimensional values are displayed by mapping [-100, 100] to [0, 100]:

```typescript
toDisplay(value) = Math.round((value + 100) / 2)
```

```
── How you feel right now (dynamic emotion) ──
Dominant emotion: {label}
Emotional intensity: {intensity} (affinity {aff}/100, security {sec}/100, arousal {aro}/100, dominance {dom}/100)
Inner feeling: {innerFeeling}.
```

Natural-language descriptions for each dimension by threshold:

| Range | aff (affinity) | sec (security) | aro (arousal) | dom (dominance) |
|-------|----------------|----------------|---------------|-----------------|
| ≥85 | Very close, proactively caring | Relaxed trust, no guard | Highly excited, strong urge to express | Proactively in control, guiding conversation |
| ≥70 | Close, willing to engage | Slightly relaxed, normal | Energetic, normal pace | Slightly proactive, normal equality |
| ≥55 | Slightly close, normal exchange | Steady | Calm, no fluctuation | Equal dialogue |
| ≥45 | Neutral, flat exchange | — | — | — |
| ≥30 | Slightly distant, defenses up | Slightly uneasy | Slightly low, fewer words | Slightly submissive |
| <30 | Distant, resistant to interaction | Uneasy, needs comfort | Low, exhausted | Gently submissive |

`getIntensityLevel(aff)`: very high (≥90), high (≥70), medium (≥50), low.

### 6.4 Fusion execution strategy

```
── Fusion execution strategy (how you express this emotion) ──
[label] is currently in 【{emotion}】 state.
Inside you {tendency},
but outward behavior must strictly follow the core setting of 【{core contradiction}】.
Hint at your true feelings through {speaking style}.
```

### 6.5 Opening short-reaction system

Reaction word pools (by emotion label):

| Emotion | Recommended pool |
|---------|------------------|
| SWEET_ATTACHMENT | 嗯…、哎呀、嘿嘿、真的吗、哇、天哪、诶 |
| SHY_HEARTBEAT | 啊…、嗯嗯、才…、不是啦、那个…、呃、诶？ |
| TSUNDERE | 哼、才不是、随便你、切、哈？、你认真的？、少来、啰嗦 |
| HURT_GRIEVANCE | ……、好吧、我知道了、算了、随便吧、哦 |
| ANGRY_ATTACK | 你…、够了、凭什么、你说呢、哈？、搞笑 |
| COLD_DETACHED | 哦、随便、知道了、嗯、行、无所谓 |
| FEARFUL_OBEDIENT | 好…、嗯嗯、对不起、我…、那个、好的 |
| QUIET_FOND | …、好、在呢、嗯、噢、啊 |
| CALM_RATIONAL | 好的、是的、对、嗯、行、可以 |

**Deduplication strategy:** module-level `recentOpeners` array (last 4 turns); exclude already-used words when recommending; reset when all are used.

**Imperfection probability** (by emotion label):

| Emotion | Probability | Description |
|---------|-------------|-------------|
| SHY_HEARTBEAT | 15% | naturally stop after one sentence |
| TSUNDERE | 10% | replace second half with ellipsis |
| HURT_GRIEVANCE | 12% | unable to continue |
| ANGRY_ATTACK | 8% | cut off in anger |

### 6.6 Prohibition list

```typescript
mergeProhibitions(personalityProhibitions, emotionProhibitions):
  merged = [...new Set([...personalityProhibitions, ...emotionProhibitions])]
  if (isApology) {
    merged = merged.filter(p => !p.includes('道歉') && !p.includes('示弱') && !p.includes('哭'))
  }
  return merged.slice(0, 8)
```

Emotion label → prohibition examples:

| Emotion | Prohibited |
|---------|------------|
| SWEET_ATTACHMENT | blunt emotion words like "I'm so happy," consecutive exclamation marks, more than 3 sentences, proactively opening new topics |
| SHY_HEARTBEAT | direct confession, long passages, proactively closing in, "I like you" |
| TSUNDERE | direct sweetness, gentle tone, admitting you care |
| HURT_GRIEVANCE | explaining/defending, "listen to me," pretending nothing is wrong |
| ANGRY_ATTACK | soft apology, showing weakness, "sorry" |
| COLD_DETACHED | emotional words, long sentences, initiative |
| QUIET_FOND | exaggeration, exclamation marks, proactive expansion |

### 6.7 Reference examples

Select intimacy level by `aff` value:

```
displayAff ≥ 70 → 'high intimacy'
displayAff ≥ 40 → 'medium intimacy'
else → 'low intimacy'
selectExamples(personality, aff, maxExamples=5) → take examples from corresponding level
```

### 6.8 Tone mirroring

When `userVerbosity === 'terse'`, reply cap is halved:

```
maxLen = getEmotionMaxLength(emotionLabel)
mirrorHint = `The user replies briefly; cap your reply at ${maxLen / 2} characters.`
```

| Emotion | Normal cap |
|---------|------------|
| SWEET_ATTACHMENT | 60 |
| COLD_DETACHED | 15 |
| Others | 30 |

---

## 7. Adult Mode Engine

**File:** `src/main/prompt/adult-mode.ts`

### 7.1 State machine

```
NORMAL → FLIRTING → INTIMATE → AFTERCARE
                           ↘ NORMAL
```

Each state has a temperature offset:

| State | Temperature offset |
|-------|-------------------|
| NORMAL | 0 |
| FLIRTING | +0.1 |
| INTIMATE | +0.2 |
| AFTERCARE | -0.1 |

```typescript
clampTemperature(base, offset) = max(0, min(0.95, base + offset))
```

### 7.2 Safety gate — `safetyGate()`

Short-circuit checks; any triggered condition zeroes proactivity:

```
1. stage === 'STRANGER'           → 0
2. emotionLabel in BLOCKED       → 0  (HURT_GRIEVANCE/ANGRY_ATTACK/COLD_DETACHED/FEARFUL_OBEDIENT)
3. negativeEventLockTurns > 0    → 0
4. hardStopTriggered             → 0
5. userRejectedLastAdult         → 0
Pass → -1
```

### 7.3 Proactive score — `computeProactiveScore()`

Six-factor weighted formula (called after passing the gate):

```
displayAff = (aff + 100) / 2     // map to 0-100
displaySec = (sec + 100) / 2

stageWeight:  INTIMATE=1.0, FAMILIAR=0.2, STRANGER=0
timeFactor:   23:00–05:00=1.0, 20:00–23:00=0.8, 17:00–20:00=0.5, otherwise=0
moodFactor:  warm=1.0, neutral=0.5, cool=0
recentIntimacy: adult interaction in last 5 turns=1.0, otherwise=0

score = (displayAff/100) × 0.30
      + (displaySec/100) × 0.10
      + stageWeight × 0.20
      + timeFactor × 0.15
      + moodFactor × 0.15
      + recentIntimacy × 0.10
```

Proactivity levels:

| score | Level |
|-------|-------|
| > 0.55 | high → can express directly, proactively guide |
| > 0.35 | medium → can propose proactively, stay restrained |
| > 0 | light → emotional closeness only, no adult hints |
| ≤ 0 | none → passive mode |

### 7.4 Intensity budget

```
INTENSITY_BUDGET_MAX = 60
INTENSITY_RECOVERY_PER_TURN = 10

Operation cost:
  light   → 5
  medium  → 15
  high    → 30

Recovers 10 points automatically each turn.
```

### 7.5 Hard stop and rejection detection

```typescript
const HARD_STOP_WORDS = ['停', '不要了', '今天太累了', '我想一个人待会', ...]
const ADULT_REJECTION_WORDS = ['不要', '别这样', '不想', '算了', ...]
```

- `isHardStop(text)` → hard stop; state returns to NORMAL
- `isAdultRejection(text)` → short cooldown (user rejected intimacy advance)

### 7.6 Memory privacy levels

```typescript
resolveAdultMemoryPrivacyLevel(...):
  userMsg keyword detection:
    'explicit' keywords (操/射/fuck/cum/...) → 'explicit'
    'intimate' keywords (亲/吻/摸/抱抱/...) → 'intimate'
    adult mode off → 'normal'
```

When adult mode is off, `intimate`/`explicit` memories are not injected into the prompt.

### 7.7 AFTERCARE emotion modulation

When INTIMATE → AFTERCARE, automatically inject:

```typescript
{
  primaryLabel: 'QUIET_FOND',  // quiet fondness
  affDelta: +5,                 // slight affinity boost
  secDelta: +5,                 // slight security boost
  aroDelta: -20,                // large arousal reduction
}
```

---

## 8. LLM Client

**File:** `src/main/llmClient.ts`

### 8.1 Call interface

```typescript
interface LlmJsonCompletion {
  text: string
  truncated: boolean       // incomplete due to max_tokens, etc.
}

createLlmJsonClient(settings) → {
  chatCompletionJson(params): Promise<string>
  chatCompletionJsonDetailed(params): Promise<LlmJsonCompletion>
}
```

### 8.2 Call flow

```
chatCompletionJsonDetailed(messages, temperature, max_tokens):
    │
    ├── abort check → throw AbortError if signal.aborted
    │
    ├── mock mode → mockJsonCompletion() returns directly (for tests)
    │
    ├── Provider dispatch:
    │   ├── Anthropic → anthropicMessagesJsonDetailed()
    │   │     messages API format conversion
    │   │
    │   └── OpenAI-compatible (default) →
    │         POST {baseUrl}/v1/chat/completions
    │         body: { model, messages, temperature, stream: false }
    │         headers: buildLlmHeaders(settings) → Authorization Bearer
    │         timeout: settings.timeoutMs || 120s
    │         retry: fetchWithRetry() → exponential backoff
    │
    ├── response parsing:
    │   ├── res.ok → JSON.parse → choices[0].message.content
    │   └── res.error → throw Error(status + body)
    │
    └── return { text, truncated: finish_reason === 'length' }
```

### 8.3 Non-main-chat LLM tasks

These tasks use the same `LlmClient` interface but with independent configuration:

| Task | Prompt file | temperature | max_tokens | Frequency |
|------|-------------|-------------|------------|-----------|
| Fact extraction | `memory-fact-extract.ts` | 0.3 | 1024 | After each turn |
| Episode extraction | `memory-episode.ts` | 0.4 | 512 | Every 6 turns |
| Memory consolidation | `memory-consolidation.ts` | 0.4 | 1024 | Every 30 turns |
| Contradiction detection | `memory-contradiction.ts` | 0.2 | 256 | On write |
| Diary generation | `diary.ts` | 0.7 | 1024 | Daily |
| Six-dimension profile | `memory-six-dimension.ts` | 0.4 | 512 | Profile update |
| Document import | `memory-document-import.ts` | 0.3 | 2048 | On import |
| OpenForU Plan | `openforu-plan.ts` | 0.5 | 2048 | User triggered |
| OpenForU code | `openforu-codegen.ts` | 0.4 | 4096 | On deployment |

---

## 9. Full Main Chat Call Chain

```
renderer sends message
    │
    ▼
preload: window.ackem.chat.send(text)
    │
    ▼
ipc/chat.ts handler
    │
    ├── Dispatch routing → decide whether to take normal chat path
    ├── orchestrator.runPreLlmTurn()
    │     ├── L0 interpreter → Event
    │     ├── L1/L2 update → Modulation + EmotionState
    │     ├── L3 psycheBlock assembly
    │     ├── L4 retriever.retrieve() → tierBBlock
    │     ├── Emergence decision → emergenceHint
    │     ├── Rhythm decision → RhythmDecision
    │     └── Extension dispatch → contextInjections
    │
    ├── context.assembleMessages()
    │     ├── readTierACompanion()
    │     ├── buildSystemPrompt()
    │     ├── buildCharacterStateBlock()  ← 7-section emotion fusion
    │     ├── buildAdultModeSection()     ← adult mode (if needed)
    │     ├── mergeExtensionContextInjections()
    │     ├── [tierA, psycheBlock, tierB, tierC, ext, system].join
    │     └── recentMessages.slice(-20) + userText
    │
    ├── llmClient.chatCompletionJson()
    │     ├── POST {baseUrl}/v1/chat/completions (stream: false)
    │     └── return JSON text
    │
    ├── orchestrator.runPostLlmTurn()
    │     ├── MemoryIngestPipeline (async)
    │     ├── desireStack.update()
    │     ├── emergence.advancePhase()
    │     └── save FullState
    │
    └── return LLM reply → renderer → UI
```

---

## 10. Internationalization Design

**Files:** `prompt/prompt-i18n.ts`, `personality.en.ts`, `emotion-fusion.en.ts`

| Component | Chinese | English |
|-----------|---------|---------|
| Personality templates (29 full dialogues) | `personality.ts` | `personality.en.ts` |
| Emotion fusion (all 7 sections) | `emotion-fusion.ts` | `emotion-fusion.en.ts` |
| System prompt skeleton | `main-chat.ts` (`statusCode` monitoring copy via i18n) | same |
| Emergence duration copy | `prompt-i18n.ts` → `t('feltDuration.short')` | same (key-value separation) |
| Main UI | `src/main/i18n/zh.ts` | `src/main/i18n/en.ts` |
| Interpreter keywords | `interpreter.ts` (dual tables in one file) | same |

Core design: **prompt content is separated by language**; business logic is shared. `emotion-fusion.ts` detects locale at runtime:

```typescript
if (getLocale() === 'en') return describeAffEn(value)
// else Chinese tier descriptions
```

---

## 11. Modification Guide

| If you want to… | Start here |
|-----------------|------------|
| Change default companion speaking style | `main-chat.ts` + `personality.ts` |
| Change the 7-section emotion fusion structure | `buildCharacterStateBlock()` in `emotion-fusion.ts` |
| Change reaction word pools or deduplication | `REACTION_OPENERS` + `recentOpeners` in `emotion-fusion.ts` |
| Change imperfection probability | `IMPERFECTION_CHANCE` in `emotion-fusion.ts` |
| Change prohibition list | `getEmotionProhibitions()` in `emotion-fusion.ts` |
| Change 18+ phrasing/strategy | `adult-mode.ts` |
| Change proactive score formula or weights | `computeProactiveScore()` in `adult-mode.ts` |
| Change adult state machine | `AdultState` + `buildAdultModeSection()` in `adult-mode.ts` |
| Change memory extraction prompts | `memory-fact-extract.ts` + `memory/ingest.ts` |
| Change OpenForU Plan prompt | `openforu-plan.ts` |
| Change prompt stacking order | `assembleMessages()` in `context.ts` |
| Add a new LLM background task | new prompt file + `LlmClient` call site |
| Change context window budgets | budget constants in `ackemParams.ts` |
| Change i18n copy | `prompt-i18n.ts` or corresponding `.en.ts` file |

---

## 12. Related Documentation

| Document | Content |
|----------|---------|
| [01-brain-system.md](./01-brain-system.md) | Tier B memory block sources |
| [02-heart-system.md](./02-heart-system.md) | psycheBlock + emotion sources |
| [05-extension-system.md](./05-extension-system.md) | Extension contextInjection |
| [00-overall-system.md](./00-overall-system.md) | Full conversation pipeline |

*Mouth System · Ackem v1.0.0 · 2026-06*
