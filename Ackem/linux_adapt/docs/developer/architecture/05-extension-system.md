# Extension System

> **Language:** English · [中文](./05-extension-system.zh.md)

> **Codename:** Hands & Feet / Extensions  
> **Core question:** How does Ackem **actually execute** capabilities (search, reminders, smart home control, schedule management) **without breaking** the engine core?  
> **Design principle:** Protocol boundary isolation — EngineSnapshot is read-only, ExtensionEvent is the return channel  
> **Vision:** Evolve from chat companion to **home-life intelligent agent** — control devices, manage schedules, proactive care

---

## 1. Positioning

The extension system is the bridge between the core engine and the **external world**. The engine handles "feeling and thinking" (brain + heart); the extension system handles "acting and sensing" (hands and feet).

```
┌──────────────────────────────────────────────────────────────────┐
│                       Engine (Brain + Heart)                      │
│  Feel: L0 interpreter · L1-L3 emotion/relationship · L4 memory   │
│  Think: LLM reply generation                                     │
└────────────────────────┬─────────────────────────────────────────┘
                         │ EngineSnapshot (read-only)
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                     ExtensionsCoordinator                        │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Dispatch │ │  Skills  │ │  Plugins │ │    OpenForU        │  │
│  │ Pipeline │ │  Skills  │ │  Plugins │ │  User-built ext.   │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬────────────┘  │
│       │            │            │              │                │
│  ┌────┴────────────┴────────────┴──────────────┴────────────┐  │
│  │                   Policy Layer                            │  │
│  │  ProactiveGate · IntensityModulator · AttentionBudget     │  │
│  │  ToolDecider · UserProfile · DecisionLog                 │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                              │ ExtensionEvent                  │
└──────────────────────────────┼─────────────────────────────────┘
                               │
                               ▼
                        orchestrator / Mouth System
```

### 1.1 Data Flow with Other Systems

```
Each conversation turn:
  User message
    │
    ├──→ Brain system (L0+L4) → Event + tierBBlock
    ├──→ Heart system (L1-L3) → Emotion + Relationship
    │
    └──→ Extension system
           ├── Dispatch decision: plan / auto_invoke / ask_invoke / chat
           ├── Skill execution: search/weather/reminders
           ├── Plugin hooks: beforeUserMessage / afterAssistantMessage
           └──→ ExtensionEvent returned → consumed by orchestrator
                   ├── contextInjection → Mouth system
                   ├── emotionHint → Heart system (emotion modulation)
                   └── action_result → UI notification

Every 60s background:
  Scheduler tick
    ├── Habit maintenance (promote/cleanup/decay)
    ├── ProactiveGate decision
    ├── Autonomous extension execution (diary/health reminders)
    └── Special day detection
```

---

## 2. Core Architecture

### 2.1 Four-Layer Architecture

```
Application layer (IPC + React UI)
  ┌─────────────────────────────────────────────┐
  │  ipc.ts · ChatPage · Surface · Extension Hub│
  └─────────────────┬───────────────────────────┘
                     │
Coordination layer (ExtensionsCoordinator)
  ┌─────────────────────────────────────────────┐
  │  Singleton coordinator · event queue ·      │
  │  snapshot management                          │
  └─────────────────┬───────────────────────────┘
                     │
Capability layer (Skills + Plugins + OpenForU + GameMode)
  ┌─────────────────────────────────────────────┐
  │  Skill one-shot execution / Plugin hooks    │
  │  OpenForU NL→extension / GameMode companion │
  └─────────────────┬───────────────────────────┘
                     │
Policy layer (Policy)
  ┌─────────────────────────────────────────────┐
  │  Proactive gate · intensity mod · attention │
  │  budget · user profile                      │
  └─────────────────────────────────────────────┘
```

### 2.2 Coordinator

**File**: `src/main/extensions/coordinator.ts` (299 lines)

Singleton coordinator — the entry point for all extension operations:

```typescript
class ExtensionsCoordinator {
  readonly plugins: PluginRegistry
  readonly skills: SkillRegistry
  readonly openforu: OpenForULoader
  readonly gameMode: GameModeCoordinator

  // Boot sequence
  async boot(snapshot):
    ① plugins.loadRegistry()
    ② skills.loadRegistry()
    ③ registerBuiltinKnowledgePresentation(plugins)
    ④ registerBuiltinDesktopCompanion(plugins)
    ⑤ registerBuiltinPlugins(plugins)        // 13 placeholders
    ⑥ registerBuiltinSkills(skills)          // ~15-20
    ⑦ registerPluginCatalogPlaceholders()
    ⑧ registerSkillCatalogPlaceholders()
    ⑨ ensureCoreExtensionsActive()           // ensure core extensions enabled
    ⑩ openforu.boot()                        // load user-built extensions
    ⑪ community.boot() (only when community extensions open)

  // Update snapshot after each Pre-LLM turn
  updateSnapshot(snapshot):
    → update snapshots for gameMode / plugins / skills

  // Event queue — aggregates all ExtensionEvents from extensions
  drainAllEvents(): ExtensionEvent[]
  getContextInjections(): string[]
  getAggregatedEmotionHints(): { affDelta, secDelta, aroDelta, domDelta }

  // Tool invocation — LLM function calling
  getAvailableTools(): FunctionDef[]
  executeSkill(invocation): SkillResult
}
```

### 2.3 Protocol Boundary (Most Important)

**File**: `src/main/extensions/protocols.ts` (305 lines)

The extension system's core design: **extensions must not directly import engine internal modules** — communication goes only through protocol interfaces.

```
Allowed:                          Forbidden:
  · Register via Coordinator       · import engine/ internals
  · Read EngineSnapshot (read-only) · import memory/ internals
  · Return ExtensionEvent           · Direct database operations
  · Call methods exposed by EngineApi · Direct read/write of data/ engine dirs
```

**EngineSnapshot** — the full engine view visible to extensions:

```typescript
interface EngineSnapshot {
  personality: { presetId, T, I, S, O, R, tags, hiddenRatio? }
  emotion:     { aff, sec, aro, dom, primaryLabel, isLocked }
  relationship:{ stage, trust, rifts, atmosphere, sharedEventsCount }
  memory:      { activeFactCount, recentFactSummaries, kgNodeCount, episodeCount }
  totalTurns: number
  adultMode: boolean
  capturedAt: string
  lastActiveAt: string
  sessionId: string
}
```

**ExtensionEvent** — the sole feedback channel for extensions:

```typescript
interface ExtensionEvent {
  id: string
  category: 'gamemode' | 'plugin' | 'skill'
  sourceId: string
  type: string
  payload: Record<string, unknown>
  emotionHint?: { affDelta, secDelta, aroDelta, domDelta }  // emotion modulation suggestion
  injectToContext?: boolean     // whether to inject into LLM context
  contextInjection?: string     // injection text
  timestamp: string
}
```

**ExtensionLifecycleHooks** — Plugin lifecycle:

```typescript
interface ExtensionLifecycleHooks {
  onLoad?: (snapshot) => ExtensionOpResult
  onUnload?: () => ExtensionOpResult
  onEngineUpdate?: (snapshot) => ExtensionOpResult     // after each turn
  beforeUserMessage?: (msg, snapshot) => { contextInjections }
  afterAssistantMessage?: (reply, snapshot) => ExtensionOpResult
}
```

---

## 3. Dispatch Scheduling System

**Directory**: `src/main/extensions/dispatch/` (14 files)

### 3.1 Six Dispatch Modes

| Mode | Trigger | Typical use | Example |
|------|---------|-------------|---------|
| `dispatched` | LLM fine judgment (keyword+semantic+embedding→LLM) | Most Skills | "Check the weather for me" |
| `autonomous` | Timer + ProactiveGate gating | Proactive reminders | Sedentary reminder, drink water |
| `always_on` | Always active | Core features | Desktop companion, knowledge display |
| `manual` | User explicitly triggers via UI | Config operations | /diary, /remind |
| `engine_event` | Engine event driven | Game events | In-game achievements |
| `scheduled` | Cron expression | Scheduled tasks | Daily 8 AM greeting |

### 3.2 Dispatch Decision Tree (7 Priorities)

`routeDispatch()` evaluates in strict priority order:

```
User message
    │
    ├── ① Explicit extension demand (P1)
    │     "Help me make a Pomodoro timer" → detectExtensionDemandExplicit
    │     → decision: 'plan' (create OpenForU workspace)
    │
    ├── ② Capability probe (P2)
    │     "Wish it could auto-write a diary" → shouldRunCapabilityProbe
    │     → LLM classify: extension_demand? → 'ask_plan' | 'chat'
    │
    ├── ③ Slash command (P3)
    │     "/pomodoro" → matchSlashInvoke
    │     → 'auto_invoke' (skip LLM, trigger directly)
    │
    ├── ④ Evolve command (P4)
    │     "Improve the Pomodoro timer" → matchEvolveExtension
    │     → 'evolve' (open Refine mode)
    │
    ├── ⑤ Surface open (P5)
    │     "Open the Pomodoro UI" → matchExplicitOpenSurface
    │     → 'open_surface' (open UI window)
    │
    ├── ⑥ Explicit invoke (P6)
    │     "Start the Pomodoro timer" → matchExplicitInvoke
    │     → 'auto_invoke' (trigger directly)
    │
    └── ⑦ LLM fine judgment (P7) ← most complex path
          │
          ├── keywordHits: keyword exact match → candidate list
          ├── semanticHits: token overlap + bigram scoring → candidate list
          ├── embeddingCandidates: semantic routing match → candidate list
          │   (cosine similarity ≥ 0.70 high confidence → direct auto_invoke)
          │
          └── merge → LLM rerank (pick 3, score 0-1)
                ├── ≥ 0.85 (×personality tuning) → 'auto_invoke'
                ├── ≥ 0.60 (×personality tuning) → 'ask_invoke' (ask user)
                └── < 0.60 → 'silent'
```

### 3.3 LLM Fine-Judgment Threshold Tuning

Thresholds are dynamically adjusted by four factors:

```typescript
AUTO_THRESHOLD = 0.85    // auto trigger
ASK_THRESHOLD = 0.60     // ask user

// Personality tuning
PERSONALITY_MOD = {
  deredere: 1.15,  // clingy type → easier to trigger
  tsundere: 0.90,  // tsundere → harder to trigger
  kuudere: 1.25,   // kuudere → easier to trigger (few words → precise)
  genki: 0.85,     // genki → harder to trigger (talkative → suppress)
}

// User preference modulation
confidence += getDispatchedConfidenceDelta(dataRoot, id, rejectedInSession)
  // user previously allowed → +0.12
  // user previously rejected → -0.20
  // rejected this session → -0.15

// Force trigger (user profile set to permanent allow)
if shouldForceAutoInvoke(dataRoot, id) → direct auto_invoke
```

### 3.4 Intent Resolution

**File**: `dispatch/intentResolver.ts`

Before dispatch processing, performs **context-aware intent resolution** on user messages:

```
resolveIntent(msg, sessionId, llm):
  ├── isAmbiguous(msg): pure rule detection <0.1ms
  │     indicators: "呢/这个/那个/它/她/他"
  │     short phrases: "继续/然后/接着"
  │     bare questions: "怎么了？/啥呢？"
  │
  ├── ambiguous + topic stack exists → LLM resolution
  │     prompt: "Recent topic: {topic}\nUser message: {msg}\nResolved:"
  │     10 minute TTL
  │
  └── not ambiguous → return as-is
```

Topic stack is pushed when prior dispatch rounds trigger, assisting resolution of anaphora like "continue" and "what about that one".

### 3.5 Dispatch Pipeline

**File**: `dispatch/contextPipeline.ts`

The full dispatch pipeline wraps all steps:

```
runDispatchPipeline(input):
  ┌── ① filterDispatchedCatalogByProfile filter user-rejected extensions
  ├── ② matchSlashInvokeDisabled check slash disabled state
  ├── ③ buildDispatchMemoryBlock build dispatch memory block
  ├── ④ resolveIntent intent resolution
  ├── ⑤ Embedding routing (queryEmbed + routeIndex)
  ├── ⑥ routeDispatch main decision tree
  ├── ⑦ topic push topic tracking
  ├── ⑧ handle result
  │     auto_invoke → executeDispatchedExtension
  │     invoke_surface → executeSurfaceInvoke
  │     ask_invoke + skipAsk → convert to chat
  └── ⑨ return extraInjections + emotionHintDelta
```

---

## 4. Skill System

**Directory**: `src/main/extensions/skills/`

### 4.1 Positioning

A Skill is a **one-shot execution** capability — trigger → execute → return result, no persistent state.

### 4.2 Skill Types

| Type | Description | Example |
|------|-------------|---------|
| `rule` | Keyword trigger + fixed reply | Drink water reminder |
| `tool` | LLM function calling tool | web-search, weather |
| `proactive` | Timer-activated proactive skill | Diary archive |
| `workflow` | Multi-step workflow | Plan deployment |

### 4.3 Trigger Methods

