> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../../README.md)。

# Ackem architecture documentation

[中文](README.zh.md) · [Project overview](../../../README.md)

Start with **Ackem for interaction, memory and coordination; AckemCode for general-purpose task execution**. The brain/heart/mouth/neural/time vocabulary describes companion subsystems and no longer describes the whole application.

| Order | Document | Scope |
|---|---|---|
| 1 | [Overall architecture](00-overall-system.md) | Processes and responsibility boundaries |
| 2 | [Routing and tasks](09-routing-and-tasks.md) | chat / plugin / work, contracts, execution, acceptance and delivery |
| 3 | [Understanding and memory](01-brain-system.md) | Companion events, facts and recall |
| 4 | [Personality and emotion](02-heart-system.md) | Relationship and expression state |
| 5 | [Prompts and replies](03-mouth-system.md) | Context, models, streams and tools |
| 6 | [Embedding](04-neural-system.md) | Vector retrieval and fallback |
| 7 | [Extensions](05-extension-system.md) | Skill / Plugin / OpenForU |
| 8 | [Time](06-time-system.md) | Temporal awareness and companion rhythm |
| 9 | [Data layer](07-data-layer.md) | SQLite V22, task persistence and compatibility |
| 10 | [IPC and kernel interfaces](08-ipc-api.md) | Preload, tasks, work and HTTP / SSE |

## Current relationships

- Desktop conversation selects chat / plugin / work.
- Managed tasks use TaskCoordinator / Repository and separate execution, acceptance and delivery.
- Independent work drives private kernel sessions and a separate queue.
- QQ / WeChat retain a separate code bridge; do not depict them as fully unified with desktop execution.
- Memory includes both retrieval/facts and an event/action ledger. Personality and emotion continue to support companionship.
- The legacy assistant is removed; local execution uses work / AckemCode.

[Kernel](../../ackemcode-kernel.md) · [Channel integration](../../ackem-code-bridge.md) · [Developer setup](../dev-setup.md)

## Maintenance

Each chapter describes current module boundaries and source entry points. Previous detailed chapters, public documentation and release materials are in the [documentation archive](../../../../README.md). Source code defines parameters and activation.

Update corresponding chapters and both languages when routing, task state, permissions, storage or IPC change. Application, kernel, database and extension API versions are independent. Historical package notes live in `docs/旧文档/公开文档/docs/releases/`.
