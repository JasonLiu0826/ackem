# Data Layer

> **Language:** English · [中文](./07-data-layer.zh.md)

> **Layer:** Persistence  
> **Codename:** Data Engine  
> **Core question:** How is Ackem data stored, organized, and migrated?

---

## 1. Design Principles

Ackem uses a **SQLite-first + JSON/Markdown coexistence** hybrid persistence strategy:

| Storage | What it holds | Rationale |
|------|--------|------|
| **SQLite** (`ackem.db`) | Structured state, memory facts, indexes, extension registry | Transactional writes, efficient queries, FTS5 full-text search |
| **JSON files** (`facts.v2.json`) | Memory fact snapshots (backward-compatibility layer) | Human-readable, Git-diffable, directly backup-able |
| **Markdown files** (`*.md`) | Diary, companion state | User can read and edit directly |

```
                    ┌──────────────────┐
                    │   ackem.db        │ ← Primary storage
                    │   (SQLite + FTS5) │
                    └────────┬─────────┘
                             │ read/write
            ┌────────────────┼────────────────┐
            │                │                │
       ┌────┴────┐    ┌─────┴─────┐    ┌─────┴─────┐
       │ facts   │    │ diary/*.md │    │ companion │
       │ .v2.json│    │ Markdown   │    │ self.md   │
       └─────────┘    └───────────┘    └───────────┘
        backward compat   coexisting mirror   coexisting mirror
```

---

## 2. Database Connection Management

**File:** `src/main/db/database.ts`

Singleton pool pattern, keyed by `dataRoot` path:

```
pools = Map<string, Database>
             │
     getDatabase(dataRoot)
         │
     ├── check sqliteEnabled() → return null if disabled
     ├── check pools cache
     ├── create directory + new Database(path)
     ├── applyPragmas()
     │     ├── journal_mode = WAL
     │     ├── synchronous = NORMAL
     │     ├── foreign_keys = ON
     │     ├── busy_timeout = 5000
     │     └── cache_size = -8000 (8MB)
     ├── runMigrations(db) → apply schema V1..V10 in order
     ├── cache in pools
     └── importLegacy(dataRoot) → one-time legacy data import
```

**Lifecycle functions:**

| Function | Purpose |
|------|------|
| `getDatabase(dataRoot)` | Lazy connection initialization |
| `closeDatabase(dataRoot)` | Graceful shutdown + WAL checkpoint |
| `closeAllDatabases()` | Close all connections |
| `withTransaction(dataRoot, fn)` | Transaction wrapper |
| `clearStructuredData(dataRoot)` | Clear all tables (retain schema_meta) |

SQLite can be disabled via environment variable: `ACKEM_DISABLE_SQLITE=1`, in which case the system falls back to JSON file paths.

---

## 3. Complete Schema (V10, 18 tables)

Listed in migration version order:

### V1 – Base Tables

#### `schema_meta`
```
key         TEXT PRIMARY KEY
value       TEXT NOT NULL
```
Stores the `user_version` migration version number.

#### `companion_state`
```
session_id     TEXT NOT NULL PRIMARY KEY
version        TEXT NOT NULL
state_json     TEXT NOT NULL
updated_at     TEXT NOT NULL
emergence_json TEXT              -- added in V7
```
Serialized full engine state (FullState).