| Trigger | Description |
|---------|-------------|
| `manual` | User manually triggers via UI |
| `keyword` | Keyword match then auto_invoke |
| `llm_function_call` | LLM invokes via tool calling |
| `scheduled` | Timer interval trigger |
| `engine_event` | Engine event |
| `game_event` | Game event |
| `system_event` | System event |

### 4.4 Skill Execution Flow

```
execute({ skillId, trigger, userMessage, snapshot }):
  ├── ① Look up handler (SkillRegistry)
  ├── ② Read EngineSnapshot (read-only)
  ├── ③ Execute business logic (search API/weather API/local compute)
  ├── ④ Return SkillResult
  │     ├── output → direct reply text
  │     ├── events[] → ExtensionEvent array
  │     └── injectToContext → whether to inject into LLM
  └── ⑤ orchestrator consumes result
```

### 4.5 Built-in Skills

| ID | Type | Function | Status |
|----|------|----------|--------|
| ackem/web-search | tool | Web search (LLM function calling) | In progress |
| ackem/weather-sense | rule+proactive | Weather awareness and reminders | In progress |
| ackem/diary-auto | proactive | Auto diary generation | In progress |
| ackem/sedentary-reminder | proactive | Sedentary reminder | stub |
| ackem/drink-water-reminder | proactive | Drink water reminder | stub |
| ackem/late-night-reminder | proactive | Late-night reminder | stub |
| ackem/light-schedule | tool | Lightweight schedule management | stub |
| ackem/plan-document | tool | Plan document generation | stub |
| ackem/emergency-companion | rule | Emergency companion | stub |
| ackem/markdown-table | tool | Markdown table | stub |
| ackem/fun-profile | tool | Fun analysis | stub |

---

## 5. Plugin System

**Directory**: `src/main/extensions/plugins/`

### 5.1 Positioning

A Plugin is a **persistent** capability — has lifecycle hooks, may have a UI (Surface), may hold state.

### 5.2 Plugin Types

| Type | Description | Example |
|------|-------------|---------|
| `skin` | Companion appearance skin | Live2D skin |
| `personality` | Personality extension | Extra personality presets |
| `behavior` | Behavior logic | Knowledge display board |
| `tool` | Tool capability | TTS voice |
| `game_provider` | Game provider | Gomoku engine |
| `skill_pack` | Skill pack | Combines multiple skills |
| `theme` | Theme | UI theme |

### 5.3 Permission Model (8 Levels)

| Level | Permission | Description | Risk |
|-------|------------|-------------|------|
| L0 | `readonly` | Read own files | Safe |
| L1 | `data_write` | Write own data directory | Low |
| L2 | `engine_read` | Read EngineSnapshot | Low |
| L3 | `engine_inject` | Inject LLM context | Medium |
| L4 | `network_outbound` | HTTPS outbound (localhost forbidden) | Medium |
| L5 | `system_notification` | OS system notification | Low |
| L6 | `clipboard_read` | Read clipboard — **requires user approval** | High |
| L6 | `foreground_detect` | Detect foreground app — **requires user approval** | High |

### 5.4 Surface System

Plugins can own a Surface (UI window opened in the renderer process):

```typescript
interface SurfaceConfig {
  route: string      // React route (e.g. '/plugin/knowledge-presentation')
  size?: { width, height }
  title?: string
}
```

Surface supports two rendering modes:
- **`html`**: Custom HTML/Widget (OpenForU default)
- **`react-builtin`**: Built-in React page (official Plugin)

### 5.5 Built-in Plugins

| ID | Function | Surface | Type | Status |
|----|----------|---------|------|--------|
| ackem/knowledge-presentation | Knowledge card display | ✅ | behavior | Complete |
| ackem/desktop-companion | Desktop status info | ❌ | behavior | Complete |
| ackem/tts-voice | Speech synthesis | ❌ | tool | stub |
| ackem/companion-skin | Companion skin | ❌ | skin | placeholder |
| ackem/live2d | Live2D desktop pet | ❌ | skin | placeholder |

---

## 6. OpenForU — User-Built Extensions

**Directory**: `src/main/extensions/openforu/` (13 files)

### 6.1 Positioning

OpenForU lets users **create their own extensions in chat using natural language** (Skill or Plugin), without writing code or understanding Ackem's internal architecture. This is Ackem's key capability for evolving **from companion to home intelligent agent**.

### 6.2 Full Flow

