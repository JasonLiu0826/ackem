# 脑系统

> **语言：** 中文 · [English](./01-brain-system.md)

> **层级**：L0 事件解释 · L0.5 意图路由 · **L4 记忆检索**  
> **代号**：Brain Engine  
> **核心问题**：用户说了什么？该召回哪些记忆？  
> **约束**：L0 是纯规则路径，**零 LLM 调用**，毫秒级完成

---

## 1. 定位

脑系统 **不产生最终回复**。它把用户输入转化为结构化数据（Event + 记忆块），供 **心系统**（情绪/关系调制）和 **嘴系统**（prompt 注入）消费。

```
用户消息
    │
    ▼
┌─────────────────────────────────────────────┐
│  L0  interpreter.ts      → Event type       │
│     规则关键词 → 事件分类（零 LLM）           │
│     含：中文/英文双语言关键词                  │
│     含：embedding 语义兜底路径               │
│                                             │
│  L0.5 意图路由 (orchestrator 内联)          │
│     DND 检测 · 记忆操作检测 · 篇幅检测       │
│     工作意图检测（搜索/文件/命令）            │
│                                             │
│  L4  retriever.ts        → tierBBlock       │
│     多路召回：触发词/FTS/语义/向量/关联/时间  │
│     去重 + 排序 + 预算裁剪                   │
└─────────────────────────────────────────────┘
    │
    ├──► 心系统 (Event → 关系/情绪)
    ├──► 扩展系统 (Dispatch / 工具意图)
    └──► 嘴系统 (Tier B 记忆注入块)
```

---

## 2. L0 解释器 — 设计原理

**文件**：`src/main/engine/interpreter.ts`  
**原则**：纯规则，零 LLM，毫秒级。

### 分类算法

L0 使用 **关键词匹配 + 优先级覆盖** 的事件分类策略：

```
输入: 用户文本 (string), effectiveTrust (0–100)
输出: Event { type: EventType, valence?: number, ... }

算法:
1. 语言检测 → 载入对应关键词表 (zh/en)
2. 优先级 0 — REDLINE 检测（安全红线）
   if any(redline_keywords): → EventType.EXTREME_REDLINE
3. 优先级 1 — DND 检测
   if any(dnd_explicit): → EventType.DND_REQUEST
4. 优先级 2 — 性骚扰 + 伦理违规检测
   if any(sexual_harassment): → EventType.SEXUAL_HARASSMENT
   if any(ethical_violation): → EventType.ETHICAL_VIOLATION
5. 优先级 3 — 常规情绪分类
   vulnerable → VULNERABLE_TO_PRAISE_OVERRIDE? → PRAISE
   hurtful → HURTFUL（信任低时） | TEASE（信任高时）
   praise → PRAISE
   apology → APOLOGY
   tease → TEASE
   cold → COLD
   question → QUESTION
   casual → CASUAL_CHAT
6. 优先级 4 — Embedding 语义兜底
   if (embedding available && 规则无高置信匹配):
     interpretInputWithEmbedding() → embedding 分类
```

### 关键设计：为什么零 LLM？

L0 每天在每轮对话中都被调用。如果用 LLM 做分类：
- 每轮对话会增加一次不必要的 LLM 调用（延迟 + 成本）
- 分类任务对 LLM 而言过于简单（杀鸡用牛刀）
- 关键词规则在 Ackem 的上下文中足够精确（用户对伴侣说的话有其模式）

Embedding 兜底路径仅在规则路径输出低置信度时才启用。

### 事件类型一览

```
常用:
  casual_chat    日常闲聊
  question       提问/询问
  praise         赞美/感谢
  hurtful        伤害性言语
  vulnerable     脆弱/倾诉
  apology        道歉
  tease          调侃/打情骂俏
  cold           冷淡/敷衍

关系敏感:
  DND_REQUEST    勿扰模式
  MEMORY_INTENT  显式记忆操作（"还记得…"）

安全红线:
  EXTREME_REDLINE  自杀/自残等（触发安全冻结）
  SEXUAL_HARASSMENT  性骚扰（拒绝/冷却）
  ETHICAL_VIOLATION  伦理违规（硬拒绝）
```


---

## 3. L0.5 意图路由（orchestrator 内联）

