> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# 数据目录与备份

[English](memory-format.md) · [路径总览](CODEBASE-PATHS.zh.md)

## 活跃数据根

`paths.ts` 按设置选择数据根：便携开发使用 `<cwd>/data/`，便携发行版使用程序旁 `data/`；用户目录模式在 Windows 为 `%LOCALAPPDATA%/Ackem`，macOS 为 `~/Library/Application Support/Ackem`。以设置显示的实际路径为准。

## 主要内容

| 路径 | 内容 |
|---|---|
| `ackem.db` | 状态、历史、记忆、事件、行动、任务与其他模块结构化数据 |
| `memory/` | 事实兼容文件、归档、召回等相关数据 |
| `companion/` | 自我描述、状态文件及聊天兼容文件 |
| `diary/` | 日记 |
| `imports/` | 导入文件 |
| `openforu/` | 本机用户扩展、会话与部署暂存 |
| `agents/` | 社会成员相关本机数据（使用时产生） |
| `workspace/` | 默认工作目录与产物（使用时产生） |
| `_derived/` | 可重建的检索索引/缓存 |
| `models/`、`logs/` | 模型缓存与日志（按运行配置产生） |

`layout.ts` 初始化基础目录；其他模块还会按需生成内容。这不是目录穷举表。社区消息数据、任务契约与事件等可在 SQLite 中，不应只备份 Markdown / JSON。

## 设置、内核和外部产物

Electron userData 保存应用设置和渠道会话映射，可能与数据根不同。AckemCode 还使用其实际数据目录：桌面默认 `<codeRoot>/data/`，渠道默认 `~/.ackemcode/`，支持绝对路径的 `ACKEMCODE_DATA_DIR`。

内核会话、模型配置和工作产物不是一套数据。工作可选择数据根之外的目录；只删除应用数据不能删除所有产物。

## 写入边界

陪伴记忆与扩展拥有各自写入规则；不能将其理解为整个 Ackem 的文件白名单。work 可以在任务权限、只读与排除约束下操作外部资源，工作目录是起点。

派生索引可重建；数据库、契约、回执、用户文档、实际工作产物不能按缓存处理。不要把 `parts/ackemcode/data/` 一律当成可删构建目录。

## 备份与迁移

1. 停止任务、退出应用与相关内核服务，避免复制不一致的 SQLite / WAL 状态。
2. 拷贝活跃数据根、需要的 userData 设置、内核数据和外部产物。
3. 在副本上验证升级。当前 schema 迁移至 V22，QQ / 空间兼容表另行幂等补齐；不要用同一版本号推断不同历史分支结构必然一致。
4. 核对模型配置、渠道机主、路径和待恢复任务，再开始执行。
5. 备份含私人数据与凭据，不用于公开发行。

[数据层](developer/architecture/07-data-layer.zh.md) · [隐私](privacy-and-data.zh.md) · [内核](ackemcode-kernel.zh.md)
