> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../README.md)。

# Source verification and runtime acceptance

[中文](testing.zh.md)

## Scope

| Command | Coverage |
|---|---|
| `npm run typecheck` | Renderer and shared types |
| `npx tsc --noEmit -p tsconfig.node.json` | Main process and preload |
| `npm --prefix parts/ackemcode run typecheck` | Kernel server, CLI and Web UI |
| `npm --prefix parts/ackemcode run build` | Kernel compilation |
| `npm run build` | Electron application compilation |

Install both root and kernel dependencies. Current CI uses Windows / Node.js 22; the root build uses Windows shell syntax.

The complete local suite is not distributed. A few tracked tests do not represent full regression coverage. Do not document nonexistent `npm test` scripts or private helper-dependent commands as public acceptance steps.

## Runtime checks

- chat: ordinary conversation, retrieval, streamed bodies, attachments and history.
- plugin: actual enabled invocation and no fabricated success for unavailable capabilities.
- work: submission, goal amendments, queue, permissions, tools, acceptance/rework and final output.
- stopping/recovery: quiescent receipts, restart handling and stale-event isolation.
- independent work: private queues, modes, CLI and hidden-page behavior.
- QQ / WeChat: ownership, remote setting, permission changes, source replies and history.
- packages: clean startup, kernel entries, configuration, retention and resources.

Record input, observed output, environment and untested scope. Live models, channels and external tools require services and credentials.

## Native modules and asynchronous runners

`better-sqlite3` and `node-pty` must match their loading Node/Electron ABI. Native load failure is an environment failure, not database verification. Recheck application startup after an ABI change.

Exit code 0 without a final summary does not prove suite completion. Distinguish passes, skips, early returns, timeouts and incomplete collection. Focused tests do not establish full regression.

For documentation-only changes, verify links, source paths, commands and semantics; business tests are usually unnecessary.