```
User says in chat:
  "Help me make a plugin that reminds me to drink water every day"
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  ① Capability probe (dispatchRouter.ts)                     │
│     detectExtensionDemandExplicit → decision: 'plan'        │
│     or shouldRunCapabilityProbe → LLM classify → 'ask_plan' │
│     createToolAnchor cosine match ("wish it could auto" etc)│
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  ② Plan workspace creation (OpenForUCoordinator)            │
│     createWorkspace(name?) → write to data/openforu/sessions/│
│     → user enters Plan conversation UI                      │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  ③ Plan Agent multi-turn conversation                        │
│     runPlanAgentTurn() — LLM guides user to clarify:         │
│       · uskill (config+inject) or uplugin (sandbox+Surface) │
│       · trigger method (keyword/timer/proactive)             │
│       · behavior description                                 │
│       · required permissions                                 │
│       · Design Spec (uplugin UI design)                      │
│     Auto-sync: dispatchDraft + planSummary + designSpec      │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  ④ Confirm plan (confirmPlan)                               │
│     Check: planSummary ready OR dispatchDraft 4 dims complete│
│     Check: artifactType clarified (uskill/uplugin)            │
│     Check: designSpec ready (uplugin needs wireframeApproved) │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  ⑤ Generate artifacts                                       │
│     uskill:  generateUskillFromSession()                     │
│       → manifest.json + skill.json (declarative config)     │
│     uplugin: generateUpluginFromSession()                   │
│       → manifest.json + plugin.meta.json + surface.html     │
│       → injectTemplate (beforeUserMessage fallback)         │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  ⑥ Deploy (deployPlan)                                       │
│     ↓ write to data/openforu/uskills/{slug}/                │
│     ↓ or data/openforu/uplugins/{slug}/                     │
│     ↓ loader.boot() reload                                  │
│     ↓ register to SkillRegistry / PluginRegistry            │
│     ↓ add to Dispatch Catalog                               │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 uskill vs uplugin

| Dimension | uskill | uplugin |
|-----------|--------|---------|
| Essence | Declarative config + contextInjection | Executable code + Surface |
| Trigger | onKeyword.reply / onProactive | beforeUserMessage hook |
| Permissions | engine_read, engine_inject, system_notification | Full 8-level permissions |
| Sandbox | None (no code execution) | Worker Thread isolation |
| UI | ❌ | ✅ Surface Widget (HTML) |
| Failure fallback | — | injectTemplate (when no Worker) |
| Code volume | ~20 lines JSON | ~50 lines JSON + HTML |
| Complex scenarios | ❌ Simple message injection | ✅ API calls + state + UI |

### 6.4 Sandbox (uplugin)

**File**: `openforu/sandbox/`

```
uplugin execution:
  ① User deploys → write to data/openforu/uplugins/{slug}/
  ② Trigger invoke → UpluginSandboxHost creates Worker Thread
  ③ Execute uplugin code inside Worker
  ④ Access restricted API via sandboxApiBridge:
       getEngineSnapshot()     — engine read
       readOwnFile(path)       — whitelist paths (path traversal protection)
       writeOwnFile(path,data) — requires data_write permission
       fetch(url)              — HTTPS only, 256KB max, 15s timeout
       notify(title,body)      — requires system_notification
       emitEvent(event)        — requires engine_read
  ⑤ Return invokeResult → inject context / UI notification

  Failure fallback:
    Worker init failure → injectTemplate (no code execution)
    inject also fails → silent degrade, don't block chat
```

### 6.5 Capability Probe

**File**: `openforu/extensionIntentClassifier.ts`

Pure-rule explicit demand detection + LLM-assisted implicit demand detection:

```typescript
// Explicit: "Help me make a..."
detectExtensionDemandExplicit(msg):
  pattern: /帮我[做创建写]一个|帮我做个工具|能做一个.*吗/

// Implicit: "Wish it could auto..."
shouldRunCapabilityProbe(msg, queryEmbed?, createToolAnchor?):
  if queryEmbed && createToolAnchor:
    cosine(queryEmbed, createToolAnchor) ≥ 0.45 → trigger LLM classification
  else:
    rule keywords: /要是能|能自动|有个工具就好了/

// LLM classification
classifyExtensionIntent(msg, context, llm):
  output: {
    category: 'extension_demand' | 'ephemeral_task' | 'emotional_vent' | 'chat',
    confidence: 0-1,
    suggested_name?: string,
    reasoning?: string
  }
  // gate: recurring + gap≥0.62 + implementable≥0.68 + composite≥0.72
