> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# Context, memory and execution evidence

[中文](ai-context-and-retrieval-policy.zh.md) · [Privacy](privacy-and-data.md)

## Different inputs have different context

Main conversation, routing, supervision and kernel execution construct distinct model inputs. The main chat's Tier B character limit is not the entire application's context budget.

| Context | Main inputs |
|---|---|
| Main chat | Current request, recent history, personality/emotion, Canon, retrieved memory, runtime architecture and task facts |
| Routing | Intent, recent conversation and enabled capability catalog |
| Managed task | Contract, goal, constraints, permissions, tools, receipts and acceptance |
| Independent kernel | Session, system prompt, tools/skills and actual resource content |
| Channels | Channel presence boundary, personality, memory, unified history and channel input |

See `context.ts`, `prompt/`, `engine/orchestrator.ts`, `channel/classifyIntent.ts`, `tasks/runtime.ts` and kernel `server/agent/`.

## Retrieval and recording

Main chat retrieves relevant memory rather than loading the entire fact database into a single prompt. Tier A / Canon provide stable identity/state-related context; Tier B selects facts, episodes, associations or temporal material under policies and budgets.

Fact store, retrieval, ingest, embedding and archives remain. The memory facade also exposes:
- `record`: conversation, routing, plans and execution evidence;
- `recall`: relevant events and facts;
- `control`: corrections, muting, forgetting and deletion;
- `recover`: pending-state recovery.

See `memory/memorySystem.ts`, `contracts.ts` and adapters. One JSON file is not the only authority, and recording intent is not successful execution.

## Task facts and revisions

Context can include current goals, execution, acceptance and delivery. Goal revisions, controlEpoch, runId and publication fences prevent stale turns from replacing newer goals. Historical receipts remain evidence without settling the current task.

Tool output, user assertions, model inference and runtime receipts have different evidence properties. Without actual execution, do not invent file contents, progress, checks or completion.

## Budgets and fallback

Retrieval, history trimming, kernel context compaction and managed budgets have different owners. Missing embeddings can use available keyword/full-text paths. Routing failure, unavailable task storage or missing execution evidence must report undispatched/unexecuted status rather than implying harmless fallback.

## Outbound data

Selected memory, file content and tool results enter the configured model service. Search, MCP and channels can send data to their corresponding services. Local storage is not a no-network guarantee.

[Understanding and memory](developer/architecture/01-brain-system.md) · [Data](developer/architecture/07-data-layer.md) · [Tasks](developer/architecture/09-routing-and-tasks.md) · [Kernel](ackemcode-kernel.md)
