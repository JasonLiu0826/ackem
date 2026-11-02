> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# Ackem documentation map

[中文](OPEN-SOURCE-DOC-MAP.zh.md)

## Understand the current project

| Document | Purpose |
|---|---|
| [README](../README.md) | Ackem / AckemCode, three routes and setup |
| [Overall architecture](developer/architecture/00-overall-system.md) | Processes, modules and boundaries |
| [Routing and tasks](developer/architecture/09-routing-and-tasks.md) | Interpretation, dispatch, execution, acceptance, delivery and stop |
| [AckemCode kernel](ackemcode-kernel.md) | General tools, sessions, permissions, CLI and adapters |
| [Architecture index](developer/architecture/README.md) | Companion, memory, extensions, data and interfaces |
| [Paths](CODEBASE-PATHS.md) | Source, build artifacts, runtime data and work directories |
| [Diagram gallery](../../../diagrams/README.en.md) | Core vector figures, theme variants and maintenance |

## Usage and data

[Privacy](privacy-and-data.md) · [Sensitive capabilities](sensitive-capabilities.md) · [Data format](memory-format.md) · [Context and retrieval](ai-context-and-retrieval-policy.md) · [Local models](local-models-windows.md) · [Indexing](indexing-and-scale.md) · [Perception](perception-layer.md) · [Content and safety](adult-and-safety-policy.md)

## Channels and personality

[Code bridge](ackem-code-bridge.md) · [Shared conversation](cross-channel-conversation.md) · [QQ setup](qq-onebot-setup.md) · [Qzone](qq-space.md) · [Freya](../../../freya/README.md)

Shared conversation and unified execution are different goals. See the architecture and kernel guides for current channel differences.

## Development

[Setup](developer/dev-setup.md) · [Verification](developer/testing.md) · [Release checklist](developer/release-checklist.md) · [Windows distribution](distribution-windows.md) · [Extension protocol](developer/DEVELOPER-EXTENSION-PROTOCOL.md) · [Contributing](../../../../CONTRIBUTING.md) · [Languages](I18N.md)

## Versions and history

[CHANGELOG](../../../../CHANGELOG.md) · [Documentation archive](../../README.md) · [Historical releases](../../公开文档/docs/releases)

Package names, hashes, platform statements and installation steps in `docs/旧文档/公开文档/docs/releases/` apply only to the named release. Dated local design/audit notes are not current public interface commitments. Architecture updates do not rewrite licensing, conduct, attribution or historical persona material.

Use current entry documents for architecture and source for parameters. Application, kernel and extension API version fields must not be substituted for one another.
