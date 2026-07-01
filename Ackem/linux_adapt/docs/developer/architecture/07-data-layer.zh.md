# 数据层 · Data Layer

> **语言：** 中文 · [English](./07-data-layer.md)

> **层级**：持久化层  
> **代号**：Data Engine  
> **核心问题**：Ackem 的数据如何存储、组织与迁移？

---

## 1. 设计原则

Ackem 采用 **SQLite 为主 + JSON/Markdown 并存** 的混合持久化策略：

| 存储 | 存什么 | 理由 |
|------|--------|------|
| **SQLite** (`ackem.db`) | 结构化状态、记忆事实、索引、扩展注册 | 事务性写入、高效查询、FTS5 全文搜索 |
| **JSON 文件** (`facts.v2.json`) | 记忆事实快照（向后兼容层） | 人类可读、Git 可 diff、可直接备份 |
| **Markdown 文件** (`*.md`) | 日记、伴侣状态 | 用户可直接阅读编辑 |

```
                    ┌──────────────────┐
                    │   ackem.db        │ ← 主要存储
                    │   (SQLite + FTS5) │
                    └────────┬─────────┘
                             │ 读写
            ┌────────────────┼────────────────┐
            │                │                │
       ┌────┴────┐    ┌─────┴─────┐    ┌─────┴─────┐
       │ facts   │    │ diary/*.md │    │ companion │
       │ .v2.json│    │ Markdown   │    │ self.md   │
       └─────────┘    └───────────┘    └───────────┘
        向后兼容          并存镜像          并存镜像
```

---

## 2. 数据库连接管理

**文件**：`src/main/db/database.ts`

单例池模式，按 `dataRoot` 路径键控：

```
pools = Map<string, Database>
             │
     getDatabase(dataRoot)
         │
     ├── 检查 sqliteEnabled() → 若禁用返回 null
     ├── 检查 pools 缓存
     ├── 创建目录 + new Database(path)
     ├── applyPragmas()
     │     ├── journal_mode = WAL
     │     ├── synchronous = NORMAL
     │     ├── foreign_keys = ON
     │     ├── busy_timeout = 5000
     │     └── cache_size = -8000 (8MB)
     ├── runMigrations(db) → 依次应用 schema V1..V10
     ├── 缓存到 pools
     └── importLegacy(dataRoot) → 一次性遗留数据导入
```

**生命周期函数**：

| 函数 | 用途 |
|------|------|
| `getDatabase(dataRoot)` | 惰性初始化连接 |
| `closeDatabase(dataRoot)` | 正常关闭 + WAL checkpoint |
| `closeAllDatabases()` | 全部关闭 |
| `withTransaction(dataRoot, fn)` | 事务包装器 |
| `clearStructuredData(dataRoot)` | 清空所有表（保留 schema_meta） |

SQLite 可通过环境变量禁用：`ACKEM_DISABLE_SQLITE=1`，此时回落 JSON 文件路径。

---

## 3. 完整 Schema（V10，共 18 表）

按迁移版本顺序列出：

### V1 – 基础表

#### `schema_meta`
```
key         TEXT PRIMARY KEY
value       TEXT NOT NULL
```
存储 `user_version` 迁移版本号。

#### `companion_state`
```
session_id     TEXT NOT NULL PRIMARY KEY
version        TEXT NOT NULL
state_json     TEXT NOT NULL
updated_at     TEXT NOT NULL
emergence_json TEXT              -- V7 追加
```
引擎完整状态（FullState）序列化。

#### `chat_history`
```
session_id  TEXT NOT NULL PRIMARY KEY
rows_json   TEXT NOT NULL
updated_at  TEXT NOT NULL
```
每会话最多 2000 条消息，写入时自动裁剪。

