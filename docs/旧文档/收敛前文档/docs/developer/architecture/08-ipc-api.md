> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../../README.md)。

# IPC and kernel interfaces

[中文](08-ipc-api.zh.md) · [Architecture index](README.md)

## Boundaries

The renderer calls `window.ackem` exposed by preload rather than directly using Node.js or managed kernel sessions.

| Source | Role |
|---|---|
| [preload/index.ts](../../../../../../src/preload/index.ts) | Actual exposed APIs, channels and unsubscribe functions |
| [renderer ackem.d.ts](../../../../../../src/renderer/src/ackem.d.ts) | Renderer declarations |
| [main/ipc.ts](../../../../../../src/main/ipc.ts) | Host registration |
| [main/ipc/](../../../../../../src/main/ipc) | Validation and business delegation |
| [shared/](../../../../../../src/shared) | Shared protocols and state |

This is a guide to key interface families. Source defines complete parameters; no fixed API count is promised.

## Chat

`chat:start` enters routing and orchestration. `chat:stop` controls chat streaming. Reply bodies, reasoning, status, delivery and task notifications have distinct events.

**Stopping a chat response does not stop all work.** Use the task-specific stop interface and inspect execution receipts.

Attachment capture normalizes inputs through interfaces such as `chat:captureAttachments`; an arbitrary path string is not automatically a verified/read attachment.

## Managed tasks: window.ackem.tasks

| API | IPC | Purpose |
|---|---|---|
| `submit` | `tasks:submit` | Managed work input |
| `cancel` | `tasks:cancel` | Cancel an input request |
| `stop` | `tasks:stop` | Request task stopping |
| `list` / `snapshot` | `tasks:list` / `tasks:snapshot` | Authorized projections |
| `runQueuedNow` | `tasks:run-queued-now` | Scheduling |
| `grantGoal` / `grantRule` | `tasks:goal-grant` / `tasks:rule-grant` | Explicit local-user standing authority |
| Subscription | `tasks:event` | Task updates |

`tasks:submit` belongs to managed work; independent work uses `workbench:send`. Model output or quoted text cannot grant standing authority.

## Work and supervision: window.ackem.workbench

`open`, `snapshot`, `send`, `inputQueue`, `cancelInput` and `promoteInput` cover sessions and durable input. `permission`, `answer`, `planDecision` and `abort` handle interaction. CLI/terminal integration has separate open/input/resize/close APIs.

Supervision interfaces handle managed approvals. `workbench:event` includes taskId and turnId, with optional goalRevision / controlEpoch. Check task and revision before consuming events; stale SSE content is not a new goal's result.

Call returned unsubscribe functions on component teardown. Recovery uses durable snapshots and receipts, not just page memory.

## Host to kernel

[ackemcode/client.ts](../../../../../../src/main/ackemcode/client.ts) is the desktop HTTP / SSE client; `chatClient.ts` serves the channel bridge. [server/index.ts](../../../../../../parts/ackemcode/src/server/index.ts) defines session, streaming, permission, interaction, host-task and capability APIs.

Managed sessions use host binding and task control metadata. New UI must preserve host validation rather than accessing managed sessions directly. Check capabilities and actual responses for availability.

## Removed interfaces

Legacy assistant, investigation, machine-map and task-plan preload/IPC interfaces are removed. Use work / AckemCode.

[Routing and tasks](09-routing-and-tasks.md) · [Kernel](../../ackemcode-kernel.md)