这一层没有独立模块，在 `orchestrator.ts` 的 Pre-LLM 中以内联检测实现：

| 检测 | 函数 | 触发 |
|------|------|------|
| DND | `detectDndIntent()` | 用户明确要求安静 |
| 记忆操作 | `detectMemoryIntent()` | "还记得……吗" 等 |
| 篇幅 | `detectUserVerbosity()` | 用户消息长度阈值 |
| 工作意图 | `detectKnowledgeWorkIntent()` | 搜索/文件/代码意图 |
| 时钟 | `userAsksLocalClock()` | 时间/日期询问 |

这些检测在 L0 之后、L1 更新之前执行，可以改变后续流程（如 DND 跳过主动消息）。

---

## 4. L4 记忆系统 — MnemoStack 架构

**目录**：`src/main/memory/`  
**核心文件**：约 20 个模块，约 5000 行

### 4.1 整体架构

```
                   MemoryIngestPipeline
                   (写入: 对话后异步执行)
                         │
            ┌────────────┴────────────┐
            │                         │
       FactExtractor           EpisodeExtractor
       (LLM 事实抽取)           (LLM 情节抽取)
            │                         │
            └────────────┬────────────┘
                         │
              Consolidator (合并去重)
                         │
              ┌──────────┴──────────┐
              │                     │
         FactStore             EpisodicStore
         (facts.v2.json)       (episodes)
              │                     │
              ├── VectorStore (向量索引)
              ├── KnowledgeGraph (关联图)
              └── AssociationIndex (共现)
                         ▲
                         │
                   MemoryRetriever
                   (读取: 每轮对话 Pre-LLM)
```

### 4.2 FactStore — 事实存储

**文件**：`src/main/memory/factStore.ts`

MemoryFact 结构：

```typescript
interface MemoryFact {
  id: string
  tier: 'core' | 'archival'        // 核心 / 归档
  domain: string                    // 如 "user_personal", "relationship"
  subcategory: string               // 如 "hobby", "family"
  subject: string                   // 主题
  summary: string                   // 事实内容
  confidence: number                // 0–1
  weight: number                    // 重要性权重
  selfRelevance: number             // 对 Ackem 自身的影响度
  triggers: string[]                // 触发词，用于快速检索
  privacyLevel: 'normal' | 'intimate' | 'explicit'
  emotionalContext?: { valence: number; aff: number }
  createdAt: string
  lastAccessAt: string
  accessCount: number
  metadata?: Record<string, unknown>
}
```

**事实分类法**（`taxonomy.ts`）— 6 大领域 × 25 子类：

| 领域 | 中文 | 子类 |
|------|------|------|
| `IDENTITY` | 自我与身份 | `BASIC_PROFILE` 基本信息 · `LIFE_STORY` 人生经历 · `VALUES_BELIEFS` 价值观与信念 · `SELF_PERCEPTION` 自我认知 |
| `SOCIAL` | 关系与社交 | `OUR_BOND` 我们的羁绊 · `FAMILY` 家庭 · `FRIENDS` 朋友 · `PARTNER` 伴侣 |
| `DAILY_LIFE` | 日常生活 | `ROUTINES` 日常习惯 · `HEALTH` 身心健康 · `LIVING_SPACE` 居住环境 · `LIFESTYLE` 生活方式 |
| `PURSUITS` | 事业与成长 | `CAREER` 事业与工作 · `LEARNING` 学习与技能 · `GOALS` 目标与梦想 · `PROJECTS` 项目与创作 · `PROCEDURES` 做事方式 |
| `INNER_WORLD` | 内心世界 | `MOOD` 情绪状态 · `TASTES` 喜好与品味 · `VULNERABILITIES` 脆弱与秘密 · `INSIDE_JOKES` 默契与暗号 |
| `TEMPORAL` | 当下与未来 | `NOW` 当下状态 · `COMMITMENTS` 承诺与约定 · `PLANS` 近期计划 · `WORLD` 外部世界 |

每个子类有独立的元数据配置（`CATEGORY_META`）：默认权重、置信度、衰减速率 λ、自身相关性，部分子类（`NOW`、`PLANS`、`WORLD`）设自动退役天数。

**关键操作**：