```

### 6.6 Refine Mode

Deployed extensions can be iteratively improved:

```
openRefineInPlan(extensionId, opts?):
  ① Find linked Plan workspace
  ② Not found → create new workspace "Refine · extension name"
  ③ linkExtensionToPlan(sessionId, extensionId)
  ④ Set refineMode = true, planConfirmed = false
  ⑤ User describes changes → redeployPlan() regenerate
```

The "chat to build extension → not satisfied → chat to refine" loop is OpenForU's core experience.

---

## 7. GameMode Game Companion System

**Directory**: `src/main/extensions/gamemode/`

### 7.1 Positioning

GameMode lets Ackem accompany users during games — watch the board, react, remember moments, **without directly participating in game logic**.

### 7.2 Architecture

```
GameProvider interface:
  connect(config) / disconnect()
  getStatus()
  pushEvent(event)
  onEvent(callback)          ← game event listener
  updateSnapshot(snapshot)   ← engine snapshot sync
  drainEvents()

GameModeCoordinator (singleton):
  registerProvider(provider)
  activateGame(gameId, config)
  deactivateGame()
  invoke(gameId, method, params)  ← RPC call

Integration:
  GameEvent → handleGameEvent() → ExtensionEvent
    → contextInjection + emotionHint → orchestrator
```

### 7.3 Game Event → Companion Reaction

```typescript
handleGameEvent(event):
  valance: 'positive' | 'negative' | 'neutral'
  severity: 0-1

  ① Ask provider.buildReaction(event) first — custom reaction
  ② No custom → default reaction:
       positive → "Wow!/Yay~/Amazing!"
       negative → "Ah.../Watch out!/Are you okay?"
       neutral  → "Hmm?/I'm watching~/Keep going~"
  ③ severity > 0.5 → write to memory:
       "[{gameId}] {event.raw}" → inject into LLM context
  ④ Emotion impact:
       positive: aff+2, sec+1, aro+2
       negative: aff-1, sec-2, aro+2
```

---

## 8. Policy Layer

**Directory**: `src/main/extensions/policy/` (11 files)

### 8.1 ProactiveGate — "Should I Speak?"

**File**: `policy/proactiveGate.ts`

9 pure-rule decision tree (<1ms):

```
evaluateProactiveGate({ snapshot, runtime, matchedHabits, foregroundBusy, budgetExceeded })
    │
    ├── ① Long DND/meeting habit → silent (30min)
    ├── ② rifts ≥ 2 (just argued) → silent (15min)
    ├── ③ Foreground meeting/PPT/focus → silent (15min)
    ├── ④ Attention budget exceeded → whisper (10min)
    ├── ⑤ High emotion volatility + negative → whisper (10min)
    ├── ⑥ High emotion volatility + positive + INTIMATE → proactive (5min)
    ├── ⑦ Late night + user not active → whisper (20min)
    ├── ⑧ Weekend morning + relationship FAMILIAR+ → proactive (5min)
    ├── ⑨ Short DND/rest habit → whisper (10min)
    └── ⑩ Default → casual (1min)
```

proactiveLevel affects subsequent scheduling:
- **silent**: don't speak proactively, skip non-maintenance autonomous extensions
- **whisper**: only allow non-health extensions, defer health reminders
- **casual**: normal triggering
- **proactive**: can initiate proactively (cooldown shortened)

**Emotion volatility calculation**:

```typescript
computeAffVolatility():
  window = last 10 turns of aff values
  mean = average(window)
  variance = sum((v - mean)²) / N
  return sqrt(variance)
```

### 8.2 IntensityModulator — Tone Intensity

**File**: `policy/intensityModulator.ts`

```
computeIntensityModifier({ snapshot, runtime, matchedHabits }):
  mod = 1.0 (baseline)
  if aff > 60   → +0.2   // happy, lively tone
  if aff < 20   → -0.2   // low, steady tone
  if aro > 60   → +0.1   // excited, can talk more
  if dom < -30  → -0.1   // uneasy, more cautious
  if INTIMATE   → +0.1
  if STRANGER   → -0.1
  if late night/night → -0.15
  if weekend morning → +0.1
  if rest habit → -0.1
  return clamp(0.5, 1.5)
