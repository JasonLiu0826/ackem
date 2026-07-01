# Neural System

> **Language:** English · [中文](./04-neural-system.zh.md)

> **Layer:** Embedding / semantic infrastructure  
> **Codename:** Neural Engine  
> **Core question:** How do we turn text into computable semantic vectors? How do we connect the Brain, Heart, Mouth, and Extension systems?  
> **Design principle:** Degrade without crashing, cold start without blocking, warm up without duplication

---

## 1. Role

The Neural System is Ackem's **semantic infrastructure layer**. It does not participate in dialogue generation itself. It converts text into vectors so other systems can **understand semantics rather than match keywords only**:

```
User message "I'm in a bad mood and want someone to talk to"
    │
    ▼
┌────────────────────────────────────────────────────────────┐
│  Neural System · Embedding Pipeline                        │
│                                                            │
│  ① Infrastructure layer (memory/embedding/)                │
│     ONNX Runtime ─→ float[512] vector                      │
│                                                            │
│  ② Application layer (embedding/)                          │
│     ┌──────────────┬──────────────┬──────────────────┐     │
│     │ AnchorVector │  RouteTable  │  TemporalSignal  │     │
│     │ Semantic     │ Extension    │ Temporal semantic│     │
│     │ fallback     │ route match  │ detection        │     │
│     ├──────────────┼──────────────┼──────────────────┤     │
│     │   Scoring    │   Readiness  │   PreLlmWarmup   │     │
│     │ Emotion align│ Readiness    │ Precomputed cache│     │
│     │ / rerank     │ state machine│                  │     │
│     └──────┬───────┴──────┬───────┴────────┬─────────┘     │
└────────────┼──────────────┼────────────────┼───────────────┘
             │              │                │
    ┌────────┴───┐   ┌──────┴──────┐   ┌────┴──────────┐
    │ Brain L0   │   │ Extension   │   │ Brain L4      │
    │ Semantic   │   │ Dispatch    │   │ Vector search │
    │ fallback   │   │ route match │   │ + temporal    │
    └────────────┘   └─────────────┘   └───────────────┘
```

### 1.1 Data flow with other systems

The Neural System acts like a **neural network**—every system draws semantic information from it each turn:

```
                         Neural System
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
    ┌───┴───┐        ┌───┴───┐         ┌────┴───┐
    │ Brain │        │ Heart │         │Extension│
    │       │        │       │         │         │
    │ L0    │        │ Emotion│        │ Route   │
    │ fallback│      │ align │         │ match   │
    │ L4    │        │ Mirror│         │ Intent  │
    │ retrieve│      │ Contradiction│  │ detect  │
    │ Assoc │        │ detect│         │         │
    │ cold  │        │       │         │         │
    │ start │        │       │         │         │
    └────────┘        └────────┘         └─────────┘
         │                │                    │
         └────────────────┴────────────────────┘
                        │
                   ┌────┴────┐
                   │ Mouth   │
                   │ (consumes│
                   │ retrieval│
                   │ results) │
                   └─────────┘
```

**Embedding data flow per turn:**

```
prepareTurnContext()
    │
    ├── embeddingProvider.embed(msg)          → queryEmbed
    │     passed to L0 semantic fallback (interpreter.ts)
    │     passed to L4 vector search (retriever.ts searchAsync)
    │     passed to emotion alignment scoring (scoring.ts)
    │     passed to temporal semantic detection (temporalSignalExtractor.ts)
    │     passed to extension route matching (routeTable.ts)
    │     passed to father-reference resolution (creatorMemory.ts)
    │     passed to creator memory entry matching (orchestrator.ts)
    │
    ├── computeConversationEmbed(recentMsgs)  → conversationEmbed
    │     passed to active recall selection (activeRecall.ts)
    │     passed to association co-occurrence activation (retriever.ts)
    │
    └── getCachedTemporalEmbeddings()
         └── detectTemporalSignal(queryEmbed) → temporalSemanticSignal
               passed to L4 temporal semantic retrieval (retriever.ts FIX-007)
```

---

## 2. Two-Layer Architecture

The Neural System is split into two layers to avoid import cycles:

### 2.1 Infrastructure layer · `src/main/memory/embedding/`

| File | Responsibility |
|------|----------------|
| `types.ts` | `EmbeddingProvider` interface, `ModelManifest`, `LocalModelId` |
| `provider.ts` | `createEmbeddingProvider()` factory — local → remote → Noop chain |
| `onnxProvider.ts` | ONNX Runtime inference — tokenizer + session + mean pooling |
| `modelManager.ts` | Model file lifecycle — extract, download (resumable), switch |
| `bootstrapBundledModels.ts` | Synchronously extract bundled models at startup |

### 2.2 Application layer · `src/main/embedding/`

