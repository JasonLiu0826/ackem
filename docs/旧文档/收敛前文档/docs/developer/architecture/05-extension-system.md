> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../../README.md)。

# Extensions and the plugin route

[中文](05-extension-system.zh.md) · [Architecture index](README.md)

## Role in the system

Ackem selects chat, plugin or work. plugin invokes available extensions; work uses AckemCode for real-resource tasks, including creating or modifying extensions.

Skill, Plugin, OpenForU and game-mode modules are runtime categories, not additional conversation routes.

## Modules

| Path | Responsibility |
|---|---|
| `extensions/coordinator.ts` | Boot, lifecycle, registration, snapshot/event communication |
| `extensions/protocols.ts` | Snapshot, event, lifecycle and dispatch contracts |
| `extensions/skills/registry.ts` | Skill registration, status, calls and tool definitions |
| `extensions/plugins/registry.ts` | Plugin registration and lifecycle |
| `extensions/dispatch/` | Candidate catalog, preferences, execution and compatibility dispatch |
| `channel/routeChannel.ts` | Desktop channel classification |
| `channel/executeChannel.ts` | Channel execution and plugin receipts |
| `extensions/openforu/` | Local user extensions, design/deploy, sandbox and Surface |
| `extensions/gamemode/` | Game integrations |
| `extensions/ecosystem/` | Package, version and signature protocols; marketplace disabled |

## Invocation and creation

Use requests bind actual enabled targets before execution and recording. Planned, disabled and error entries are not executable capabilities. Forced core activation is defined in `shared/coreExtensions.ts`.

Creation/modification uses work. Mentioning a plugin does not necessarily mean invocation. Generated source still needs a valid manifest, permissions, registration and callable implementation. Desktop channel classification differs from internal extension Dispatch.

## OpenForU and kernel plugins

Local `u/` extensions load from the active root's `openforu/`. Source templates/examples do not install automatically. Plan workspaces, deployment, Worker isolation and Surface windows remain in this subsystem; they do not define all project execution.

AckemCode skills, MCP and plugin loading are kernel features, not automatic entries in Ackem's registry. Cross-boundary integration needs explicit protocol and lifecycle adaptation.

## Permissions and state

Extension permissions constrain the extension. Its staging directories and network allowlists are not global work restrictions. Disabled extensions leave the callable catalog; failures after attempted execution require truthful status.

Extensions may have running processes, windows or hooks. Stopping a plugin differs from stopping a kernel task.

## Maintenance

[Protocol](../DEVELOPER-EXTENSION-PROTOCOL.md) · [OpenForU](../../../../../../src/main/extensions/openforu/PROTOCOL.md) · [Routing and tasks](09-routing-and-tasks.md) · [Kernel](../../ackemcode-kernel.md)

Application and extension validation versions are maintained separately. Update catalog and permission documentation with manifests and implementation.