| 操作 | 方法 | 说明 |
|------|------|------|
| 写入 | `upsertFact()` | 插入或更新，自动去重 |
| 触发词检索 | `searchByTriggers()` | 用户消息含触发词时快速命中 |
| 全文本检索 | `searchByFts()` | SQLite FTS5 扩展 |
| 注入选择 | `selectForInjection()` | 按 confidence + weight 排序，预算裁剪 |
| 退役 | `retire()` | 低 confidence、低 accessCount 自动退役 |
| 合并 | `consolidate()` | 同 domain+subject 的高相似度事实合并 |

### 4.3 MemoryRetriever — 多路扩散检索引擎

**文件**：`src/main/memory/retriever.ts`（~500 行）

这是记忆系统的核心算法。每轮对话执行一次，从 **9 条路径**扩散召回记忆，经去重、排序、预算裁剪后组装为 Tier B 注入块。

#### 4.3.1 九路扩散召回

```
retrieve(query, hint, budget, valence, aff, temporalCtx, queryEmbed, ...)
    │
    ├── ① Trigger 触发词匹配 ───────────────── fast path
    │     factStore.searchByTriggers(query)
    │     子字符串包含匹配（触发词数组中的任意词出现在用户消息中）
    │
    ├── ② 注入预选 ──────────────────────────── background
    │     factStore.selectForInjection(budget, minConfidence=0.55)
    │     按 scoreRelevance 排序的贪心选择（与查询无关的背景事实）
    │
    ├── ③ FTS5 全文本搜索 ──────────────────── keyword
    │     factStore.searchByFts(query, topK=5)
    │     SQLite FTS5 引擎，关键词级别
    │
    ├── ④ Jaccard 语义搜索 ──────────────────── shallow semantic
    │     searchBySemantics(facts, query, topK=5)
    │     字符 Jaccard + 关键词 Jaccard ∘ 1.2 混合
    │     阈值 0.12
    │
    ├── ⑤ Embedding 向量搜索 ────────────────── deep semantic
    │     vectorStore.searchAsync(query, topK=6, queryEmbed)
    │     稠密向量 cosine 搜索（ONNX Runtime）
    │     ≥ EMBEDDING_MIN_SCORE(0.35)
    │
    ├── ⑥ TF-IDF 向量搜索（兜底）─────────────── fallback
    │     vectorStore.search(query, topK=6)
    │     CJK 2-gram + 单词分词，余弦 ≥ 0.05
    │     仅当 embedding 不可用且非短路时执行
    │
    ├── ⑦ 时间语义检索 ──────────────────────── temporal signal
    │     当 msgTemporalSemanticSignal 非空时
    │     用语义标签做 FTS + Jaccard + embedding（阈值降为 0.3）
    │     产出【时间回忆线索】提示头
    │
    ├── ⑧ 时间锚点扩散 ──────────────────────── temporal anchor
    │     策略 A：recurring 锚点 ±7 天窗口，30 天未触发，top 3
    │     策略 B：recurring ±30 天 + fuzzy 过去 90 天
    │     解析 linked_fact_ids JSON → temporalAnchorHits
    │
    └── ⑨ 关联网络扩散 ──────────────────────── graph diffusion
          从种子事实出发，沿关联边一跳扩散
          associationIndex.getAssociations(seedId, minStrength=0.3)
          产生 associationHits（新发现的关联事实）
```

**短路优化**：当触发词 + FTS 返回 ≥5 个不同事实且至少一个 `confidence > 0.7` 时，跳过 TF-IDF 向量搜索。Embedding 搜索和关联扩散**不被跳过**。

#### 4.3.2 合并去重

所有路径的事实汇集到 `factsForEcho[]`，用 `mergedIds` Set 保证同一事实只出现一次。注入优先级顺序：

```
触发词命中 → 注入预选 → FTS → Embedding → Jaccard语义 → TF-IDF
→ 时间语义 → 时间锚点 → 关联扩散
```

关联扩散去重与 `mergedIds` 联动——已通过直接路径找到的事实不会被关联边重复加入。

#### 4.3.3 最终排序公式

每条事实的最终排名分由四个因子**乘积累积**：

```
finalScore = temporalBoost × recencyBoost × emotionBoost × pathBoost × scoreRelevance
```

