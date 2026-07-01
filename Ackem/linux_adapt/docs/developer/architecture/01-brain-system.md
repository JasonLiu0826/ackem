# Brain System

> **Language:** English · [中文](./01-brain-system.zh.md)

> **Layers:** L0 event interpretation · L0.5 intent routing · **L4 memory retrieval**  
> **Codename:** Brain Engine  
> **Core question:** What did the user say? Which memories should be recalled?  
> **Constraint:** L0 is a pure rule path with **zero LLM calls**, completed in milliseconds

---

## 1. Role

The Brain System **does not produce the final reply**. It converts user input into structured data (Event + memory blocks) for the **Heart System** (emotion/relationship modulation) and **Mouth System** (prompt injection) to consume.

```
User message
    │
    ▼
┌─────────────────────────────────────────────┐
│  L0  interpreter.ts      → Event type       │
│     Rule keywords → event classification    │
│     (zero LLM)                              │
│     Includes: zh/en bilingual keywords      │
│     Includes: embedding semantic fallback   │
│                                             │
│  L0.5 Intent routing (inline in orchestrator)│
│     DND detection · memory-op detection     │
│     verbosity detection                     │
│     work-intent detection (search/file/cmd) │
│                                             │
│  L4  retriever.ts        → tierBBlock       │
│     Multi-path recall: trigger/FTS/semantic/  │
│     vector/association/temporal             │
│     Dedup + rank + budget trim              │
└─────────────────────────────────────────────┘
    │
    ├──► Heart System (Event → relationship/emotion)
    ├──► Extension System (Dispatch / tool intent)
    └──► Mouth System (Tier B memory injection block)
```

---

## 2. L0 Interpreter — Design Principles

**File:** `src/main/engine/interpreter.ts`  
**Principle:** Pure rules, zero LLM, millisecond latency.

### Classification Algorithm

L0 uses a **keyword matching + priority override** event classification strategy:

```
Input: user text (string), effectiveTrust (0–100)
Output: Event { type: EventType, valence?: number, ... }

Algorithm:
1. Language detection → load corresponding keyword table (zh/en)
2. Priority 0 — REDLINE detection (safety red lines)
   if any(redline_keywords): → EventType.EXTREME_REDLINE
3. Priority 1 — DND detection
   if any(dnd_explicit): → EventType.DND_REQUEST
4. Priority 2 — Sexual harassment + ethical violation detection
   if any(sexual_harassment): → EventType.SEXUAL_HARASSMENT
   if any(ethical_violation): → EventType.ETHICAL_VIOLATION
5. Priority 3 — Routine emotion classification
   vulnerable → VULNERABLE_TO_PRAISE_OVERRIDE? → PRAISE
   hurtful → HURTFUL (low trust) | TEASE (high trust)
   praise → PRAISE
   apology → APOLOGY
   tease → TEASE
   cold → COLD
   question → QUESTION
   casual → CASUAL_CHAT
6. Priority 4 — Embedding semantic fallback
   if (embedding available && no high-confidence rule match):
     interpretInputWithEmbedding() → embedding classification
```

### Key Design: Why Zero LLM?

L0 is invoked on every turn of every conversation. Using an LLM for classification would:
- Add an unnecessary LLM call per turn (latency + cost)
- Overkill for a task that is too simple for an LLM
- Be less precise than keyword rules in Ackem’s context (what users say to a companion follows patterns)

The embedding fallback path is enabled only when the rule path yields low confidence.

### Event Types Overview

```
Common:
  casual_chat    Casual chat
  question       Question/inquiry
  praise         Praise/thanks
  hurtful        Hurtful speech
  vulnerable     Vulnerability/confiding
  apology        Apology
  tease          Teasing/flirting
  cold           Cold/dismissive

Relationship-sensitive:
  DND_REQUEST    Do-not-disturb mode
  MEMORY_INTENT  Explicit memory operation ("do you remember…")

Safety red lines:
  EXTREME_REDLINE  Self-harm/suicide etc. (triggers safety freeze)
  SEXUAL_HARASSMENT  Sexual harassment (refusal/cooldown)
  ETHICAL_VIOLATION  Ethical violation (hard refusal)
```


