> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../README.md)。

# Ackem extension interfaces and development

[中文](DEVELOPER-EXTENSION-PROTOCOL.zh.md) · [Extension architecture](architecture/05-extension-system.md)

## Current boundary

The plugin route invokes installed, enabled capabilities. Creating/modifying plugins is work performed through AckemCode. Generated code must still meet manifest, registration, permissions, loading and acceptance requirements.

OpenForU Plan design/deploy, Worker and Surface code remains part of the user-extension subsystem; the main chat does not uniformly use its old Create → Plan path. AckemCode skill/plugin loading has a different interface from Ackem extensions.

## Namespaces

| Scope | Purpose | Current status |
|---|---|---|
| `ackem/` | Built-in Skills / Plugins | Actual registered active capabilities |
| `u/` | Local OpenForU extensions | Loaded from the active data root under permissions |
| `community/` | Signed marketplace package protocol | Disabled: `COMMUNITY_EXTENSIONS_OPEN=false` |

IDs use `<scope>/<name>@<semver>`. Scope, version, capability tag and tool name are distinct.

## Interfaces

[protocols.ts](../../../../../src/main/extensions/protocols.ts) defines EngineSnapshot, ExtensionEvent, lifecycle and DispatchConfig. [coordinator.ts](../../../../../src/main/extensions/coordinator.ts) composes registration and execution.

- Use snapshots and protocol events rather than directly mutating engine state.
- Skill handlers and Plugin hooks / invoke / Surface follow their own types.
- Callable catalog entries need valid dispatch configuration, implementation and active state.
- Background hooks, skins and lifecycle plugins are not necessarily user-invocable route candidates.

## Source and installation

| Type | Path |
|---|---|
| Built-in Skill | `src/main/extensions/skills/builtin/<category>/<name>/` |
| Built-in Plugin | `src/main/extensions/plugins/builtin/<category>/<name>/` |
| Local user extension | `<dataRoot>/openforu/uskills/<slug>/`, `uplugins/<slug>/` |
| Templates | Examples and templates under `src/main/extensions/openforu/` |

Template source is not the runtime user directory. See [OpenForU protocol](../../../../../src/main/extensions/openforu/PROTOCOL.md).

## Version compatibility

`engineVersion` is the app range used by extension validation; `engineApiVersion` is the protocol range. Current [constants.ts](../../../../../src/main/extensions/ecosystem/constants.ts) defines `ACKEM_APP_VERSION='0.0.0'` and `ACKEM_ENGINE_API_VERSION='1.0.0'`, independently from the root package's 2.0.0.

Do not replace manifest ranges with 2.x merely to align documentation. See `ecosystem/manifestValidate.ts`; a version-policy change requires runtime and compatibility review.

## Permissions and failures

User extensions follow manifests and runtime approval. Worker/Surface filesystem and network restrictions do not globally constrain AckemCode to their staging directory.

Unavailable capabilities must not be exposed as executable targets. Report failed or unexecuted operations honestly; silent fallback must not fabricate the requested outcome.

## Contribution and verification

Use the [contribution guide](../../../../../CONTRIBUTING.md). Check registration, enable/disable, catalog, permissions, invocation and receipts. The public source lacks the full local suite; use [available checks](testing.md) and relevant manual acceptance.

The community marketplace remains disabled. Contribute through built-in source or local `u/` prototypes.