| 因子 | 条件 | 乘数 |
|------|------|------|
| **temporalBoost** | 六维时间加权（昼夜/星期/季节/深夜/重逢/距离） | 0.9 ~ 4.5 |
| **recencyBoost** | hint.favorRecent=true 且 3 天内更新 | 1.5 |
| **emotionBoost** | 情绪波动 >0.4 且子类为 OUR_BOND/MOOD/VULNERABILITIES/SELF_PERCEPTION | 1 + vol×0.5 (max 1.5) |
| **pathBoost** | 被任意检索路径命中 | **TRIGGER_MATCH_BOOST = 2.0** |
| **scoreRelevance** | 基础相关性评分（见下方） | weight×e^(-λ×days)×selfRelevance×(1+intensity×0.5) |

**scoreRelevance 的额外增强**：

```
情绪一致: |fact.valence - currentValence| < 0.3  → ×1.5 (正常) / ×1.2 (|aff|≥50)
近因提升: 最近 4 小时内更新 → ×1.8
嵌入对齐: queryEmbed + factEmbeddingCache 可用 → ×(1 + cosine×0.3)
```

#### 4.3.4 预算裁剪与 Tier B 组装

全局预算 `TIER_B_CHAR_BUDGET = 8000` 字符，按优先级填充各块：

```
budget = min(adjustedBudget, 8000)

① 时间语义提示头（若存在）         → 一次性字符串
② 核心记忆（core 事实）            → min(2000, budget×40%)
③ 注入事实行（排序后的事实列表）    → 填满预算，留 ≥200 给后续
④ Chunk 片段                       → CHUNK_SEARCH_MAX_RESULTS = 8
⑤ 知识图谱上下文                    → KG_CHAR_BUDGET = 800（剩余 >150 时）
⑥ 情节记忆                         → EPISODE_CHAR_BUDGET = 1200（剩余 >150 时）
```

**来源标注**：注入的每行事实尾部追加来源标记：

```
· subject：summary                 ← 触发词/嵌入/FTS/语义/预选
· subject：summary  ↳ 关联扩散     ← 关联图一跳发现
· subject：summary  ↳ 时间语义     ← 时间信号匹配
· subject：summary  ↳ 时间锚点     ← 时间锚点表解析
```

#### 4.3.5 共现跟踪（co-occurrence）

排名完成后，每 3 轮执行一次共现更新（防过快增长）：

1. 取按 `scoreRelevance` 排序的前 8 条事实
2. 两两配对 `(fa, fb)`：
   - 必须在同一 `domain`
   - 若有 embedding，cosine 需 > 0.3
3. 通过则调用 `associationIndex.strengthenOrCreate(fa.id, fb.id, type)`
   - 同 subcategory → `'event_chain'`
   - 跨 subcategory → `'thematic'`

#### 4.3.6 跟踪输出

`RetrievalResult.trace` 包含关键指标：

| 字段 | 含义 |
|------|------|
| `factsUsed` | 去重后注入的事实数 |
| `embeddingHits` | Embedding 搜索命中数 |
| `associationHits` | 关联扩散新发现的事实数 |
| `associationActivations` | 本次遍历的关联边总数 |
| `temporalAnchorHits` | 时间锚点解析的事实数 |
| `memoirTrust` | OUR_BOND 事实的加权平均信任度（下限 25） |
| `episodesUsed` | 检索到的情节记忆数 |

### 4.4 Ingestion Pipeline — 记忆写入

**文件**：`src/main/memory/ingest.ts`

对话完成后异步执行，分三阶段：

```
Phase 1 — 轻量同步（毫秒级）
  ├── captureEmotionalContext()    情绪上下文捕获
  ├── 简单规则事实抽取              无需 LLM 的事实
  ├── writeTemporalAnchor()        时间锚点
  ├── autoMirrorCheck()            自动镜像检查
  └── contradictionCheck()         矛盾检测

Phase 2 — LLM 异步提取（秒级）
  ├── FactExtractor.extract()      用 LLM 抽取结构化事实
  │     输入: 本轮对话 (user + assistant)
  │     输出: { domain, subcategory, subject, summary }[]
  ├── EpisodeExtractor.extract()   情节抽取
  │     输入: 最近多轮对话
  │     输出: 情节叙事块
  └── TripleExtractor.extract()    知识图谱三元组

Phase 3 — 持久化
  ├── consolidator.consolidate()   合并去重 + 权重更新
  ├── factStore 写入               落盘 facts.v2.json + SQLite
  ├── episodicStore 写入           情节存储
  ├── knowledgeGraph 写入          图关联
  ├── associationColdStart         新事实关联种植
  └── factEmbeddingCache 更新      向量缓存
```