---

## 3. L0.5 Intent Routing (Inline in Orchestrator)

This layer has no standalone module; it is implemented as inline detection in Pre-LLM within `orchestrator.ts`:

| Detection | Function | Trigger |
|-----------|----------|---------|
| DND | `detectDndIntent()` | User explicitly asks for quiet |
| Memory operation | `detectMemoryIntent()` | "Do you remember…" etc. |
| Verbosity | `detectUserVerbosity()` | User message length threshold |
| Work intent | `detectKnowledgeWorkIntent()` | Search/file/code intent |
| Clock | `userAsksLocalClock()` | Time/date inquiry |

These checks run after L0 and before L1 updates, and can alter downstream flow (e.g. DND skips proactive messages).

---

## 4. L4 Memory System — MnemoStack Architecture

**Directory:** `src/main/memory/`  
**Core files:** ~20 modules, ~5000 lines

### 4.1 Overall Architecture

```
                   MemoryIngestPipeline
                   (write: async after conversation)
                         │
            ┌────────────┴────────────┐
            │                         │
       FactExtractor           EpisodeExtractor
       (LLM fact extraction)    (LLM episode extraction)
            │                         │
            └────────────┬────────────┘
                         │
              Consolidator (merge + dedup)
                         │
              ┌──────────┴──────────┐
              │                     │
         FactStore             EpisodicStore
         (facts.v2.json)       (episodes)
              │                     │
              ├── VectorStore (vector index)
              ├── KnowledgeGraph (association graph)
              └── AssociationIndex (co-occurrence)
                         ▲
                         │
                   MemoryRetriever
                   (read: Pre-LLM each turn)
```

### 4.2 FactStore — Fact Storage

**File:** `src/main/memory/factStore.ts`

MemoryFact structure:

```typescript
interface MemoryFact {
  id: string
  tier: 'core' | 'archival'        // core / archival
  domain: string                    // e.g. "user_personal", "relationship"
  subcategory: string               // e.g. "hobby", "family"
  subject: string                   // topic
  summary: string                   // fact content
  confidence: number                // 0–1
  weight: number                    // importance weight
  selfRelevance: number             // impact on Ackem itself
  triggers: string[]                // trigger words for fast retrieval
  privacyLevel: 'normal' | 'intimate' | 'explicit'
  emotionalContext?: { valence: number; aff: number }
  createdAt: string
  lastAccessAt: string
  accessCount: number
  metadata?: Record<string, unknown>
}
```

**Fact taxonomy** (`taxonomy.ts`) — 6 domains × 25 subcategories:

| Domain | Label | Subcategories |
|--------|-------|---------------|
| `IDENTITY` | Self & identity | `BASIC_PROFILE` basic info · `LIFE_STORY` life history · `VALUES_BELIEFS` values & beliefs · `SELF_PERCEPTION` self-perception |
| `SOCIAL` | Relationships & social | `OUR_BOND` our bond · `FAMILY` family · `FRIENDS` friends · `PARTNER` partner |
| `DAILY_LIFE` | Daily life | `ROUTINES` routines · `HEALTH` physical & mental health · `LIVING_SPACE` living environment · `LIFESTYLE` lifestyle |
| `PURSUITS` | Career & growth | `CAREER` career & work · `LEARNING` learning & skills · `GOALS` goals & dreams · `PROJECTS` projects & creations · `PROCEDURES` ways of doing things |
| `INNER_WORLD` | Inner world | `MOOD` mood state · `TASTES` tastes & preferences · `VULNERABILITIES` vulnerabilities & secrets · `INSIDE_JOKES` inside jokes & signals |
| `TEMPORAL` | Present & future | `NOW` current state · `COMMITMENTS` commitments & promises · `PLANS` near-term plans · `WORLD` external world |

Each subcategory has its own metadata config (`CATEGORY_META`): default weight, confidence, decay rate λ, self-relevance; some subcategories (`NOW`, `PLANS`, `WORLD`) also define auto-retire days.

**Key operations:**