#### `memory_facts`
```
id                  TEXT PRIMARY KEY
domain              TEXT NOT NULL
subcategory         TEXT NOT NULL
subject             TEXT NOT NULL
summary             TEXT NOT NULL
weight              REAL NOT NULL
confidence          REAL NOT NULL
status              TEXT NOT NULL DEFAULT 'active'
emotional_context   TEXT NOT NULL    -- JSON { valence, intensity, ... }
self_relevance      REAL NOT NULL
triggers            TEXT NOT NULL    -- JSON string[]
triggers_text       TEXT NOT NULL DEFAULT ''
update_trail        TEXT NOT NULL    -- JSON
source_session_id   TEXT NOT NULL
source_turn_index   INTEGER NOT NULL
created_at          TEXT NOT NULL
updated_at          TEXT NOT NULL
derived_from        TEXT             -- JSON factId[]
fact_layer          TEXT DEFAULT 'raw'
tier                TEXT DEFAULT 'archival'
sensitivity         TEXT DEFAULT 'normal'      -- V4 追加
age_value           INTEGER                    -- V5 追加
age_birth_year      INTEGER                    -- V5 追加
age_birthday_mmdd   TEXT                       -- V5 追加
age_recorded_at     TEXT                       -- V5 追加
age_is_estimate     INTEGER DEFAULT 0          -- V5 追加
privacy_level       TEXT DEFAULT 'normal'      -- V10 追加
```
索引：`idx_facts_status`, `idx_facts_domain`, `idx_facts_session`, `idx_facts_sensitivity`, `idx_facts_privacy_level`

#### `episodes`
```
id                  TEXT PRIMARY KEY
summary             TEXT NOT NULL
emotional_intensity REAL NOT NULL
dominant_emotion    TEXT NOT NULL
keywords            TEXT NOT NULL
prev_episode_id     TEXT
source_session_id   TEXT NOT NULL
start_turn          INTEGER NOT NULL
end_turn            INTEGER NOT NULL
created_at          TEXT NOT NULL
```

#### `procedural_habits`
```
id    INTEGER PRIMARY KEY AUTOINCREMENT
ts    TEXT NOT NULL
text  TEXT NOT NULL
```

#### `kv_store`
```
namespace   TEXT NOT NULL
key         TEXT NOT NULL
value       TEXT NOT NULL
updated_at  TEXT NOT NULL
PRIMARY KEY (namespace, key)
```
通用键值存储，用于 registry 缓存、corpus hash 等。

### V2 – 知识、跟踪、日记、扩展、FTS

#### `knowledge_triples`
```
id              TEXT PRIMARY KEY
subject         TEXT NOT NULL
predicate       TEXT NOT NULL
object          TEXT NOT NULL
confidence      REAL NOT NULL
source_fact_ids TEXT NOT NULL    -- JSON factId[]
created_at      TEXT NOT NULL
```
知识图谱 SPO 三元组。

#### `turn_traces`
```
id          INTEGER PRIMARY KEY AUTOINCREMENT
date        TEXT NOT NULL
session_id  TEXT NOT NULL DEFAULT 'default'
turn_index  INTEGER NOT NULL DEFAULT 0
trace_json  TEXT NOT NULL
timestamp   TEXT NOT NULL
```
每轮决策 trace。

#### `diary`
```
date        TEXT PRIMARY KEY
content     TEXT NOT NULL
meta_json   TEXT
updated_at  TEXT NOT NULL
```

#### `openforu_workspaces` / `openforu_sessions` / `openforu_runs`
三个表存储 OpenForU 工作区、会话、运行记录。

#### `shared_events`
```
id          TEXT PRIMARY KEY
session_id  TEXT
event_json  TEXT NOT NULL
created_at  TEXT NOT NULL
```

#### `memory_facts_fts`（FTS5 虚拟表）
```
fact_id        UNINDEXED
subject
summary
triggers_text
```
分词器：`tokenize='unicode61'`

#### `episodes_fts`（FTS5 虚拟表）
```
episode_id       UNINDEXED
summary
keywords_text
dominant_emotion
```
分词器：`tokenize='unicode61'`

### V4 – 关联与时间锚点

#### `memory_associations`
```
id                TEXT PRIMARY KEY
fact_id_a         TEXT NOT NULL
fact_id_b         TEXT NOT NULL
association_type  TEXT NOT NULL    -- 'temporal'|'entity'|'event_chain'|'emotion_peak'|'self_reference'|'thematic'
strength          REAL NOT NULL
created_at        TEXT NOT NULL
last_activated_at TEXT
FOREIGN KEY (fact_id_a) REFERENCES memory_facts(id)
FOREIGN KEY (fact_id_b) REFERENCES memory_facts(id)
```
索引：`idx_assoc_a`, `idx_assoc_b`, `idx_assoc_strength`