| File | Responsibility | Lines |
|------|----------------|-------|
| `anchorVectors.ts` | 94 anchor words × 10 categories, semantic center computation, negation detection | 488 |
| `semanticFallback.ts` | Map embedding classification back to EventType | — |
| `routeTable.ts` | 12 built-in extension route tables, build/match/rule checks | 247 |
| `scoring.ts` | Emotion alignment, semantic rerank, conversation vectors, profile inference, diary center | 205 |
| `embeddingReadiness.ts` | Readiness state machine (idle→loading→syncing→warming→ready) | 80 |
| `preLlmWarmup.ts` | Module-level cache (anchors/temporal/father/creator memory) | 158 |
| `types.ts` | Application-layer types, confidence thresholds | 150 |

---

## 3. Provider Architecture

### 3.1 Core interface

```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
  dimension(): number
  name(): string       // e.g. "local:bge-small-zh" | "remote:deepseek"
  ready(): boolean
  dispose(): void
}
```

### 3.2 Three-priority chain

`createEmbeddingProvider()` never throws; it degrades step by step:

```
① Local ONNX
   if activeModel !== 'none' && isOnnxRuntimeAvailable() && model extracted
   → OnnxEmbeddingProvider
   │ latency: 10-50ms · offline-capable · fully local

② Remote API
   if remote.url configured
   → RemoteEmbeddingProvider (OpenAI-compatible)
   │ latency: 100-500ms · requires network · sent to remote
   │ first embed('test') call validates connectivity, 5s timeout

③ Noop fallback
   → NoopEmbeddingProvider
   │ ready() always false
   │ downstream VectorStore automatically falls back to TF-IDF
```

### 3.3 RemoteEmbeddingProvider

Supports any OpenAI-compatible embedding API:

```typescript
class RemoteEmbeddingProvider {
  // dimension guess: model.includes('small') → 512, else 1536
  // request format: POST { model, input: texts }
  // auth: Authorization: Bearer ${apiKey}
  embedBatch(texts) → POST → json.data[].embedding
}
```

### 3.4 Provider configuration change detection

`engineCache.ts` manages provider lifecycle. When the user switches models or configures a remote API, it rebuilds automatically:

```
providerConfigSignature = `${activeModel}|${remoteUrl}|${remoteModel}`

getOrInitEmbeddingProvider(dataRoot):
  if config signature unchanged → return cached provider
  if config signature changed:
    ① dispose old provider
    ② invalidate Pre-LLM warmup cache
    ③ create new provider
    ④ rebuild all fact embeddings in background (scheduleEmbeddingRebuild)
```

---

## 4. ONNX Runtime Inference Engine

**File:** `src/main/memory/embedding/onnxProvider.ts` (439 lines)

### 4.1 Model file structure

```
{modelDir}/
├── model.onnx          # ONNX model
├── tokenizer.json      # BPE vocabulary
└── config.json         # max_position_embeddings + hidden_size
```

### 4.2 Supported models

| Model | Dimensions | Compressed | Extracted | Source | Chinese quality |
|-------|------------|------------|-----------|--------|-----------------|
| **bge-small-zh** | 512 | 35MB | 90MB | bundled | ★★★★ |
| **bge-small-en** | 512 | 40MB | 130MB | bundled | ★★★★ |
| m3e-small | 512 | 35MB | 90MB | downloadable | ★★★★ |
| bge-base-zh | 768 | 150MB | 400MB | downloadable | ★★★★★ |

bundled = shipped with the installer, auto-extracted at startup. downloadable = fetched on demand from GitHub Releases (Gitee mirror in China).

### 4.3 Full inference pipeline

```
embed(text):
    │
    ├── ① Tokenize (simplified BPE)
    │     [CLS] → char-by-char vocab lookup (prefer 2-char match) → [SEP]
    │     try BERT-style ## prefix → on miss use [UNK]
    │     pad to maxLen (default 512)
    │
    ├── ② Create ONNX tensors
    │     input_ids:      BigInt64Array [1, maxLen]
    │     attention_mask: BigInt64Array [1, maxLen]
    │     token_type_ids: BigInt64Array [1, maxLen]
    │
    ├── ③ session.run()
    │     ONNX Runtime InferenceSession
    │     input names: input_ids / attention_mask / token_type_ids
    │
    ├── ④ Post-processing
    │     if shape = [batch, hidden]       → use directly (already pooled)
    │     if shape = [batch, seq, hidden]  → mean pooling
    │        pooled[h] = Σ(data[s][h]) / validTokens
    │
    └── ⑤ L2 normalization
          norm = sqrt(Σ(vec[h]²))
          vec[h] = vec[h] / norm
          → float[512]
```

**Batching:** up to 8 items per batch (`BATCH_SIZE = 8`). Single items use the single-item path; multiple items use the batch path.