### 4.5 知识图谱与关联系统

**文件**：`knowledgeGraph.ts`、`associationColdStart.ts`、`associationIndex.ts`

Ackem 的事实之间通过 **关联边** 连接，形成轻量知识图谱：

| 关联类型 | 触发条件 | 用途 |
|----------|----------|------|
| 共现 | 同一轮对话中同时出现 | 相关事实联合召回 |
| 同 domain | 共享 domain + subcategory | 同类事实扩展 |
| Embedding 相似 | cosine > 阈值 | 语义近似的自动关联 |
| 时间锚点 | 共享 temporal anchor | 同一特殊日期的记忆 |
| 显式 | LLM 抽取的三元组 | "用户喜欢猫" → "用户养了一只橘猫" |

**冷启动策略**：新事实写入时，`seedAssociationsForNewFacts()` 计算与现有事实的 embedding 相似度，自动建立初始关联边。

---

## 5. 遗忘与衰减

Ackem 的记忆不是永久不变的。为了让记忆系统更接近人类的遗忘曲线，Ackem 实现了多层级的衰减、退役、整合与矛盾解决机制。

### 5.1 指数衰减模型

每一条 MemoryFact 在参与相关性评分、核心席位竞争、记忆回响时，都会经历指数衰减：

```
score = weight × e^(-λ × days) × selfRelevance × ...
```

其中 `λ`（decayLambda）取决于事实的子类别和层级：

| 层级 | λ 来源 | 半衰期 |
|------|--------|--------|
| 原始事实（`factLayer: 'raw'`） | 子类别专属 decayLambda（见下方表格） | 7 天 ~ 693 天 |
| 整合洞察（`factLayer: 'consolidated'`） | `CONSOLIDATED_DECAY_LAMBDA = 0.003` | ≈630 天 |

**25 个子类别的衰减参数**：

| 子类别 | 领域 | decayLambda | 半衰期 | autoRetireDays |
|--------|------|-------------|--------|----------------|
| BASIC_PROFILE / LIFE_STORY | IDENTITY | 0.001 | 693天 | — |
| OUR_BOND | SOCIAL | 0.001 | 693天 | — |
| FAMILY | SOCIAL | 0.002 | 347天 | — |
| PROCEDURES | PURSUITS | 0.002 | 347天 | — |
| HEALTH | DAILY_LIFE | 0.002 | 347天 | — |
| VALUES_BELIEFS / PARTNER / VULNERABILITIES | — | 0.003 | 231天 | — |
| SELF_PERCEPTION / FRIENDS / CAREER / GOALS / TASTES / INSIDE_JOKES | — | 0.005 | 139天 | — |
| LEARNING / PROJECTS | PURSUITS | 0.008 | 87天 | — |
| ROUTINES | DAILY_LIFE | 0.008 | 87天 | — |
| LIVING_SPACE / LIFESTYLE | DAILY_LIFE | 0.01 | 69天 | — |
| PLANS | TEMPORAL | 0.02 | 35天 | 7 |
| MOOD | INNER_WORLD | 0.05 | 14天 | — |
| NOW / WORLD | TEMPORAL | 0.1 | 7天 | 3 / 7 |
| COMMITMENTS | TEMPORAL | **0** | 永不衰减 | — |

设计原则：**越「当下」的事实衰减越快**（NOW 7 天半衰期），**越「身份核心」的事实衰减越慢**（BASIC_PROFILE 693 天半衰期）。COMMITMENTS 承诺永不衰减。

### 5.2 计算衰减评分

**`computeDecayedScore()`** 用于核心记忆席位竞争（`factStore.ts`）：

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

**`scoreRelevance()`** 用于提示注入排序时增加情绪一致性和近因调制：