#### `temporal_anchors`
```
id                  TEXT PRIMARY KEY
anchor_date         TEXT NOT NULL
anchor_type         TEXT NOT NULL    -- 'fuzzy'|'recurring'|'milestone'|'relationship'
recurrence_rule     TEXT
linked_fact_ids     TEXT NOT NULL    -- JSON factId[]
emotional_valence   REAL
emotional_intensity REAL
domain              TEXT
summary             TEXT
created_at          TEXT NOT NULL
last_triggered_at   TEXT
```

### V6 – 习惯与策略日志

#### `user_habits`
```
id                TEXT PRIMARY KEY
type              TEXT NOT NULL
scope             TEXT NOT NULL
weekday           INTEGER
hour_start        INTEGER NOT NULL
hour_end          INTEGER NOT NULL
confidence        REAL NOT NULL DEFAULT 0
occurrence_count  INTEGER NOT NULL DEFAULT 1
first_seen_at     INTEGER NOT NULL
last_confirmed_at INTEGER NOT NULL
expires_at        INTEGER
suppress_target   TEXT
note              TEXT NOT NULL
created_at        INTEGER NOT NULL
updated_at        INTEGER NOT NULL
```

#### `foreground_history` / `decision_log`
前台窗口历史与策略决策日志。

### V8 – 向量索引

#### `fact_embeddings`
```
fact_id     TEXT NOT NULL
model_sig   TEXT NOT NULL
dim         INTEGER NOT NULL
updated_at  TEXT NOT NULL
vector      BLOB NOT NULL          -- float32 LE 序列化
PRIMARY KEY (fact_id, model_sig)
```
每模型隔离，支持多模型切换。

### V9 – 微信桥接

#### `weixin_account` / `weixin_sync` / `weixin_context` / `weixin_seen`
微信通道的状态同步表。

---

## 4. Repository 模式

每个仓库是一个独立模块，导出自由函数，首参为 `dataRoot`（内部调用 `getDatabase`）。**无类、无基类**。

### 文件清单

| 仓库 | 路径 | 职责 |
|------|------|------|
| `memoryFacts` | `db/repos/memoryFacts.ts` | 事实 CRUD + 年龄元数据 |
| `episodes` | `db/repos/episodes.ts` | 情节 CRUD |
| `knowledgeTriples` | `db/repos/knowledgeTriples.ts` | 三元组 CRUD |
| `chatHistory` | `db/repos/chatHistory.ts` | 聊天历史读写（上限 2000 条） |
| `companionState` | `db/repos/companionState.ts` | 引擎状态读写 |
| `diary` | `db/repos/diary.ts` | 日记日期键控读写 |
| `kv` | `db/repos/kv.ts` | 通用键值存储 |
| `openforu` | `db/repos/openforu.ts` | 工作区/会话/运行 |
| `turnTraces` | `db/repos/turnTraces.ts` | Trace 追加与查询 |
| `proceduralHabits` | `db/repos/proceduralHabits.ts` | 程序性习惯 |
| `fts` | `db/repos/fts.ts` | FTS5 重建 + 增量索引 + 搜索 |
| `factEmbeddingsRepo` | `db/repos/factEmbeddingsRepo.ts` | 向量嵌入持久化 |

### 核心仓库接口

**memoryFacts.ts**：

| 方法 | 说明 |
|------|------|
| `loadFactsFromDb(dataRoot)` | 全量加载为 `MemoryFact[]` |
| `replaceFactsInDb(dataRoot, facts)` | 事务：清空 + 批量插入 + FTS 重建 |
| `insertFact(dataRoot, fact)` | 单行插入 + FTS 增量索引 |
| `updateFactInDb(dataRoot, fact)` | 按 ID 更新 + FTS 增量索引 |
| `deleteFactFromDb(dataRoot, id)` | 按 ID 删除 + FTS 增量索引 |

**fts.ts** — FTS5 搜索包装器：

```typescript
// 搜索策略：拆分查询为 tokens → 过滤 <2 字符 → 双引号转义 → OR 连接
// → MATCH 查询 → 出错降级 LIKE '%query%'
searchFactIdsFts(dataRoot, query, limit)  →  MemoryFact[]
searchEpisodeIdsFts(dataRoot, query, limit) →  Episode[]
```