**Output dimension probing:** at startup, probe actual hidden_size asynchronously with a short input, overriding config.json defaults.

### 4.4 onnxruntime-node availability

`isOnnxRuntimeAvailable()` detects dynamically:

```typescript
function isOnnxRuntimeAvailable(): boolean {
  try {
    ort = require('onnxruntime-node')  // optionalDependency
    return true
  } catch {
    return false  // user not installed → degrade
  }
}
```

---

## 5. Model Management

**File:** `src/main/memory/embedding/modelManager.ts`

### 5.1 Storage layout

```
Install dir resources/models/          ← bundled zip
  ├── bge-small-zh-v1.5.onnx.zip
  └── bge-small-en-v1.5.onnx.zip

data/models/                           ← extract/download target
  ├── bge-small-zh/
  │   ├── model.onnx
  │   ├── tokenizer.json
  │   └── config.json
  ├── bge-small-en/
  └── .model-state.json                ← currently active model
```

### 5.2 Lifecycle

```
ensureModelExtracted(id, dataRoot):
  ① check extract directory exists
  ② extract from bundled zip (PowerShell Expand-Archive / unzip)
  ③ seed from dev cache (.test-cache/models/)
  ④ return { modelDir, success }

downloadModel(id, dataRoot, onProgress, signal):
  ① fetch manifest (URL + mirrorUrl)
  ② check existing .downloading partial download → resume
  ③ primary URL → on failure → mirror URL
  ④ doDownload(): redirects (max 5) + Range request + progress callback every 200ms
  ⑤ download complete → rename .zip → extract → switchModel()

switchModel(id, dataRoot):
  ① write .model-state.json { activeModel, version, dimension }
  ② trigger engineCache.scheduleEmbeddingRebuild()
```

### 5.3 Startup bootstrap

**File:** `bootstrapBundledModels.ts`

```typescript
// called synchronously in index.ts, does not block UI
bootstrapBundledEmbeddingModels(dataRoot):
  for each bundled model (bge-small-zh, bge-small-en):
    ① check data/models/{id}/model.onnx exists
    ② if not → extract from resources/
    ③ if yes → skip
  if no active model && locale default model extracted:
    auto-activate bge-small-zh (Chinese) or bge-small-en (English)
```

---

## 6. Vector Store · VectorStore

**File:** `src/main/memory/vectorStore.ts` (256 lines)

### 6.1 Dual-cache design

VectorStore maintains **two independent vector caches**:

```
VectorStore
│
├── Sparse TF-IDF vectors (always)
│   build(facts): build TF-IDF index from facts
│   tokenization: CJK punctuation split, full word + character bigrams
│   TF: count / maxTf
│   IDF: log((1+N)/(1+df)) + 1
│   → Map<termId, float>[]
│
└── Dense embedding vectors (when provider ready)
    buildDenseCache(facts): batch embedding
    → { factId, vec: float[], norm }[]
```

### 6.2 Search strategy

```
searchAsync(query, topK, queryEmbed?):
    │
    if dense cache ready && (queryEmbed or embedQuery available):
    │   └── searchByDenseVector(qVec, topK)
    │        cosine = dot(qVec, factVec) / (qNorm * norm)
    │        filter score > VECTOR_SEARCH_MIN_SCORE (0.05)
    │        sort and take topK
    │
    else:
        └── search(query, topK)  ← TF-IDF fallback
             vectorizeQuery(query) → TF-IDF sparse vector
             cosine similarity
             filter + sort + topK
```

### 6.3 Cache persistence

Dense vectors are persisted to SQLite via `factEmbeddingsRepo.ts`:

```
fact_embeddings table:
  fact_id   TEXT PRIMARY KEY
  model_sig TEXT           ← provider.name(); full rebuild on model switch
  dim       INTEGER
  updatedAt TEXT
  vector    BLOB           ← Float32Array binary (4 bytes per dimension)

Cache invalidation: computeCorpusHash(activeFacts) = hash(id + updatedAt)
  incremental: embed only missing facts
  full: when model signature changes / corpusHash mismatch
```

### 6.4 Fact embedding cache · factEmbeddingCache

**File:** `src/main/memory/factEmbeddingCache.ts`

In addition to VectorStore's dense cache, there is a separate `factEmbeddingCache`:

```typescript
class FactEmbeddingCache {
  private cache: Map<string, number[]>  // factId → vector

  build(facts, provider):   // full build
  get(id): number[]         // single lookup
  set(id, vec): void        // single set
  delete(id): void          // delete
  size(): number            // count
}

// shared cosine similarity function (used across codebase)
cosineSimilarity(a, b): number
```

---

## 7. Application Layer — Anchor Vectors and Semantic Fallback