```
score = weight × e^(-λ×days) × selfRelevance × (1 + intensity×0.5)
       × (情绪一致? 1.5/1.2 : 1)
       × (4小时内更新? 1.8 : 1)
       × (embedding对齐? 1 + cosine×0.3 : 1)
```

### 5.3 核心记忆席位竞争

Core 记忆硬上限 `CORE_MEMORY_MAX_COUNT = 12`。当核心事实超过 12 条时：

1. 每条核心事实计算 `computeDecayedScore()`（衰减后分数）
2. 得分最低的溢出的核心事实降级为 `archival` 层级
3. 新事实权重达到 `CORE_MEMORY_WEIGHT_THRESHOLD = 3.0` 时自动升级为核心

### 5.4 自动退役

**基于时间的退役**（`autoRetireExpired()`）：

每 `AUTO_RETIRE_CHECK_INTERVAL = 10` 轮，扫描 `NOW`、`PLANS`、`WORLD` 三个子类别的活跃事实，将超过 `autoRetireDays` 天数的事实标记为 `status: 'retired'`。目前仅这三个子类别参与自动退役。

**物理清理**（`compactFacts()`）：

每 50 轮，从数组中物理删除已退役的瞬时类事实（NOW/PLANS/WORLD），保留期 `AUTO_COMPACT_RETENTION_DAYS = 30` 天。其他子类别的退役事实**永久保留标记**，仅改变状态不物理删除。

### 5.5 去重加权与名字降权

**去重合并**：当新事实与已有事实的 Jaccard 相似度 > `0.42` 或 embedding cosine > `0.85` 时：

```typescript
existing.weight = Math.max(existing.weight, newWeight) + FACT_DEDUP_WEIGHT_BOOST  // +0.5
```

多次确认的同一记忆权重逐步累积，这正是「重复即重要」的实现。

**名字降权**：记录新名字/昵称时，同一 subject 的旧名字权重 -1（最低 0），反映「用户改了称呼」的场景。

### 5.6 LLM 整合（Consolidation）

**目标**：从多条原始事实中提取高层的、衰减更慢的洞察。

**触发条件**（`autoConsolidationPolicy.ts`）：

```
前提: 原始事实数 ≥ 6
条件（满足任一）:
  - 轮次 ≥ 60              → 强制整合
  - 轮次 ≥ 30              → 常规整合
  - 有意义事件密度 > 40%    → 早期触发
```

**流程**：
1. 取最近最多 30 条原始事实（按 updatedAt 降序）
2. LLM 识别跨事实的模式，产出最多 4 条整合洞察
3. 每条洞察以 `weight=4.0`、`confidence=0.7`、`factLayer='consolidated'` 写入
4. 使用 `CONSOLIDATED_DECAY_LAMBDA = 0.003`（衰减极慢）

```
原始（raw）         整合（consolidated）
  weight=2.5           weight=4.0
  λ=0.01               λ=0.003
  半衰期~69天          半衰期~630天
  未整合                 来自 3 条原始事实
```

### 5.7 矛盾检测与自我编辑

**采样**（`factContradictionSampler.ts`）：每 `MIRROR_CHECK_INTERVAL_TURNS = 20` 轮，按 updatedAt 降序扫描同 subcategory 的事实对，Jaccard 相似度 > 0.35 且权重 ≥ 1.5 的送入 LLM 判断。

**LLM 判决**（`contradictionDetector.ts`）：
- **reinforce 相互印证** → 合并，权重 +0.3
- **conflict + keep_new 保留新** → 退役旧事实
- **conflict + keep_old 保留旧** → 退役新事实
- **conflict + merge 合并** → 取较长摘要，保留较高权重
- **conflict + flag 标记** → 留给人审，不自动操作

### 5.8 主动遗忘

用户消息含遗忘触发词（"别提了"、"不想聊这个"、"翻篇了"、"忘了"、"换个话题"）时：

1. 从消息中提取主题关键词（过滤停用词和触发词）
2. 对主题做 embedding
3. 余弦相似度扫描所有活跃事实，threshold > 0.7
4. 匹配的事实设 `sensitivity: 'avoid'`，不再自动注入提示

### 5.9 记忆回响衰减

计算记忆对情绪的长期影响时：

```typescript
w = fact.emotionalContext.intensity × e^(-λ×days) × fact.selfRelevance × (fact.weight / 3)
```