| Operation | Method | Description |
|-----------|--------|-------------|
| Write | `upsertFact()` | Insert or update with automatic dedup |
| Trigger retrieval | `searchByTriggers()` | Fast hit when user message contains trigger words |
| Full-text retrieval | `searchByFts()` | SQLite FTS5 extension |
| Injection selection | `selectForInjection()` | Sort by confidence + weight, budget trim |
| Retire | `retire()` | Auto-retire low confidence, low accessCount |
| Merge | `consolidate()` | Merge high-similarity facts with same domain+subject |

### 4.3 MemoryRetriever — Multi-Path Diffusion Retrieval Engine

**File:** `src/main/memory/retriever.ts` (~500 lines)

This is the core algorithm of the memory system. It runs once per conversation turn, diffuses recall across **9 paths**, then assembles a Tier B injection block after dedup, ranking, and budget trimming.

#### 4.3.1 Nine-Path Diffusion Recall

```
retrieve(query, hint, budget, valence, aff, temporalCtx, queryEmbed, ...)
    │
    ├── ① Trigger word match ───────────────── fast path
    │     factStore.searchByTriggers(query)
    │     Substring containment (any trigger word appears in user message)
    │
    ├── ② Injection pre-selection ─────────── background
    │     factStore.selectForInjection(budget, minConfidence=0.55)
    │     Greedy selection sorted by scoreRelevance (query-agnostic background facts)
    │
    ├── ③ FTS5 full-text search ───────────── keyword
    │     factStore.searchByFts(query, topK=5)
    │     SQLite FTS5 engine, keyword level
    │
    ├── ④ Jaccard semantic search ─────────── shallow semantic
    │     searchBySemantics(facts, query, topK=5)
    │     Character Jaccard + keyword Jaccard ∘ 1.2 blend
    │     Threshold 0.12
    │
    ├── ⑤ Embedding vector search ─────────── deep semantic
    │     vectorStore.searchAsync(query, topK=6, queryEmbed)
    │     Dense vector cosine search (ONNX Runtime)
    │     ≥ EMBEDDING_MIN_SCORE(0.35)
    │
    ├── ⑥ TF-IDF vector search (fallback) ─── fallback
    │     vectorStore.search(query, topK=6)
    │     CJK 2-gram + word tokenization, cosine ≥ 0.05
    │     Runs only when embedding unavailable and not short-circuited
    │
    ├── ⑦ Temporal semantic retrieval ─────── temporal signal
    │     When msgTemporalSemanticSignal is non-empty
    │     FTS + Jaccard + embedding on semantic tags (threshold lowered to 0.3)
    │     Produces 【temporal recall cue】 header
    │
    ├── ⑧ Temporal anchor diffusion ───────── temporal anchor
    │     Strategy A: recurring anchor ±7 day window, not triggered in 30 days, top 3
    │     Strategy B: recurring ±30 days + fuzzy past 90 days
    │     Parse linked_fact_ids JSON → temporalAnchorHits
    │
    └── ⑨ Association network diffusion ───── graph diffusion
          One-hop diffusion from seed facts along association edges
          associationIndex.getAssociations(seedId, minStrength=0.3)
          Produces associationHits (newly discovered associated facts)
```

**Short-circuit optimization:** When trigger + FTS return ≥5 distinct facts and at least one has `confidence > 0.7`, TF-IDF vector search is skipped. Embedding search and association diffusion are **not skipped**.

#### 4.3.2 Merge and Dedup

Facts from all paths are collected into `factsForEcho[]`; a `mergedIds` Set ensures each fact appears only once. Injection priority order:

```
Trigger hit → injection pre-selection → FTS → Embedding → Jaccard semantic → TF-IDF
→ temporal semantic → temporal anchor → association diffusion
```

Association diffusion dedup is linked to `mergedIds` — facts already found via direct paths are not re-added via association edges.

#### 4.3.3 Final Ranking Formula

Each fact’s final rank score is the **product** of four factors:

```
finalScore = temporalBoost × recencyBoost × emotionBoost × pathBoost × scoreRelevance
```