**File:** `src/main/embedding/anchorVectors.ts` (488 lines)

This is the core module of the embedding application layer, providing **LLM-free semantic classification**.

### 7.1 Anchor word system

94 carefully designed anchor words covering 10 semantic categories:

```
General (74 words, 7 categories)     Adult mode (20 words, 3 categories)
─────────────────────────────────     ─────────────────────────────────
vulnerable    vulnerable  20 words     adult_suggestive  suggestive  8 words
praise        praise      10 words     adult_dominant    dominant    6 words
hurtful       hurtful     12 words     adult_submissive  submissive  6 words
apology       apology      8 words
cold          cold         8 words
tease         tease        8 words
question      question     8 words
```

Chinese and English each have independent anchor words, selected automatically by `getLocale()`.

### 7.2 Semantic center computation

```
buildAnchorVectors(provider):
  for each category, batch-embed all anchor words in that category
  → take vector average = that category's "semantic center"

AnchorVectors = {
  vulnerable: float[512],   // semantic center for vulnerable category
  praise: float[512],       // semantic center for praise category
  hurtful: float[512],      // ...
  ...
  adult_suggestive?: float[512],  // optional in adult mode
  adult_dominant?: float[512],
  adult_submissive?: float[512],
}
```

### 7.3 Semantic fallback classification

```
classifyBySemantics(queryEmbed, anchors, mode):
    │
    for each category:
        score = cosineSimilarity(queryEmbed, anchors[cat])
    │
    best = max(score)
    │
    if best < MID_CONFIDENCE_THRESHOLD (0.45):
        return null  ← no hit
    │
    confidence = best >= HIGH_CONFIDENCE_THRESHOLD (0.70)
                ? 'high' : 'medium'
    │
    return { category, score, confidence }
```

### 7.4 Negation detection

```
detectNegation(msg, category):
  Chinese negation words: 不 / 没 / 别 / 才 / 非
  English negation words: not / don't / never / no / can't / ...

  if message contains negation word (within 6/12 char window before target word):
     negation inversion mapping:
       praise    → hurtful
       vulnerable → cold
       apology   → hurtful
       tease     → cold
```

### 7.5 Integration with L0 interpreter

```
interpretInputWithEmbedding(msg, queryEmbed, anchors):
  ① run pure rule path first (interpretInput)
  ② if rule hits non-casual_chat → return rule result directly
  ③ if rule result is casual_chat:
       applyEmbeddingFallback(queryEmbed, anchors)
       if hit → override event type with embedding classification
       if miss → keep rule result
```

This design ensures the **zero-latency L0 path** always takes priority; embedding is only semantic fallback when keyword rules miss.

---

## 8. Application Layer — Route Table (Extension Dispatch)

**File:** `src/main/embedding/routeTable.ts` (247 lines)

### 8.1 Built-in route table

12 built-in extensions, each with 5–10 typical user queries:

| Extension | exampleQueries |
|-----------|---------------|
| `ackem/weather-sense` | 帮我查天气, 明天会下雨吗, 需要带伞吗 ... |
| `ackem/web-search` | 帮我搜一下, 查一下这个什么意思 ... |
| `ackem/sedentary-reminder` | 坐得腰疼, 该站起来了吧, 脖子好酸 ... |
| `ackem/drink-water-reminder` | 该喝水了, 好渴, 提醒我喝水 ... |
| `ackem/late-night-reminder` | 熬夜好伤身, 该睡觉了 ... |
| `ackem/emergency-companion` | 我心情不好, 好难受, 想哭 ... |
| `ackem/markdown-table` | 帮我做个表格, 整理成表格形式 ... |
| `ackem/light-schedule` | 提醒我下午3点开会, 设个闹钟 ... |
| `ackem/diary-auto` | 写日记, 今天发生了什么 ... |
| `ackem/plan-document` | 做个计划, 帮我规划一下 ... |
| `ackem/knowledge-presentation` | 这是什么, 解释一下, 帮我科普 ... |
| `ackem/fun-profile` | 我今天是什么状态, 分析一下我 ... |
| `ackem/desktop-companion` | 打开桌面陪伴, 显示桌面 ... |

### 8.2 Route index construction

```
buildRouteIndex(provider, extraEntries):
  ① collect all exampleQueries (built-in + uskill/uplugin additions)
  ② deduplicate (same query may map to multiple extensions)
  ③ provider.embedBatch(allQueries) batch compute
  ④ assemble RouteIndex { entries: [{ extensionId, query, embedding }] }

addToRouteIndex(index, extId, newQueries, provider):
  incremental: embed only new queries, append to entries
```

### 8.3 Route matching