#### `chat_history`
```
session_id  TEXT NOT NULL PRIMARY KEY
rows_json   TEXT NOT NULL
updated_at  TEXT NOT NULL
```
Up to 2000 messages per session; automatically trimmed on write.

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
sensitivity         TEXT DEFAULT 'normal'      -- added in V4
age_value           INTEGER                    -- added in V5
age_birth_year      INTEGER                    -- added in V5
age_birthday_mmdd   TEXT                       -- added in V5
age_recorded_at     TEXT                       -- added in V5
age_is_estimate     INTEGER DEFAULT 0          -- added in V5
privacy_level       TEXT DEFAULT 'normal'      -- added in V10
```
Indexes: `idx_facts_status`, `idx_facts_domain`, `idx_facts_session`, `idx_facts_sensitivity`, `idx_facts_privacy_level`

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
Generic key-value store for registry cache, corpus hash, etc.

### V2 – Knowledge, Traces, Diary, Extensions, FTS

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
Knowledge graph SPO triples.

#### `turn_traces`
```
id          INTEGER PRIMARY KEY AUTOINCREMENT
date        TEXT NOT NULL
session_id  TEXT NOT NULL DEFAULT 'default'
turn_index  INTEGER NOT NULL DEFAULT 0
trace_json  TEXT NOT NULL
timestamp   TEXT NOT NULL
```
Per-turn decision traces.

#### `diary`
```
date        TEXT PRIMARY KEY
content     TEXT NOT NULL
meta_json   TEXT
updated_at  TEXT NOT NULL
```

#### `openforu_workspaces` / `openforu_sessions` / `openforu_runs`
Three tables storing OpenForU workspaces, sessions, and run records.

#### `shared_events`
```
id          TEXT PRIMARY KEY
session_id  TEXT
event_json  TEXT NOT NULL
created_at  TEXT NOT NULL
```

#### `memory_facts_fts` (FTS5 virtual table)
```
fact_id        UNINDEXED
subject
summary
triggers_text
```
Tokenizer: `tokenize='unicode61'`

#### `episodes_fts` (FTS5 virtual table)
```
episode_id       UNINDEXED
summary
keywords_text
dominant_emotion
```
Tokenizer: `tokenize='unicode61'`

### V4 – Associations and Temporal Anchors

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
Indexes: `idx_assoc_a`, `idx_assoc_b`, `idx_assoc_strength`

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

### V6 – Habits and Policy Logs

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
Foreground window history and policy decision logs.

### V8 – Vector Index

#### `fact_embeddings`
```
fact_id     TEXT NOT NULL
model_sig   TEXT NOT NULL
dim         INTEGER NOT NULL
updated_at  TEXT NOT NULL
vector      BLOB NOT NULL          -- float32 LE serialized
PRIMARY KEY (fact_id, model_sig)
```
Per-model isolation; supports switching between multiple models.

### V9 – WeChat Bridge

#### `weixin_account` / `weixin_sync` / `weixin_context` / `weixin_seen`
State synchronization tables for the WeChat channel.

---

## 4. Repository Pattern

Each repository is a standalone module exporting free functions; the first parameter is `dataRoot` (internally calls `getDatabase`). **No classes, no base class.**

### File Inventory

| Repository | Path | Responsibility |
|------|------|------|
| `memoryFacts` | `db/repos/memoryFacts.ts` | Fact CRUD + age metadata |
| `episodes` | `db/repos/episodes.ts` | Episode CRUD |
| `knowledgeTriples` | `db/repos/knowledgeTriples.ts` | Triple CRUD |
| `chatHistory` | `db/repos/chatHistory.ts` | Chat history read/write (2000-row cap) |
| `companionState` | `db/repos/companionState.ts` | Engine state read/write |
| `diary` | `db/repos/diary.ts` | Date-keyed diary read/write |
| `kv` | `db/repos/kv.ts` | Generic key-value store |
| `openforu` | `db/repos/openforu.ts` | Workspaces / sessions / runs |
| `turnTraces` | `db/repos/turnTraces.ts` | Trace append and query |
| `proceduralHabits` | `db/repos/proceduralHabits.ts` | Procedural habits |
| `fts` | `db/repos/fts.ts` | FTS5 rebuild + incremental indexing + search |
| `factEmbeddingsRepo` | `db/repos/factEmbeddingsRepo.ts` | Vector embedding persistence |

### Core Repository Interfaces

**memoryFacts.ts:**

| Method | Description |
|------|------|
| `loadFactsFromDb(dataRoot)` | Load all facts as `MemoryFact[]` |
| `replaceFactsInDb(dataRoot, facts)` | Transaction: clear + batch insert + FTS rebuild |
| `insertFact(dataRoot, fact)` | Single-row insert + FTS incremental index |
| `updateFactInDb(dataRoot, fact)` | Update by ID + FTS incremental index |
| `deleteFactFromDb(dataRoot, id)` | Delete by ID + FTS incremental index |

**fts.ts** — FTS5 search wrapper:

```typescript
// Search strategy: split query into tokens → filter <2 chars → escape double quotes → OR join
// → MATCH query → on error fall back to LIKE '%query%'
searchFactIdsFts(dataRoot, query, limit)  →  MemoryFact[]
searchEpisodeIdsFts(dataRoot, query, limit) →  Episode[]
```

**factEmbeddingsRepo.ts** — vector persistence:

```typescript
computeCorpusHash(facts)       →  DJB2 hash (detect fact changes)
loadFactEmbeddings(db, modelSig) →  Map<fact_id, number[]>
upsertFactEmbeddings(db, sig, entries) →  float32 LE BLOB batch write
deleteStaleFactEmbeddings(db, sig, activeIds) → clean up stale vectors
```

---

## 5. Migration Strategy

Migrations run linearly in `runMigrations(db)` within `database.ts`:

```
1. Always create schema_meta table + write user_version=1
2. Read current user_version
3. For each version 2..N: if current < N, execute SCHEMA_VN_SQL → user_version = N
```

**Current latest version:** V10 (2026-06-28)

| Version | Changes |
|------|------|
| V1 | Base tables: companion_state, chat_history, memory_facts, episodes, procedural_habits, kv_store |
| V2 | knowledge_triples, turn_traces, diary, openforu_*, shared_events, FTS5 tables |
| V3 | Empty DDL (marks the start of code-layer incremental writes) |
| V4 | memory_associations, temporal_anchors, memory_facts.sensitivity |
| V5 | memory_facts.age_* columns (birthday/age metadata) |
| V6 | user_habits, foreground_history, decision_log |
| V7 | companion_state.emergence_json |
| V8 | fact_embeddings |
| V9 | weixin_* tables |
| V10 | memory_facts.privacy_level |

No downward migrations. Versions strictly increment.

---

## 6. Data Directory Structure

**File:** `src/main/layout.ts` — `ensureDataLayout(dataRoot)`

```
{dataRoot}/
├── README.md                     # Data directory description
├── ackem.db                      # SQLite database (created at runtime)
├── memory/
│   ├── facts/
│   │   └── facts.v2.json         # Fact JSON snapshot (backward compatibility)
│   └── shared-events/
├── companion/
│   ├── self.md                   # Companion first-person state
│   ├── state.md                  # Companion state snapshot
│   └── chat-history-*.json       # Historical chat records (legacy format)
├── diary/
│   └── YYYY-MM-DD.md             # Diary Markdown
├── imports/                      # User-imported files (PDF/Word/TXT, etc.)
├── openforu/
│   ├── sessions/
│   ├── staging/
│   ├── uskills/
│   ├── uplugins/
│   └── uplugin-data/
├── extensions/
│   ├── skills/_registry.json
│   └── plugins/_registry.json
├── traces/                       # trace JSONL (legacy format)
├── weather/
├── portrait/
├── preferences/
├── packs/
├── _derived/                     # Rebuildable derived indexes (vector cache, etc.)
├── models/                       # Embedding model files
└── logs/                         # Runtime logs
```

---

## 7. Legacy Data Import

**File:** `src/main/db/importLegacy.ts`

On first database open (once per `dataRoot`), imports historical data from JSON/MD files into SQLite:

| Source file | Target table |
|--------|--------|
| `companion/chat-history-*.json` | `chat_history` |
| `memory/episodes/episodes.v1.json` | `episodes` + FTS rebuild |
| `memory/kg/kg.v1.json` | `knowledge_triples` |
| `traces/trace-*.jsonl` | `turn_traces` |
| `diary/YYYY-MM-DD.md` + `diary/meta.json` | `diary` |
| `openforu/workspaces.json` | `openforu_workspaces` |
| `extensions/skills/_registry.json` | `kv_store` |

Import is idempotent: skipped if target table `count > 0`.

---

## 8. Related Documentation

| Document | Content |
|------|------|
| [00-overall-system.md](./00-overall-system.md) | Data directory overview, storage design decisions |
| [01-brain-system.md](./01-brain-system.md) | Fact storage (FactStore) and association indexing |
| [06-time-system.md](./06-time-system.md) | temporal_anchors table write and retrieval |

*Data Layer · Ackem v1.0.0 · 2026-06*