**factEmbeddingsRepo.ts** — 向量持久化：

```typescript
computeCorpusHash(facts)       →  DJB2 哈希（检测事实变更）
loadFactEmbeddings(db, modelSig) →  Map<fact_id, number[]>
upsertFactEmbeddings(db, sig, entries) →  float32 LE BLOB 批量写入
deleteStaleFactEmbeddings(db, sig, activeIds) → 清理过期向量
```

---

## 5. 迁移策略

迁移在 `database.ts` 的 `runMigrations(db)` 中线性执行：

```
1. 始终创建 schema_meta 表 + 写入 user_version=1
2. 读取当前 user_version
3. 对每个版本 2..N：若 current < N，执行 SCHEMA_VN_SQL → user_version = N
```

**当前最新版本**：V10（2026-06-28）

| 版本 | 变更 |
|------|------|
| V1 | 基础表：companion_state, chat_history, memory_facts, episodes, procedural_habits, kv_store |
| V2 | knowledge_triples, turn_traces, diary, openforu_*, shared_events, FTS5 表 |
| V3 | 空 DDL（标记代码层增量写操作的起点） |
| V4 | memory_associations, temporal_anchors, memory_facts.sensitivity |
| V5 | memory_facts.age_* 列（生日/年龄元数据） |
| V6 | user_habits, foreground_history, decision_log |
| V7 | companion_state.emergence_json |
| V8 | fact_embeddings |
| V9 | weixin_* 表 |
| V10 | memory_facts.privacy_level |

无向下迁移。版本严格递增。

---

## 6. 数据目录结构

**文件**：`src/main/layout.ts` — `ensureDataLayout(dataRoot)`

```
{dataRoot}/
├── README.md                     # 数据目录说明
├── ackem.db                      # SQLite 数据库（运行时创建）
├── memory/
│   ├── facts/
│   │   └── facts.v2.json         # 事实 JSON 快照（向后兼容）
│   └── shared-events/
├── companion/
│   ├── self.md                   # 伴侣第一人称状态
│   ├── state.md                  # 伴侣状态快照
│   └── chat-history-*.json       # 历史聊天记录（遗留格式）
├── diary/
│   └── YYYY-MM-DD.md             # 日记 Markdown
├── imports/                      # 用户导入文件（PDF/Word/TXT 等）
├── openforu/
│   ├── sessions/
│   ├── staging/
│   ├── uskills/
│   ├── uplugins/
│   └── uplugin-data/
├── extensions/
│   ├── skills/_registry.json
│   └── plugins/_registry.json
├── traces/                       # trace JSONL（遗留格式）
├── weather/
├── portrait/
├── preferences/
├── packs/
├── _derived/                     # 可重建的派生索引（向量缓存等）
├── models/                       # Embedding 模型文件
└── logs/                         # 运行日志
```

---

## 7. 遗留数据导入

**文件**：`src/main/db/importLegacy.ts`

首次打开数据库时（每个 `dataRoot` 一次），从 JSON/MD 文件导入历史数据到 SQLite：

| 源文件 | 目标表 |
|--------|--------|
| `companion/chat-history-*.json` | `chat_history` |
| `memory/episodes/episodes.v1.json` | `episodes` + FTS 重建 |
| `memory/kg/kg.v1.json` | `knowledge_triples` |
| `traces/trace-*.jsonl` | `turn_traces` |
| `diary/YYYY-MM-DD.md` + `diary/meta.json` | `diary` |
| `openforu/workspaces.json` | `openforu_workspaces` |
| `extensions/skills/_registry.json` | `kv_store` |

导入幂等：若目标表 `count > 0` 则跳过。

---

## 8. 相关文档

| 文档 | 内容 |
|------|------|
| [00-overall-system.md](./00-overall-system.md) | 数据目录概览，存储设计决策 |
| [01-brain-system.md](./01-brain-system.md) | 事实存储（FactStore）与关联索引 |
| [06-time-system.md](./06-time-system.md) | temporal_anchors 表的写入与检索 |

*数据层 · Ackem v1.0.0 · 2026-06*