```
matchAgainstRouteTable(queryEmbed, index, topK=5):
  for each entry:
    score = cosineSimilarity(queryEmbed, entry.embedding)
  filter(score >= MID_CONFIDENCE_THRESHOLD 0.45)
  sort(desc) → topK

applyQuickRules(message):  ← second-layer rule check
  rule 1: negation words (不要/别/不想) → block
  rule 2: question not a request (好不好/是什么) → block
  rule 3: time-related but not dispatched → block
```

### 8.4 Integration with Dispatch

```
dispatchRouter.ts:
  if explicitDispatch matches auto_invoke:
    optional: use routeTable for embedding semantic verification first
    medium-confidence result + quickRules allow → execute Skill
```

---

## 9. Application Layer — Scoring and Reranking

**File:** `src/main/embedding/scoring.ts` (205 lines)

### 9.1 Emotion alignment scoring

On top of existing weighted ranking, use embedding for semantic emotion alignment:

```typescript
computeEmotionAlignmentBoost(queryEmbed, factEmbed, maxBoost = 0.3):
  alignment = cosineSimilarity(queryEmbed, factEmbed)
  return 1 + alignment * maxBoost
  // → facts semantically aligned with user message rank higher, up to +30%
```

### 9.2 Context semantic reranking

```
rerankBySemanticRelevance(facts, queryEmbed, getFactEmbed):
  for each fact:
    semanticScore = cosineSimilarity(queryEmbed, factEmbed)
  finalScore = baseScore × 0.6 + semanticScore × 0.4
  sort(desc)
```

### 9.3 Conversation vector computation

```typescript
computeConversationEmbed(recentMsgs, provider):
  input: last N user messages (typically 3)
  output: average embedding of multiple messages
  use: active recall selection, association co-occurrence activation
```

### 9.4 User profile dimension computation

Use embedding to infer tendencies across three dimensions from user dialogue:

```typescript
computeDimensionFromEmbedding(recentEmbeds, anchors):
  // anchors: { low, mid, high } three-tier anchor centers
  for each embed:
    lowScores[] = cosineSimilarity(embed, anchors.low)
    midScores[] = cosineSimilarity(embed, anchors.mid)
    highScores[] = cosineSimilarity(embed, anchors.high)
  // weighted average: low 0.2, mid 0.5, high 0.9
  return (avgLow × 0.2 + avgMid × 0.5 + avgHigh × 0.9) / total
```

Dimension anchor words (9 groups):

| Dimension | Low | Mid | High |
|-----------|-----|-----|------|
| sexualDirectness | 想被你融化 | 想抱你 | 操我 |
| dominancePreference | 我是你的 | 我们一起 | 跪下 |
| emotionalNeediness | 随便 | 想你了 | 不能没有你 |

### 9.5 Diary material importance center

```typescript
computeMeaningfulCenter(provider):
  anchor sentences: ['心里话', '压力大撑不住', '信任你', '决定了', '我发现原来我']
  average embedding of these 5 sentences → semantic center for "meaningful conversation"
```

---

## 10. Temporal Semantic Signal Extraction

**File:** `src/main/memory/temporalSignalExtractor.ts` (94 lines)

### 10.1 Temporal anchor sentences

37 predefined time-related sentences; detect temporal signals in user messages via embedding matching:

```
Past direction: 去年这个时候 / 上周的今天 / 一个月前 / 三天前 / 刚才
Future direction: 明天 / 后天 / 下周 / 下个月 / 明年
Fuzzy time: 最近 / 前几天 / 前阵子 / 那天 / 那时候
Recurring events: 生日 / 纪念日 / 过年 / 中秋 / 新年 / 年底 / 年初
Incremental time: 上次 / 好久不见 / 很久没 / 又过了一年
Frequency: 每天 / 每周 / 每月 / 每年 / 经常
```

### 10.2 Detection flow

```
detectTemporalSignal(msgEmbedding, sentenceEmbeddings, threshold=0.6):
  for each (sentence, embed) in sentenceEmbeddings:
    score = cosineSimilarity(msgEmbedding, embed)
  best = max(score)
  if best < 0.6 → return null
  type determination:
    contains "时候/前阵子/那天/好久" → fuzzy
    contains "生日/纪念日/过年/每天" → recurring
    contains "明天/上周/去年"        → exact
  return { label: "去年这个时候", type: "fuzzy" }
```

### 10.3 Impact on L4 retrieval

Temporal signal results passed to `retriever.ts` trigger two paths:

```
Temporal semantic path (FIX-007):
  if temporalSemanticSignal.label:
    ① FTS search this label → temporalSemanticHits
    ② Jaccard semantic search this label → temporalSemanticHits
    ③ embedding search (using temporalLabelEmbed, threshold 0.6×0.85=0.51)

Temporal anchor path (route 8):
  no embedding; query SQLite temporal_anchors table directly:
    recurring anchors: same month/day ±30 days → "User's birthday is coming!"
    fuzzy anchors: last 3 months → "Recent events"
```