回响值限制在 `[-MEMORY_ECHO_CAP, +MEMORY_ECHO_CAP] = [-2.0, +2.0]`。

### 5.10 参数汇总

| 参数 | 值 | 用途 |
|------|-----|------|
| `CONSOLIDATED_DECAY_LAMBDA` | 0.003 | 整合洞察衰减率 |
| `CORE_MEMORY_MAX_COUNT` | 12 | 核心记忆上限 |
| `CORE_MEMORY_WEIGHT_THRESHOLD` | 3.0 | 自动升级为核心 |
| `FACT_DEDUP_WEIGHT_BOOST` | 0.5 | 去重合并增益 |
| `AUTO_COMPACT_RETENTION_DAYS` | 30 | 退役后保留天数 |
| `AUTO_RETIRE_CHECK_INTERVAL` | 10 | 退役检查间隔（轮） |
| `RECENCY_BOOST_WINDOW_HOURS` | 4 | 近因窗口（小时） |
| `RECENCY_BOOST_FACTOR` | 1.8 | 近因提升乘数 |
| `CONTRADICTION_SIMILARITY_THRESHOLD` | 0.35 | 矛盾检测阈值 |
| `CONSOLIDATION_INSIGHT_WEIGHT` | 4.0 | 整合洞察权重 |
| `CONSOLIDATION_INTERVAL_TURNS` | 30 | 整合间隔（轮） |
| `MEMOIR_TRUST_FLOOR` | 25 | 记忆信任下限 |
| `EMBEDDING_DEDUP_THRESHOLD` | 0.85 | 嵌入去重阈值 |
| `MEMORY_ECHO_CAP` | 2.0 | 记忆回响上限 |

---

## 6. 记忆 Tier 体系

| Tier | 内容 | 注入策略 | 来源 |
|------|------|----------|------|
| **Tier A** | 伴侣当前状态（心情、自我认知） | 每轮注入 | `companion/self.md` |
| **Tier B** | 检索到的记忆事实 | 按相关性 + 预算 | `retriever.ts` |
| **Canon** | Ackem 人设（不可改写） | 每轮注入 | `canon/ackemCanon.ts` |

Tier B 受严格预算控制（`TIER_B_CHAR_BUDGET`），超出部分截断。这是「检索后注入」原则的技术保障。

---

## 7. 修改指南

| 你想… | 先看 |
|--------|------|
| 新增一种用户意图关键词 | `interpreter.ts` 规则表 |
| 改记忆召回策略（权重/阈值） | `retriever.ts` + `ackemParams.ts` |
| 改记忆写入逻辑 | `ingest.ts` + `factExtractor.ts` |
| 改关联扩散算法 | `associationColdStart.ts` + `associationIndex.ts` |
| 改导入格式 | `documentImport/` |
| 改写入 LLM 提取的 prompt | `prompt/memory-fact-extract.ts` |
| 改全文本搜索行为 | SQLite FTS5 schema (`db/repos/fts.ts`) |
| 改衰减速率（λ） | `taxonomy.ts` 的 `CATEGORY_META.decayLambda` |
| 改自动退役天数 | `taxonomy.ts` 的 `CATEGORY_META.autoRetireDays` |
| 改整合策略 | `autoConsolidationPolicy.ts` + `consolidator.ts` |
| 改矛盾检测阈值 | `factContradictionSampler.ts` + `ackemParams.ts` |
| 改核心记忆上限 | `ackemParams.ts` 的 `CORE_MEMORY_MAX_COUNT` |

**改参数优先改 `ackemParams.ts`**，不要在各模块内联魔法数字。

---

## 8. 相关文档

| 文档 | 内容 |
|------|------|
| [02-heart-system.md](./02-heart-system.md) | Event 如何驱动关系/情绪 |
| [04-neural-system.md](./04-neural-system.md) | L0/L4 如何消费 Embedding |
| [06-time-system.md](./06-time-system.md) | L4 检索时间调制、时间锚点检索 |
| [00-overall-system.md](./00-overall-system.md) | 全对话链路 |
| [ai-context-and-retrieval-policy.md](../../ai-context-and-retrieval-policy.md) | 记忆注入策略与隐私承诺 |

*脑系统 · Ackem v1.0.0 · 2026-06*