| Factor | Condition | Multiplier |
|--------|-----------|------------|
| **temporalBoost** | Six-dimensional temporal weighting (day/night, weekday, season, late night, reunion, distance) | 0.9 ~ 4.5 |
| **recencyBoost** | hint.favorRecent=true and updated within 3 days | 1.5 |
| **emotionBoost** | Emotional volatility >0.4 and subcategory is OUR_BOND/MOOD/VULNERABILITIES/SELF_PERCEPTION | 1 + vol×0.5 (max 1.5) |
| **pathBoost** | Hit by any retrieval path | **TRIGGER_MATCH_BOOST = 2.0** |
| **scoreRelevance** | Base relevance score (see below) | weight×e^(-λ×days)×selfRelevance×(1+intensity×0.5) |

**Additional boosts to scoreRelevance:**

```
Emotional alignment: |fact.valence - currentValence| < 0.3  → ×1.5 (normal) / ×1.2 (|aff|≥50)
Recency boost: updated within last 4 hours → ×1.8
Embedding alignment: queryEmbed + factEmbeddingCache available → ×(1 + cosine×0.3)
```

#### 4.3.4 Budget Trimming and Tier B Assembly

Global budget `TIER_B_CHAR_BUDGET = 8000` characters; blocks are filled by priority:

```
budget = min(adjustedBudget, 8000)

① Temporal semantic header (if present)     → one-time string
② Core memories (core facts)                → min(2000, budget×40%)
③ Injected fact lines (ranked fact list)    → fill budget, reserve ≥200 for later
④ Chunk snippets                            → CHUNK_SEARCH_MAX_RESULTS = 8
⑤ Knowledge graph context                   → KG_CHAR_BUDGET = 800 (when remaining >150)
⑥ Episodic memories                         → EPISODE_CHAR_BUDGET = 1200 (when remaining >150)
```

**Source annotation:** Each injected fact line gets a trailing source marker:

```
· subject：summary                 ← trigger/embedding/FTS/semantic/pre-selection
· subject：summary  ↳ association diffusion  ← one-hop discovery via association graph
· subject：summary  ↳ temporal semantic      ← temporal signal match
· subject：summary  ↳ temporal anchor        ← temporal anchor table parse
```

#### 4.3.5 Co-occurrence Tracking

After ranking completes, co-occurrence is updated every 3 turns (to prevent runaway growth):

1. Take top 8 facts sorted by `scoreRelevance`
2. Pair `(fa, fb)`:
   - Must share the same `domain`
   - If embeddings exist, cosine must be > 0.3
3. On pass, call `associationIndex.strengthenOrCreate(fa.id, fb.id, type)`
   - Same subcategory → `'event_chain'`
   - Cross subcategory → `'thematic'`

#### 4.3.6 Trace Output

`RetrievalResult.trace` includes key metrics:

| Field | Meaning |
|-------|---------|
| `factsUsed` | Deduped count of injected facts |
| `embeddingHits` | Embedding search hit count |
| `associationHits` | New facts discovered via association diffusion |
| `associationActivations` | Total association edges traversed this run |
| `temporalAnchorHits` | Facts resolved from temporal anchors |
| `memoirTrust` | Weighted average trust of OUR_BOND facts (floor 25) |
| `episodesUsed` | Episodic memories retrieved |

### 4.4 Ingestion Pipeline — Memory Write Path

**File:** `src/main/memory/ingest.ts`

Runs asynchronously after a conversation completes, in three phases:

```
Phase 1 — Lightweight sync (milliseconds)
  ├── captureEmotionalContext()    Capture emotional context
  ├── Simple rule-based fact extraction  Facts without LLM
  ├── writeTemporalAnchor()        Temporal anchor
  ├── autoMirrorCheck()            Auto mirror check
  └── contradictionCheck()         Contradiction detection

Phase 2 — LLM async extraction (seconds)
  ├── FactExtractor.extract()      LLM structured fact extraction
  │     Input: this turn (user + assistant)
  │     Output: { domain, subcategory, subject, summary }[]
  ├── EpisodeExtractor.extract()   Episode extraction
  │     Input: recent multi-turn conversation
  │     Output: episodic narrative blocks
  └── TripleExtractor.extract()    Knowledge graph triples

Phase 3 — Persistence
  ├── consolidator.consolidate()   Merge/dedup + weight update
  ├── factStore write              Persist facts.v2.json + SQLite
  ├── episodicStore write          Episodic storage
  ├── knowledgeGraph write         Graph associations
  ├── associationColdStart         Seed associations for new facts
  └── factEmbeddingCache update    Vector cache
```

