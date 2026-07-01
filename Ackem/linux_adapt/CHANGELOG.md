# Changelog

本文件记录 **Ackem v1.0.0** 及后续用户可见变更。完整 Release 见 [GitHub Releases](https://github.com/JasonLiu0826/Ackem/releases)。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

## [1.0.0] - 2026-07-01

### Added

- **Ackem v1.0.0** 首个对外开源版本（Windows 绿色版）
- 七系统 + 数据层 + IPC 架构文档：脑 / 心 / 嘴 / 神经 / 扩展 / 整体 / 时间 + 数据层 + IPC
- 扩展开发者协议（`engineApiVersion` ^1.0.0，OpenForU `u/` → 官方 `ackem/` PR 路径）
- 开源文档集：`CODEBASE-PATHS.md`、`memory-format.md`、`distribution-windows.md`
- AGPL-3.0 + CLA v1.1 许可证体系
- 用户文档中英双版（8 篇 *.zh.md）

### Changed

- 产品对外版本号统一为 **v1.0.0**（构建目录 `Ackem-1.0.0-win-x64`）
- `community/` 扩展市场流水线默认关闭（`COMMUNITY_EXTENSIONS_OPEN=false`）

### Security

- 发行包不含用户 `data/`、API Key、`.env`
- 见 [SECURITY.md](./SECURITY.md)

---

## [0.0.0] - 内部构建

- 早期 electron-builder 构建号；功能与 v1.0.0 绿色版对齐，版本字符串逐步迁移中。

[1.0.0]: https://github.com/JasonLiu0826/Ackem/releases/tag/v1.0.0