---

## 11. Startup Warmup and Cache

**File:** `src/main/embedding/preLlmWarmup.ts` (158 lines)

### 11.1 Precomputed cache

All precomputed embedding results are **computed once, cached at module level, invalidated on model switch**:

```typescript
// cache variables (module-level, cross-turn)
let cachedAnchorVectors: AnchorVectors | null
let cachedProfileAnchors: ProfileAnchors | null
let cachedCreateToolAnchor: number[] | null
let cachedTemporalEmbeddings: Map<string, number[]> | null
let cachedFatherReferenceEmbeddings: Map<string, {cluster, vector}> | null
let cachedCreatorEntryEmbeddings: Map<string, number[]> | null
let cachedProviderSig: string  // provider name, for switch detection
```

### 11.2 Warmup startup

```
warmupPreLlmEmbeddings(provider, dataRoot?):
  if !provider.ready() → skip
  Promise.all([
    getCachedAnchorVectors(provider),           // 10 semantic centers
    getCachedTemporalEmbeddings(provider),       // 37 temporal anchors
    getCachedFatherReferenceEmbeddings(provider),// father-reference resolution
    dataRoot ? getCachedCreatorEntryEmbeddings(provider, dataRoot) : undefined
  ])
```

### 11.3 Cache invalidation

```typescript
invalidatePreLlmEmbeddingCache():
  // called on model switch / provider rebuild
  all caches = null
  cachedProviderSig = ''
```

---

## 12. Readiness State Machine

**File:** `src/main/embedding/embeddingReadiness.ts` (80 lines)

### 12.1 Phases

```
idle (0%) → loading_provider (15%) → syncing_facts (50%)
         → warming_prellm (85%) → ready (100%) | degraded (100%)
```

### 12.2 Subscription API

```typescript
getEmbeddingReadiness(): { phase, progress, providerReady, factEmbeddingsReady, preLlmWarmReady }
isEmbeddingReadyForChat(): boolean  // phase === 'ready' || 'degraded' allows chat
onReadinessChange(cb): () => void   // UI shows progress bar
```

### 12.3 Full startup warmup sequence

```typescript
// index.ts warmupEmbeddingAtStartup() background async
async function warmupEmbeddingAtStartup(dataRoot, index):
  setPhase('loading_provider')
  provider = await getOrInitEmbeddingProvider(dataRoot)  // load ONNX

  if !provider?.ready():
    setPhase('degraded')  // degraded, chat not blocked
    return

  setPhase('syncing_facts', { providerReady: true })
  entry = getOrCreateEngineCache(dataRoot, index)
  entry.embeddingProvider = provider
  wireVectorStoreEmbeddings(entry.vs, provider)
  await ensureFactEmbeddingsReady(entry)  // batch embed all active facts

  setPhase('warming_prellm', { factEmbeddingsReady: true })
  await warmupPreLlmEmbeddings(provider, dataRoot)  // anchors+temporal+father+creator

  setPhase('ready')  // ← all ready
```

---

## 13. Per-Turn Embedding Computation

**File:** `src/main/engine/prepareTurnContext.ts` (131 lines)

### 13.1 Computation entry point

After each user message arrives, `orchestrator.ts` first calls `prepareTurnContext()`:

```typescript
async function prepareTurnContext({ msg, state, factStore, retriever, ... }):
  // 1. get embedding provider (cached or initialize)
  embeddingProvider = getCachedEmbeddingProvider(dataRoot)
  if !embeddingProvider?.ready() && index:
    ensureFactEmbeddingsReady(entry)
    embeddingProvider = getCachedEmbeddingProvider(dataRoot)

  // 2. compute queryEmbed + conversationEmbed + temporal signal (parallel)
  if embeddingProvider?.ready():
    recentMsgs = recentUserMessages.slice(-3)  // last 3 turns
    [queryEmbed, convEmb] = await Promise.all([
      embeddingProvider.embed(msg),                     // user message → vector
      computeConversationEmbed(recentMsgs, provider),   // conversation context → vector
    ])

    temporalEmbeddings = await getCachedTemporalEmbeddings(provider)
    temporalSignal = detectTemporalSignal(queryEmbed, temporalEmbeddings)
    if temporalSignal?.label:
      temporalLabelEmbed = temporalEmbeddings.get(temporalSignal.label)

  // 3. pass to retriever (L4 multi-route recall)
  retrieval = await retriever.retrieve(
    msg, queryEmbed, temporalSignal, temporalLabelEmbed, ...
  )

  return { queryEmbed, conversationEmbed, temporalSignal, retrieval }
```

### 13.2 One complete embedding chain