```

### 8.3 Other Policy Modules

| File | Responsibility |
|------|----------------|
| `attentionBudget.ts` | Hourly proactive message quota (default 3) |
| `toolDecider.ts` | Decide suppress/ask/auto_invoke from habits and user preferences |
| `userProfile.ts` | Per-extension user preferences (permanent allow/reject/hide) |
| `evaluate.ts` | Comprehensive policy evaluation (maintenance bypass→emergency bypass→global DND→...) |
| `decisionLogStore.ts` | Decision log persistence (for UI replay) |
| `decisionLogRouting.ts` | Decision feedback routing (adjust subsequent decisions) |

---

## 9. Autonomous Scheduler

**File**: `dispatch/scheduler.ts`

Every 60s background tick:

```
tickAutonomousDispatch(opts):
  │
  ├── ① Habit maintenance (hourly)
  │     ├── promoteShortTermHabits  short→long term
  │     ├── cleanupExpired          cleanup expired
  │     ├── scanForegroundHistory   foreground→candidate habits
  │     └── decayLongTermHabits     long-term decay (3 AM)
  │
  ├── ② Diary catch-up (tryCatchUpMissedDiary)
  │
  ├── ③ ProactiveGate decision
  │
  └── ④ Iterate autonomous extensions
        ├── Is it time (interval_ms / daily_at)
        ├── Within active time window
        ├── proactiveGate = silent → skip non-maintenance
        ├── proposeGate = whisper → defer health reminders
        ├── evaluateAutonomousExtensionPolicy
        ├── toolDecider judgment
        └── Execute → recordProactiveMessage
```

---

## 10. Community Ecosystem (Currently Closed)

**File**: `src/main/extensions/ecosystem/`

**Switch**: `src/shared/communityExtensionFeature.ts` → `COMMUNITY_EXTENSIONS_OPEN = false`

### 10.1 Package Format

`.ackem-ext` file = zip + signature sidecar:

```
package.ackem-ext
├── format_version: "1.0"
├── publisherId: "community_publisher"
├── manifest.json
├── files/                     # extension files (keyed by path)
├── files.sha256               # file digests
└── signature.sig              # Ed25519 signature
```

### 10.2 Trust Chain

```
verify():
  ① manifest.json → canonical JSON
  ② files.sha256 → verify SHA-256 of each file
  ③ signature.sig → verify with publisher public key
  ④ trust/publishers.json → check publisher is trusted
  ⑤ scope check → publisher has permission to publish this ID
```

### 10.3 Behavior When Closed

- `coordinator.boot()` does not call community.boot()
- `installCommunityPackage()` returns "Community extension marketplace not yet open"
- `data/extensions/community/` is not loaded
- Contributor path: local `u/` experiment → PR to `ackem/` → shipped with release

---

## 11. Vision: Home Intelligent Agent Companion

Ackem's extension system was designed from the start for the evolution path **from chat companion to home intelligent agent**.

### 11.1 Current Capabilities

```
Current (v1.0):
  ┌─────────────────────────────────────────┐
  │  Chat companion                          │
  │  · Emotion awareness + relationship care │
  │  · Memory + proactive care               │
  │  · Basic Skills: weather/search/reminders│
  │  · OpenForU: user-built uskill/uplugin   │
  │  · GameMode: game companion              │
  └─────────────────────────────────────────┘
```

### 11.2 Near-Term Goals

```
Near-term (v1.x):
  ┌─────────────────────────────────────────┐
  │  Personal assistant                      │
  │  · Schedule management (calendar sync +  │
  │    smart reminders)                      │
  │  · Email/message summaries               │
  │  · File management (organize/archive/    │
  │    search)                               │
  │  · Web search + Q&A                      │
  │  · TTS voice output + simple voice input │
  │  · Desktop automation (window mgmt/      │
  │    shortcuts)                            │
  └─────────────────────────────────────────┘
```

### 11.3 Mid-to-Long-Term Vision

```
Mid-term (v2.x):
  ┌─────────────────────────────────────────┐
  │  Home control center                     │
  │  · IoT device control (Mi Home/HomeKit   │
  │    bridge)                               │
  │     "Set living room lights to warm"     │
  │     "Set AC to 26°C"                     │
  │  · Environment sensing (temp/humidity/   │
  │    air quality)                          │
  │  · Security monitoring (camera event     │
  │    notifications)                        │
  │  · Energy management (usage stats/       │
  │    savings tips)                         │
  │  · Multi-room voice distribution         │
  │  · Scheduled scenes (wake/away/sleep     │
  │    automation)                           │
  └─────────────────────────────────────────┘

