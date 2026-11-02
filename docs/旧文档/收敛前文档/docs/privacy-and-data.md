> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# Privacy and data

[中文](privacy-and-data.zh.md) · [Data directories](memory-format.md)

## Local-first

Ackem stores application state, history and memory locally, while users choose models, channels and tools. Cloud model calls send selected context to that provider. Search, web, MCP, messaging and commands can also use the network. **Local-first does not mean content never leaves the machine.**

## Storage boundaries

| Data | Location / handling |
|---|---|
| Conversation, memory, personality, events and managed tasks | Active Ackem data root, SQLite and related files |
| Diary, imports, user extensions and derived retrieval | `diary/`, `imports/`, `openforu/`, `_derived/` under the root |
| App settings and credentials | `ackem-app-settings.json` in Electron userData |
| Kernel settings, sessions and runtime state | Actual AckemCode data directory |
| Work inputs and artifacts | `<dataRoot>/workspace/` or another selected directory |
| Channel history and mapping | App database/history and the channel mapping file in userData |

Ackem data can use portable `data/` or a platform user directory. Desktop kernel startup defaults to `<codeRoot>/data/`, while channel startup defaults to `~/.ackemcode/`, with `ACKEMCODE_DATA_DIR` override. Reused services retain their actual startup directory.

## Credentials

Application settings use Electron safeStorage for supported keys, with compatibility handling in the implementation. This does not encrypt every local copy. Kernel synchronization writes a usable API key into JSON `settings.standalone.json`. File permissions are not encryption, and platform behavior differs.

Provider authentication requires credentials. Excluding keys from release packages does not mean keys are never transmitted to their service. Inspect logs, exports, manual configuration and third-party extensions according to actual content.

## Potential outbound data

| Feature | Data that may be sent |
|---|---|
| chat and semantic routing | Request, recent conversation, selected memory and personality/capability context |
| work / AckemCode | Goal, session context, read file/attachment content and tool results |
| Search, fetch and MCP | Queries, URLs, tool arguments and service-specific data |
| QQ / WeChat / Qzone | Outbound text, images, audio and interaction content |
| Voice | Depends on local or external speech service |
| Updates and downloads | Version/resource requests and network connection data |

Scope depends on configuration, context selection and tool actions. Selective memory retrieval is not a guarantee that a particular file can never enter model context.

## Execution permissions

work can read/write files, execute commands and use external tools. The working directory is a starting point, not a global sandbox. Permission modes, task read-only/exclusion constraints and actual approval decisions govern access.

Remote code dispatch defaults off and requires confirmed ownership plus its setting. Once enabled, the default remote mode is `bypassPermissions`; it can be tightened under **Settings → Work execution** and overridden by environment. Independent work and managed desktop tasks use their own permission paths.

Legacy settings migration preserves remote authorization only. Removing old assistant code does not delete historical logs or files already created on disk.

## Backup, migration and deletion

1. Stop tasks and exit the application and relevant kernel services.
2. Back up active app data, Electron userData, kernel data and required artifacts.
3. After migration, check model settings, service directory and recovered tasks; avoid simultaneous old/new writers.
4. Complete deletion must consider each location. Removing the app or only its `data/` does not remove kernel data, external work files or messages stored by platforms.
5. Review private data, keys, tokens, logs and session content before sharing packages or diagnostics.

There is no default Ackem telemetry path centrally uploading conversation content. Configured providers, channels and tools still communicate according to their behavior; this is not a guarantee about external service retention.

[Sensitive capabilities](sensitive-capabilities.md) · [Context policy](ai-context-and-retrieval-policy.md) · [Kernel](ackemcode-kernel.md) · [Security](../../../../SECURITY.md)
