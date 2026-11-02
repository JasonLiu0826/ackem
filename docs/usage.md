# User guide

[中文](usage.zh.md) · [Documentation](README.en.md)

## Installation

See the [README](../README.en.md#installation) for installation and source quick start. Choose a matching platform release and fully extract portable Windows packages. Signing, dependencies and verification on macOS depend on the release notes.

Configure a model on first launch. Some channels also wait for local semantic resources. For startup issues, check the actual model, kernel process and data directory using the [module reference](modules.md#ackemcode).

## Settings and models

| Setting | Purpose |
|---|---|
| Models and API | Endpoint, key and model for conversation and semantic interpretation |
| Work execution | AckemCode model, work permissions and remote dispatch |
| Companion and personality | Presets, expression and companion options |
| Mobile / channels | QQ, WeChat and ownership confirmation |
| Data and system settings | Data locations, semantic resources and runtime status; use the actual UI |

Use a cloud service or local compatible endpoint and supply the endpoint, key and model required by that service. Ackem does not bundle a conversation LLM. Validate multi-turn tool calls separately; successful conversation does not establish working agent execution.

Foreground, clipboard, screenshot and microphone capabilities depend on platform, module state, switches and authorization. A disabled capability should not be assumed to collect continuously. Model synchronization differences are maintained only in the [kernel reference](modules.md#ackemcode).

## Request handling

Describe the result you want. Ackem selects chat / plugin / work using the current intent, recent conversation and available capabilities. These examples illustrate boundaries rather than keyword rules:

| Example | Handling | Expected result |
|---|---|---|
| “Explain this concept” or “Suggest a directory-organizing plan” | chat | An explanation or plan in conversation |
| “Use this enabled plugin on the content” | plugin | Validate and call the extension; actual receipts establish the result |
| “Inspect which modules this project actually uses” | work | AckemCode reads the real project, even without modifying files |
| “Save this content as a file” or “Organize this actual directory” | work | File operations with artifacts or an inventory |
| “Create a plugin I can call again later” | work | Extension creation; installation, activation and callability still need verification |

Writing text in a reply differs from generating and saving a document file. A word such as “search” does not determine the route by itself; chat can use ordinary chat tools. Follow-up requirements involving actual resources are interpreted in context rather than requiring you to restart with a different phrasing.

Missing plugins, failed classification and unexecuted actions must not appear successful. Ambiguous references may need clarification. Selecting work does not establish dispatch, execution or acceptance. Implementation and channel differences live in [architecture](architecture.md#routing).

## Work and permissions

| Entry | Usage |
|---|---|
| Managed chat tasks | Explicitly delegate a real operation; Ackem follows the goal, execution and delivery |
| Independent work page | Supply a goal and directory through a private session and input queue |
| Channel code dispatch | Confirm ownership and enable remote dispatch before delegating code tasks from QQ / WeChat |

Work starts in `workspace/` under the active data root by default, or a selected directory. **The working directory is a starting point, not a global filesystem allowlist.** Full-access modes may operate outside it. Approvals, read-only / excluded resources and actual permissions jointly constrain execution.

Use stop or takeover controls and check the stop receipt. Hiding a page, closing a window or losing the event stream does not establish that execution stopped. Goal amendments, queues, rework and execution / acceptance / delivery are defined in [architecture](architecture.md#tasks).

## Channels

### QQ

1. Deploy a OneBot v11 backend using its own instructions and log in. The backend owns the login session; Ackem does not take the QQ password.
2. Configure WebUI / connection addresses and tokens in QQ settings; use the supported QR and connection-test flow.
3. Save and enable the connection, verify a private message, then confirm channel ownership on the desktop.
4. To operate on the machine remotely, also enable remote dispatch under work-execution settings and check remote permissions.

Use the backend's actual HTTP / WebSocket endpoints and tokens. WebUI and OneBot tokens serve different interfaces. Diagnose login, connectivity, ownership, model configuration and semantic-resource readiness separately.

Voice, stickers and Qzone interactions have separate settings. User stickers live under `<dataRoot>/qq-memes/`; bundled assets and attribution are in [QQ assets](../assets/qq-memes/CREDITS.md). Qzone publishing, comments and likes may make real platform changes; check the account, dry-run, schedule and frequency settings first.

### WeChat and cross-channel sessions

Complete the supported WeChat setup and ownership confirmation in mobile settings, then verify messaging. Replies return to the requesting channel. Shared history and personality do not imply identical execution paths.

QQ / WeChat currently use code-request bridging with explicit prefixes such as `/code` and engineering rules. **Turns with user images skip code-dispatch detection.** These channels do not yet use the full desktop general semantic routing and managed-supervision path.

Remote dispatch defaults off. Its enabled default permission is `bypassPermissions` and can be tightened. `ACKEMCODE_PERMISSION_MODE` overrides remote settings; previous grants can migrate to `workRemoteChannelsEnabled`. Check actual sessions after changing permissions, model or directory; already-completed operations cannot be undone by changing a setting.

## Data and privacy

| Location | Main contents |
|---|---|
| Active Ackem data root | `ackem.db`, memory, history, diaries, extensions, model caches and default workspace |
| Electron userData | Settings, credential-related data and channel session mapping |
| Actual AckemCode data directory | Kernel sessions, configuration, tools and task state |
| Selected working directories | Modified files and artifacts, potentially outside the data root |
| External services and channels | Content received or retained by models, search, tools and platforms |

Portable development normally uses `<cwd>/data/` and portable releases use `data/` next to the executable. User-directory mode is platform-dependent. Check settings and actual runtime paths; the [storage reference](modules.md#storage) explains directories and database details.

Local-first does not mean no outbound data. Configured cloud models receive selected messages, memories, attachments and tool results; search, MCP, voice and channels may send content to their services. Do not assume all traffic goes to one model endpoint or all temporary artifacts are immediately erased.

System encryption for application settings and kernel `settings.standalone.json` are different mechanisms. Model synchronization may write keys into kernel JSON. Check both when backing up, diagnosing or sharing files.

Before backup or migration, stop tasks and exit the application and relevant services. Copy the active data root, needed userData, actual kernel data and external artifacts, then validate upgrades and task recovery on a copy. Full removal must address each location; uninstalling or deleting one `data/` directory does not remove all external files or platform messages.

Rebuild derived indexes only through the supported implementation. Facts, history, contracts, receipts and artifacts are not disposable caches. See [memory](companion-engines.md#memory) for correction, forgetting and retrieval.

## Content settings

Adult mode defaults off and affects companion content and expression rather than file, command or continuing-execution permissions. Adult content is for adults; users can disable the mode and reject intimate progression. Application policy and the chosen model's policy jointly affect output; perfect detection is not guaranteed.

Memory privacy levels and current mode constrain intimate-content retrieval and injection. Storing something does not mean it is sent to the model on every turn. See the [retriever](../src/main/memory/retriever.ts) and [interpreter](../src/main/engine/interpreter.ts).

Report vulnerabilities through the [security policy](../SECURITY.md). Developer diagnostics and release checks are in [development](development.md).