Long-term (v3.x):
  ┌─────────────────────────────────────────┐
  │  Agent ecosystem                         │
  │  · Community extension marketplace       │
  │    (designed, pending open)              │
  │  · Multi-agent collaboration (Ackem      │
  │    calls other AIs)                      │
  │  · Cross-device sync (phone/PC/smart     │
  │    speaker)                              │
  │  · Proactive habit learning (non-LLM,    │
  │    local)                                │
  │  · Family member recognition +           │
  │    personalization                       │
  │  · Health management (medication/        │
  │    exercise/data)                        │
  │  · Third-party integrations (food        │
  │    delivery/ride-hailing/shopping)       │
  └─────────────────────────────────────────┘
```

### 11.4 Architecture Support

Existing extension system design already prepares for these visions:

| Vision need | Existing architecture support |
|-------------|------------------------------|
| IoT device control | `network_outbound` permission + Worker sandbox + auto_invoke dispatch |
| Scheduled scenes | `autonomous` mode + `scheduled` subtype + habit system |
| Environment sensing | `foreground_detect` permission + proactive skills + contextInjection |
| Multi-room distribution | IPC protocol + ExtensionEvent standardization |
| Community ecosystem | `.ackem-ext` package format + Ed25519 signature + trust chain |
| Voice interaction | TTS Plugin (stub) + channel system (weixin/) |
| User habit learning | habitsStore + decisionLog + userProfile |
| Third-party integration | OpenForU sandbox + HTTPS outbound + permission approval |
| Proactive care | ProactiveGate + IntensityModulator + attentionBudget |

### 11.5 Extension Integration Roadmap

```
External capability integration steps:
  1. Implement SkillHandler (rule/tool/proactive)
  2. Define DispatchConfig (trigger method + active time windows)
  3. Declare required permissions (engine_read / network_outbound / ...)
  4. Register to SkillRegistry
  5. LLM function calling or dispatch auto trigger

Smart home device integration:
  1. Local Hub service (in-process or subprocess)
  2. OpenForU uplugin (sandbox Worker + HTTPS API)
  3. community signed package (review + sign + distribute)
  4. (Future) Device manufacturer official plugins

User customization:
  1. Describe need in chat → Plan Agent → generate and deploy (no code)
  2. Not satisfied → Refine mode to iterate
  3. Advanced users → directly edit JSON under data/openforu/
```

---

## 12. Modification Guide

| You want to… | Start here |
|--------------|------------|
| Add official Skill | `skills/registry.ts` + `skills/builtin/` |
| Add official Plugin | `plugins/registry.ts` + lifecycle hooks |
| Change dispatch decision tree | `engine/dispatchRouter.ts` routeDispatch |
| Change dispatch thresholds | `engine/dispatchRouter.ts` AUTO_THRESHOLD / ASK_THRESHOLD |
| Change intent resolution | `dispatch/intentResolver.ts` |
| Change embedding routing | `dispatch/candidateCollector.ts` collectEmbeddingCandidates |
| Change OpenForU Plan flow | `openforu/coordinator.ts` + `agentPipeline.ts` |
| Change permission system | `openforu/permissionGate.ts` + `protocols.ts` |
| Change sandbox implementation | `openforu/sandbox/` + `sandboxApiBridge.ts` |
| Change proactive message policy | `policy/proactiveGate.ts` |
| Change tone intensity modulation | `policy/intensityModulator.ts` |
| Change attention budget | `policy/attentionBudget.ts` |
| Change autonomous tick | `dispatch/scheduler.ts` |
| Change capability probe | `openforu/extensionIntentClassifier.ts` |
| Change community ecosystem (future) | `ecosystem/` |
| Change capability listing copy | `dispatch/extensionCapabilityListing.ts` |

---

## 13. Related Documentation

| Document | Link |
|----------|------|
| Extension developer interface protocol | [DEVELOPER-EXTENSION-PROTOCOL.md](../DEVELOPER-EXTENSION-PROTOCOL.md) |
| OpenForU internal protocol | [openforu/PROTOCOL.md](../../src/main/extensions/openforu/PROTOCOL.md) |
| Overall system | [00-overall-system.md](./00-overall-system.md) |
| Brain system | [01-brain-system.md](./01-brain-system.md) |
| Neural system | [04-neural-system.md](./04-neural-system.md) |

*Extension System · Ackem v1.0.0 · 2026-06*
