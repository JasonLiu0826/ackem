> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../../README.md)。

# Data layer: state, memory and task persistence

[中文](07-data-layer.zh.md) · [Architecture index](README.md)

## SQLite and files

The active data root contains `ackem.db`. [database.ts](../../../../../../src/main/db/database.ts) manages per-root connections, WAL, foreign keys, timeouts, migrations and compatibility reconciliation.

The current [schema version](../../../../../../src/main/db/schemaVersion.ts) is **22**. The earlier V10 / 18-table inventory no longer describes the whole database.

| Module | Persistence responsibility |
|---|---|
| `src/main/db/schemaV*.ts` | Versioned base migrations |
| `schemaCompat.ts`, `schemaCommunity.ts` | Idempotent historical branch and QQ / Qzone compatibility |
| `src/main/db/repos/` | History, state and other repositories |
| `src/main/memory/` | Facts, events, actions, retrieval projections and controls |
| `src/main/tasks/repository.ts` | Contracts, idempotent input, revisions, events and projections |
| `src/main/tasks/communication.ts` | Notification outbox |
| `src/main/tasks/longTerm.ts` | Standing goals, rules, authority and decisions |
| `src/main/ackemcode/standaloneWorkService.ts` | Independent-work input queue |

Some modules create tables on demand. Schema version is not an exhaustive table directory. Inspect a migration copy or use read-only queries; do not overwrite version state from an obsolete document.

## Memory and execution evidence

[MemorySystem](../../../../../../src/main/memory/memorySystem.ts) exposes `record`, `recall`, `control` and `recover`. [Contracts](../../../../../../src/main/memory/contracts.ts) distinguish chat, plugin, work and memory control, including status and evidence origin.

Fact retrieval, compatible JSON files and readable archives remain alongside the ledger. No individual JSON file represents every memory record.

Managed tasks persist goal revisions, control epoch, contract, execution receipts, acceptance and delivery. Result bodies are separate from control state; stopping or review failure must not erase retained execution output.

## Channels and identities

`channels/conversation.ts` merges channel history, `chat/unifiedChatHistory.ts` supports desktop unified history and `session/canonical.ts` defines engine sessions. `social/` handles member identity/context. Shared displayed history does not imply identical execution lifecycles.

## Storage and migration

Ackem data, Electron userData, kernel data and work directories are separate. Kernel session/settings stores do not depend directly on Ackem's SQLite schema.

Back up data, stop relevant processes and validate historical samples plus repeated startup. Compatibility reconciliation does not replace migration design. Do not reuse an existing version number for a different schema.

[Paths](../../CODEBASE-PATHS.md) · [Backup](../../memory-format.md) · [Task lifecycle](09-routing-and-tasks.md)
