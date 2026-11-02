> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# Ackem 文档导航

[English](OPEN-SOURCE-DOC-MAP.md)

## 了解当前项目

| 文档 | 解决的问题 |
|---|---|
| [README](../README.zh.md) | Ackem 与 AckemCode 的定位、三级路由、运行方式 |
| [整体架构](developer/architecture/00-overall-system.zh.md) | 当前进程、模块与责任边界 |
| [路由与任务](developer/architecture/09-routing-and-tasks.zh.md) | 理解、派工、执行、验收、交付与停止 |
| [AckemCode 内核](ackemcode-kernel.zh.md) | 通用工具、会话、权限、CLI 及启动适配 |
| [架构索引](developer/architecture/README.zh.md) | 陪伴、记忆、扩展、数据及接口文档 |
| [代码与产物路径](CODEBASE-PATHS.zh.md) | 源码、构建、运行数据与工作目录 |
| [图表导航](../../../diagrams/README.md) | 核心矢量图、深浅色版本与图表维护 |

## 使用与数据

[隐私与数据](privacy-and-data.zh.md) · [敏感能力](sensitive-capabilities.zh.md) · [数据目录](memory-format.zh.md) · [上下文与检索](ai-context-and-retrieval-policy.zh.md) · [本地模型](local-models-windows.zh.md) · [索引与规模](indexing-and-scale.zh.md) · [感知层](perception-layer.zh.md) · [内容与安全](adult-and-safety-policy.zh.md)

## 渠道与人格

[代码派工桥接](ackem-code-bridge.zh.md) · [三端会话](cross-channel-conversation.zh.md) · [QQ 配置](qq-onebot-setup.md) · [QQ 空间](qq-space.zh.md) · [Freya](../../../freya/README.md)

统一会话与统一执行是不同目标。当前渠道桥接差异见架构与内核文档。

## 开发与贡献

[开发环境](developer/dev-setup.zh.md) · [源码验证](developer/testing.zh.md) · [发布检查](developer/release-checklist.zh.md) · [Windows 分发](distribution-windows.zh.md) · [扩展协议](developer/DEVELOPER-EXTENSION-PROTOCOL.zh.md) · [贡献指南](../../../../CONTRIBUTING.zh.md) · [文档语言](I18N.zh.md)

## 版本与历史

[CHANGELOG](../../../../CHANGELOG.md) · [旧文档归档](../../README.md) · [历史发行资料](../../公开文档/docs/releases)

`docs/旧文档/公开文档/docs/releases/` 的包名、哈希、平台声明和安装步骤只适用于对应发行版。带日期的本地设计稿和审计记录不作为当前公开接口承诺。许可证、行为准则、贡献者与历史语料也不因架构更新而改写历史事实。

维护时以当前入口文档描述架构，以对应源码确认参数和细节。不要把应用版本替换进内核或扩展 API 版本字段。