```
Per user message:
  1× embed(msg)                            → queryEmbed (L0/L4/routing/mirror/father reference)
  1× computeConversationEmbed(recentMsgs)  → conversationEmbed (active recall)
  37× cosineSimilarity (temporal signal detection) → temporalSemanticSignal (temporal retrieval)

At startup (one-time):
  74× embed (general anchor words)         → 7 semantic centers
  20× embed (adult anchor words)           → 3 adult semantic centers (optional)
  9× embed (profile anchor words)          → 3 dimensions × 3 profile tiers
  8× embed (create-tool anchor words)      → tool intent detection
  37× embed (temporal anchor sentences)    → temporal semantic cache
  5× embed (diary meaningful center)       → diary material center
  several embed (father-reference anchors) → creator memory resolution
  several embed (creator memory entries)   → creator semantic matching
  N_ACTIVE_FACTS× embed (all facts)        → dense vector cache (potentially hundreds, async)
```

---

## 14. Neural System × Integration Points with Other Systems

### 14.1 Brain System (L0 interpreter)

```
interpreter.ts → interpretInputWithEmbedding():
  rule misses casual_chat → classifyBySemantics(queryEmbed, anchors)
  → override EventType (e.g. vulnerable → VULNERABLE)
  negation detection → invert category (e.g. praise + "不" → hurtful)
```

### 14.2 Brain System (L4 retriever)

```
retriever.ts → retrieve():
  route 4: vectorStore.searchAsync(query, topK, queryEmbed)
  route 6: temporalSemanticHits (temporalLabelEmbed search)
  route 9: associationIndex association spread (same domain + embedding cosine > 0.3 to connect)
  ranking: scoreRelevance calls queryEmbed for emotion alignment
```

### 14.3 Brain System (association cold start)

```
associationColdStart.ts:
  batchSeedAssociationsFromEmbeddings():
    embedding cosine >= 0.65 → create association edge
    prioritize linking "orphan" facts (association count = 0)
    max 3 associations per fact

  seedAssociationsForNewFacts():
    new fact vs library facts: cosine >= 0.7 (or 0.55 relaxed)
    fallback to textOverlapScore() (2-gram character overlap) when unavailable
```

### 14.4 Brain System (refresh after memory write)

```
finalizeNewFacts.ts → refreshFactEmbeddingsForIds():
  after new facts are stored:
  ① embedBatch(new fact text) → factEmbeddingCache.set(id, vec)
  ② vs.loadDenseCacheFromMap() rebuild dense cache
  ③ upsertFactEmbeddings() write to SQLite
```

### 14.5 Heart System (mirror contradiction detection)

```
mirror.ts → detectContradictions():
  extract assertions from old/new text → exact topic match first
  no match → embed old/new topic words → cosine > 0.70 + valence gap >= 0.6 → mark contradiction
```

### 14.6 Heart System (emotion alignment)

```
retriever.ts → scoreRelevance():
  if queryEmbed available:
    score *= computeEmotionAlignmentBoost(queryEmbed, factEmbed)
    // facts semantically consistent with user message rank higher, up to +30%
```

### 14.7 Extension System (route matching)

```
dispatchRouter.ts:
  if embedding route table ready:
    matchAgainstRouteTable(queryEmbed, routeIndex)
    medium-confidence result + rules pass → auto_invoke extension
```

### 14.8 Canon (creator memory)

```
orchestrator.ts (Pre-LLM):
  father-reference resolution: resolveFatherReference(queryEmbed, fatherAnchors)
    → determine whether "他" refers to the creator or the user's real father
  creator entry matching: queryEmbed vs cachedCreatorEntryEmbeddings
    → select semantically relevant creator memories to inject
```

---

## 15. Graceful Degradation

This is the Neural System's most important design principle: **when embedding is unavailable, the app does not crash and chat is not interrupted**.