### 4.5 Knowledge Graph and Association System

**Files:** `knowledgeGraph.ts`, `associationColdStart.ts`, `associationIndex.ts`

Ackem facts are connected by **association edges**, forming a lightweight knowledge graph:

| Association type | Trigger condition | Purpose |
|------------------|-------------------|---------|
| Co-occurrence | Appear together in the same turn | Joint recall of related facts |
| Same domain | Shared domain + subcategory | Expand within category |
| Embedding similarity | cosine > threshold | Auto-link semantically similar facts |
| Temporal anchor | Shared temporal anchor | Memories of the same special date |
| Explicit | LLM-extracted triples | "User likes cats" → "User has an orange cat" |

**Cold-start strategy:** When new facts are written, `seedAssociationsForNewFacts()` computes embedding similarity against existing facts and automatically establishes initial association edges.

---

## 5. Forgetting and Decay

Ackem memories are not permanent. To approximate human forgetting curves, Ackem implements multi-layer decay, retirement, consolidation, and contradiction resolution.

### 5.1 Exponential Decay Model

Every MemoryFact undergoes exponential decay when participating in relevance scoring, core slot competition, and memory echo:

```
score = weight × e^(-λ × days) × selfRelevance × ...
```

Where `λ` (decayLambda) depends on the fact’s subcategory and layer:

| Layer | λ source | Half-life |
|-------|----------|-----------|
| Raw facts (`factLayer: 'raw'`) | Subcategory-specific decayLambda (see table below) | 7 days ~ 693 days |
| Consolidated insights (`factLayer: 'consolidated'`) | `CONSOLIDATED_DECAY_LAMBDA = 0.003` | ≈630 days |

**Decay parameters for 25 subcategories:**

| Subcategory | Domain | decayLambda | Half-life | autoRetireDays |
|-------------|--------|-------------|-----------|----------------|
| BASIC_PROFILE / LIFE_STORY | IDENTITY | 0.001 | 693 days | — |
| OUR_BOND | SOCIAL | 0.001 | 693 days | — |
| FAMILY | SOCIAL | 0.002 | 347 days | — |
| PROCEDURES | PURSUITS | 0.002 | 347 days | — |
| HEALTH | DAILY_LIFE | 0.002 | 347 days | — |
| VALUES_BELIEFS / PARTNER / VULNERABILITIES | — | 0.003 | 231 days | — |
| SELF_PERCEPTION / FRIENDS / CAREER / GOALS / TASTES / INSIDE_JOKES | — | 0.005 | 139 days | — |
| LEARNING / PROJECTS | PURSUITS | 0.008 | 87 days | — |
| ROUTINES | DAILY_LIFE | 0.008 | 87 days | — |
| LIVING_SPACE / LIFESTYLE | DAILY_LIFE | 0.01 | 69 days | — |
| PLANS | TEMPORAL | 0.02 | 35 days | 7 |
| MOOD | INNER_WORLD | 0.05 | 14 days | — |
| NOW / WORLD | TEMPORAL | 0.1 | 7 days | 3 / 7 |
| COMMITMENTS | TEMPORAL | **0** | Never decays | — |

Design principle: **the more "present-moment" a fact is, the faster it decays** (NOW: 7-day half-life); **the more "identity-core" a fact is, the slower it decays** (BASIC_PROFILE: 693-day half-life). COMMITMENTS never decay.

### 5.2 Computing Decayed Score

**`computeDecayedScore()`** is used for core memory slot competition (`factStore.ts`):

```typescript
private computeDecayedScore(f: MemoryFact): number {
    const days = (now - f.createdAt) / 86400000
    const meta = CATEGORY_META[f.subcategory]
    const lambda = f.factLayer === 'consolidated'
      ? CONSOLIDATED_DECAY_LAMBDA    // 0.003
      : (meta?.decayLambda ?? 0.005)
    return f.weight * Math.exp(-lambda * days) * f.selfRelevance
}
```

**`scoreRelevance()`** adds emotional alignment and recency modulation for prompt injection ranking:

```
score = weight × e^(-λ×days) × selfRelevance × (1 + intensity×0.5)
       × (emotion aligned? 1.5/1.2 : 1)
       × (updated within 4h? 1.8 : 1)
       × (embedding aligned? 1 + cosine×0.3 : 1)
```

### 5.3 Core Memory Slot Competition

Core memory hard cap: `CORE_MEMORY_MAX_COUNT = 12`. When core facts exceed 12:

1. Each core fact computes `computeDecayedScore()` (post-decay score)
2. Lowest-scoring overflow core facts are demoted to `archival` tier
3. New facts auto-promote to core when weight reaches `CORE_MEMORY_WEIGHT_THRESHOLD = 3.0`

### 5.4 Automatic Retirement

**Time-based retirement** (`autoRetireExpired()`):

Every `AUTO_RETIRE_CHECK_INTERVAL = 10` turns, scan active facts in `NOW`, `PLANS`, and `WORLD`; facts exceeding `autoRetireDays` are marked `status: 'retired'`. Only these three subcategories participate in auto-retirement today.

**Physical compaction** (`compactFacts()`):

Every 50 turns, physically delete retired ephemeral facts (NOW/PLANS/WORLD) from the array; retention period `AUTO_COMPACT_RETENTION_DAYS = 30` days. Retired facts in other subcategories are **kept permanently as marked records** — status changes only, no physical deletion.

### 5.5 Dedup Weighting and Name Demotion

**Dedup merge:** When Jaccard similarity between a new fact and an existing fact is > `0.42` or embedding cosine > `0.85`:

```typescript
existing.weight = Math.max(existing.weight, newWeight) + FACT_DEDUP_WEIGHT_BOOST  // +0.5
```

Repeated confirmation of the same memory accumulates weight — the implementation of "repetition means importance."

**Name demotion:** When recording a new name/nickname, old names under the same subject lose 1 weight (minimum 0), reflecting "the user changed what they want to be called."

### 5.6 LLM Consolidation

**Goal:** Extract higher-level, slower-decaying insights from multiple raw facts.

**Trigger conditions** (`autoConsolidationPolicy.ts`):

```
Prerequisite: raw fact count ≥ 6
Conditions (any one):
  - turns ≥ 60              → forced consolidation
  - turns ≥ 30              → routine consolidation
  - meaningful event density > 40%  → early trigger
```

**Flow:**
1. Take up to 30 most recent raw facts (sorted by updatedAt descending)
2. LLM identifies cross-fact patterns, produces up to 4 consolidated insights
3. Each insight is written with `weight=4.0`, `confidence=0.7`, `factLayer='consolidated'`
4. Uses `CONSOLIDATED_DECAY_LAMBDA = 0.003` (very slow decay)

```
Raw                    Consolidated
  weight=2.5               weight=4.0
  λ=0.01                   λ=0.003
  half-life ~69 days       half-life ~630 days
  unconsolidated           derived from 3 raw facts
```

### 5.7 Contradiction Detection and Self-Editing

**Sampling** (`factContradictionSampler.ts`): Every `MIRROR_CHECK_INTERVAL_TURNS = 20` turns, scan fact pairs in the same subcategory sorted by updatedAt descending; pairs with Jaccard similarity > 0.35 and weight ≥ 1.5 are sent to LLM for judgment.

**LLM verdict** (`contradictionDetector.ts`):
- **reinforce mutual confirmation** → merge, weight +0.3
- **conflict + keep_new** → retire old fact
- **conflict + keep_old** → retire new fact
- **conflict + merge** → take longer summary, keep higher weight
- **conflict + flag** → leave for human review, no auto action

### 5.8 Active Forgetting

When user messages contain forget triggers ("let's not talk about that", "I don't want to discuss this", "let's move on", "forget it", "change the topic"):

1. Extract topic keywords from the message (filter stop words and triggers)
2. Embed the topic
3. Cosine-scan all active facts, threshold > 0.7
4. Matched facts get `sensitivity: 'avoid'` — no longer auto-injected into prompts

### 5.9 Memory Echo Decay

When computing long-term emotional impact of memories:

```typescript
w = fact.emotionalContext.intensity × e^(-λ×days) × fact.selfRelevance × (fact.weight / 3)
```

Echo values are clamped to `[-MEMORY_ECHO_CAP, +MEMORY_ECHO_CAP] = [-2.0, +2.0]`.

### 5.10 Parameter Summary

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `CONSOLIDATED_DECAY_LAMBDA` | 0.003 | Consolidated insight decay rate |
| `CORE_MEMORY_MAX_COUNT` | 12 | Core memory cap |
| `CORE_MEMORY_WEIGHT_THRESHOLD` | 3.0 | Auto-promote to core |
| `FACT_DEDUP_WEIGHT_BOOST` | 0.5 | Dedup merge gain |
| `AUTO_COMPACT_RETENTION_DAYS` | 30 | Post-retirement retention days |
| `AUTO_RETIRE_CHECK_INTERVAL` | 10 | Retirement check interval (turns) |
| `RECENCY_BOOST_WINDOW_HOURS` | 4 | Recency window (hours) |
| `RECENCY_BOOST_FACTOR` | 1.8 | Recency boost multiplier |
| `CONTRADICTION_SIMILARITY_THRESHOLD` | 0.35 | Contradiction detection threshold |
| `CONSOLIDATION_INSIGHT_WEIGHT` | 4.0 | Consolidated insight weight |
| `CONSOLIDATION_INTERVAL_TURNS` | 30 | Consolidation interval (turns) |
| `MEMOIR_TRUST_FLOOR` | 25 | Memory trust floor |
| `EMBEDDING_DEDUP_THRESHOLD` | 0.85 | Embedding dedup threshold |
| `MEMORY_ECHO_CAP` | 2.0 | Memory echo cap |

---

## 6. Memory Tier System

| Tier | Content | Injection strategy | Source |
|------|---------|-------------------|--------|
| **Tier A** | Companion current state (mood, self-perception) | Every turn | `companion/self.md` |
| **Tier B** | Retrieved memory facts | By relevance + budget | `retriever.ts` |
| **Canon** | Ackem persona (non-rewritable) | Every turn | `canon/ackemCanon.ts` |

Tier B is strictly budget-controlled (`TIER_B_CHAR_BUDGET`); overflow is truncated. This is the technical guarantee of the "retrieve-then-inject" principle.

---

## 7. Modification Guide

| If you want to… | Start with |
|-----------------|------------|
| Add a new user-intent keyword | `interpreter.ts` rule tables |
| Change memory recall strategy (weights/thresholds) | `retriever.ts` + `ackemParams.ts` |
| Change memory write logic | `ingest.ts` + `factExtractor.ts` |
| Change association diffusion algorithm | `associationColdStart.ts` + `associationIndex.ts` |
| Change import format | `documentImport/` |
| Change write-path LLM extraction prompts | `prompt/memory-fact-extract.ts` |
| Change full-text search behavior | SQLite FTS5 schema (`db/repos/fts.ts`) |
| Change decay rate (λ) | `taxonomy.ts` → `CATEGORY_META.decayLambda` |
| Change auto-retire days | `taxonomy.ts` → `CATEGORY_META.autoRetireDays` |
| Change consolidation strategy | `autoConsolidationPolicy.ts` + `consolidator.ts` |
| Change contradiction detection threshold | `factContradictionSampler.ts` + `ackemParams.ts` |
| Change core memory cap | `ackemParams.ts` → `CORE_MEMORY_MAX_COUNT` |

**Prefer changing `ackemParams.ts` for parameters** — do not inline magic numbers in modules.

---

## 8. Related Documentation

| Document | Content |
|----------|---------|
| [02-heart-system.md](./02-heart-system.md) | How Events drive relationship/emotion |
| [04-neural-system.md](./04-neural-system.md) | How L0/L4 consume Embedding |
| [06-time-system.md](./06-time-system.md) | L4 retrieval temporal modulation, temporal anchor retrieval |
| [00-overall-system.md](./00-overall-system.md) | Full conversation pipeline |
| [ai-context-and-retrieval-policy.md](../../ai-context-and-retrieval-policy.md) | Memory injection policy and privacy commitments |

*Brain System · Ackem v1.0.0 · 2026-06*
