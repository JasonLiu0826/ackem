> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# Perception, attachments and real tasks

[中文](perception-layer.zh.md)

Desktop pets, media, voice, attachments and extension perception have different owners. Do not assume a single global perception grant or live screen vision.

| Input / capability | Boundary |
|---|---|
| User images | Actual image inputs, subject to model support and read success |
| Files/directories | Actual captured/read content and work tool results |
| Video | Sampled frames do not establish complete viewing or audio understanding |
| Voice | Depends on configured local/external services |
| Desktop pet / Live2D | Display and interaction, not whole-desktop vision |
| Foreground, clipboard and screenshot plugins | Check manifest, registered implementation and active state; placeholders are not capabilities |
| Kernel file/system inspection | Tool execution under task authority, separate from the removed assistant |

Named screenshot/clipboard entries may be stub or deprecated implementations. Directory names alone do not establish availability. Kernel MCP/external integrations require configuration.

Plugin and work permissions are separate. Attachments do not justify describing unread content; model output is not proof of reading.

[Sensitive capabilities](sensitive-capabilities.md) · [Privacy](privacy-and-data.md) · [Kernel](ackemcode-kernel.md)
