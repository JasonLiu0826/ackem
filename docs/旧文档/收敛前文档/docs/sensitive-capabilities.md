> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# Sensitive capabilities and execution boundaries

[中文](sensitive-capabilities.zh.md) · [Privacy](privacy-and-data.md)

## Capabilities and control

| Capability | Data / actions | Controls |
|---|---|---|
| Models and semantic routing | Conversation, selected memory, personality, attachments and task context | Model configuration and context selection |
| AckemCode work | File changes, commands, network, documents and external tools | Task/session permissions, read-only/exclusion constraints, approvals and stopping |
| QQ / WeChat | Platform messages, images, audio and replies | Channel connection and desktop owner confirmation |
| Remote code dispatch | Channel-driven local kernel execution | Work execution setting, off by default, and remote permission mode |
| Qzone | Posts, pictures, comments, likes and browsing | Feature settings, dry run, schedule/frequency and platform support |
| Voice | Microphone, synthesis text and generated audio | Voice settings and chosen local/external services |
| Perception and extensions | Available foreground, clipboard, screenshot and related capabilities | Module status and extension permissions |
| Imports and attachments | Selected files, images, directories or videos | User input, actual parsing, model and tool use |

An entry point does not guarantee equivalent implementation on every platform. Check registry, manifest, runtime status and receipts. Planned or stub entries are not available capabilities.

## Route permission boundaries

chat uses conversation and constrained chat tools. plugin invokes enabled extensions under their permissions. work uses AckemCode under task and kernel policies.

Extension staging and memory write allowlists do not globally constrain AckemCode. A working directory is not a machine-wide allowlist. Bypass mode permits broader operations; scoped inspection retains enforced read-only limits.

QQ / WeChat remote dispatch requires both confirmed ownership and `workRemoteChannelsEnabled=true`. Its default permission mode is `bypassPermissions`, adjustable in settings with environment override. Managed and independent desktop paths manage permissions separately.

## Stopping, retention and credentials

A stop request is distinct from confirmed stopping. Stream disconnection or closing the work page does not revoke execution. Check receipts, process quiescence and task state.

Conversation, tasks, receipts and tool content can persist in application or kernel directories. Artifacts can live outside them. Speech and third-party tools have their own cache behavior; no blanket immediate-discard claim applies.

Operating-system encryption in application settings and kernel JSON credentials are different storage mechanisms. Backup, export and package review must cover both.

## Removed legacy capabilities

The old assistant mode, settings, IPC, `use_computer`, executors, investigation, machine map and legacy task plans are removed. Compatibility migration does not restore them; current execution uses work / AckemCode.

[Kernel](ackemcode-kernel.md) · [Routing and tasks](developer/architecture/09-routing-and-tasks.md) · [Perception](perception-layer.md)
