> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# Windows 分发与更新

[English](distribution-windows.md) · [发布检查](developer/release-checklist.zh.md)

从[主仓库 Releases](https://github.com/JasonLiu0826/ackem/releases)选择对应版本，阅读它的平台、依赖和限制。当前源码版本不等于最新公开包的功能或验证范围。

## 产物

`npm run dist:green` 生成 `dist/release/Ackem-<version>-win-x64/`；可选 `npm run dist:setup` 生成安装包。实际名称以构建输出为准。用户运行已准备好的发行包不需要安装开发依赖。

包内包括主应用、必要资源和 AckemCode 运行时。应用根构建与内核构建分别进行；需检查 `resources/ackemcode` 中桌面源码/tsx 与渠道编译入口所需内容。

## 数据

便携模式通常在程序旁 `data/`，用户目录模式使用平台路径；设置位于 Electron userData。内核和工作产物可能在其他位置。程序本体不应包含维护者个人数据、会话或凭据。

更新前停止任务和服务，备份数据、设置、内核数据与产物。不要直接用新包覆盖私人数据，也不要将正在写入的数据库复制成可靠备份。

删除程序或卸载不代表已经删除全部记忆、内核会话和外部工作文件。完整范围见[隐私与数据](privacy-and-data.zh.md)。

## 运行检查

新包应分别验证 chat、plugin、work，任务停止/验收/交付，独立工作与 CLI，以及配置过的 QQ / 微信远程授权。旧电脑助手已删除，不应再要求开启它。

macOS 安装与签名以对应发行说明为准；`docs/旧文档/公开文档/docs/releases/` 中旧包说明仅适用于历史版本。

[开发环境](developer/dev-setup.zh.md) · [路径](CODEBASE-PATHS.zh.md) · [数据目录](memory-format.zh.md)