```
ONNX Runtime unavailable / model files missing / load failure
    │
    ├── provider = NoopEmbeddingProvider
    ├── embeddingReadiness = 'degraded'
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  L0 interpreter (interpreter.ts)                           │
│    rule hit → works normally                               │
│    rule miss → skip semanticFallback → keep casual_chat    │
│    accuracy drops, but most user messages still classified   │
│    correctly by keyword rules                              │
├─────────────────────────────────────────────────────────────┤
│  L4 retrieval (retriever.ts)                               │
│    route 4 embedding search → skipped                      │
│    route 6 temporal semantic → skipped                     │
│    route 9 association spread → co-occurrence only           │
│    (not embedding cosine gating)                           │
│    trigger words + FTS + Jaccard + TF-IDF + temporal       │
│    anchors × 5 routes still work                           │
│    core memory recall unaffected                           │
├─────────────────────────────────────────────────────────────┤
│  Extension routing (routeTable.ts)                         │
│    embedding route matching → skipped                      │
│    keyword-rule dispatch can still trigger                  │
├─────────────────────────────────────────────────────────────┤
│  Association cold start (associationColdStart.ts)          │
│    embedding similarity → textOverlapScore() 2-gram fallback│
├─────────────────────────────────────────────────────────────┤
│  VectorStore                                               │
│    dense cache unavailable → TF-IDF sparse vector search   │
│    less accurate than embedding, still effective for       │
│    high-frequency words/keywords                           │
├─────────────────────────────────────────────────────────────┤
│  UI shows "Embedding: degraded"                            │
│  user can try rebuilding index / checking model files      │
│  chat works fully                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 16. Parameter Center

All embedding-related parameters are centralized in `ackemParams.ts`:

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `EMBEDDING_SEARCH_ENABLED` | true | Enable embedding vector search |
| `EMBEDDING_SEARCH_TOP_K` | 20 | Vector search top K |
| `EMBEDDING_MIN_SCORE` | 0.5 | Minimum cosine similarity threshold (vector search) |
| `VECTOR_SEARCH_ENABLED` | true | TF-IDF vector search toggle |
| `VECTOR_SEARCH_TOP_K` | 15 | TF-IDF search top K |
| `VECTOR_SEARCH_MIN_SCORE` | 0.05 | TF-IDF minimum similarity threshold |
| `SEMANTIC_SEARCH_ENABLED` | true | Jaccard semantic search toggle |
| `SEMANTIC_SEARCH_TOP_K` | 15 | Jaccard search top K |
| `SEMANTIC_SEARCH_MIN_SIMILARITY` | 0.12 | Jaccard minimum similarity |
| `HIGH_CONFIDENCE_THRESHOLD` | 0.70 | Semantic fallback high-confidence threshold |
| `MID_CONFIDENCE_THRESHOLD` | 0.45 | Semantic fallback medium-confidence threshold |
| `TRIGGER_MATCH_BOOST` | 2.0 | Trigger-word match ranking boost |
| `FACT_DEDUP_THRESHOLD` | 0.42 | Character-level Jaccard dedup threshold |
| `EMBEDDING_DEDUP_THRESHOLD` | 0.85 | Embedding dedup threshold (preferred over Jaccard) |
| `EMOTION_ALIGNMENT_MAX_BOOST` | 0.3 | Maximum emotion alignment boost |
| `TEMPORAL_SIGNAL_THRESHOLD` | 0.6 | Temporal signal detection threshold |
| `TEMPORAL_SIGNAL_EMBEDDING_THRESHOLD` | 0.51 | Temporal semantic embedding threshold (=0.6×0.85) |

---

## 17. Modification Guide

| If you want to… | Start here |
|-----------------|------------|
| Change/add embedding model | `memory/embedding/types.ts` MODEL_MANIFESTS + `modelManager.ts` |
| Change semantic fallback classification | anchor words in `anchorVectors.ts` + `semanticFallback.ts` |
| Change route matching | `routeTable.ts` BUILTIN_ROUTE_TABLE + matchAgainstRouteTable |
| Change emotion alignment algorithm | `scoring.ts` computeEmotionAlignmentBoost |
| Change temporal signal detection | `temporalSignalExtractor.ts` TEMPORAL_ANCHOR_SENTENCES |
| Change startup warmup order | `preLlmWarmup.ts` + `engineCache.ts` warmupEmbeddingAtStartup |
| Change degradation behavior | three-priority chain in `provider.ts` + non-embedding branches in `retriever.ts` |
| Change provider priority | `memory/embedding/provider.ts` createEmbeddingProvider |
| Add new provider type | implement EmbeddingProvider interface + register in provider.ts |
| Change fact embedding persistence | `db/repos/factEmbeddingsRepo.ts` |
| Change per-turn embedding computation | `prepareTurnContext.ts` |
| Change vector search dual-cache strategy | `vectorStore.ts` searchAsync + buildDenseCache |

**Model switch note:** switching models requires rebuilding all fact embeddings (scheduleEmbeddingRebuild); otherwise dimension mismatch makes all cosine similarities wrong.

---

## 18. Related Documentation

| Document | Content |
|----------|---------|
| [01-brain-system.md](./01-brain-system.md) | How L0/L4 consume embedding |
| [02-heart-system.md](./02-heart-system.md) | Emotion alignment and mirroring |
| [03-mouth-system.md](./03-mouth-system.md) | Consumes retrieval results (does not use embedding directly) |
| [05-extension-system.md](./05-extension-system.md) | Dispatch route matching |
| [00-overall-system.md](./00-overall-system.md) | Full conversation pipeline |
| [ai-context-and-retrieval-policy.md](../../ai-context-and-retrieval-policy.md) | Memory injection policy |

*Neural System · Ackem v1.0.0 · 2026-06*
