> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# 代码、构建与运行数据路径

[English](CODEBASE-PATHS.md)

## 源码

| 路径 | 内容 |
|---|---|
| `src/main/` | Ackem 主进程：chat / plugin / work 路由、陪伴、记忆、任务和渠道 |
| `src/main/tasks/` | 托管任务协调、契约、持久化、交付和持续规则 |
| `src/main/ackemcode/` | 内核接入、监督、独立工作与渠道代码桥接 |
| `src/preload/`、`src/shared/` | IPC 桥与共享类型 |
| `src/renderer/` | React UI |
| `parts/ackemcode/` | 自包含通用智能体内核、服务、CLI 和 Web UI |
| `docs/` | 现行指南与单独标识的历史发行资料 |
| `scripts/`、`electron-builder.yml` | 构建和打包 |
| `resources/`、`assets/`、`voice-service/` | 资源与可选语音服务 |

## 编译与打包

```powershell
npm ci
npm --prefix parts/ackemcode ci
npm --prefix parts/ackemcode run build
npm run build
npm run dist:green
```

主应用编译到 `out/`；内核编译到 `parts/ackemcode/dist/`。绿色版脚本按根 `package.json` 的版本生成 `dist/release/Ackem-<version>-win-x64/`。请以脚本和实际输出为准，不把旧版目录名作为固定路径。

发行包中的内核位于 `resources/ackemcode/`。桌面启动适配需要源码和 tsx 依赖，渠道适配需要编译服务入口；根应用构建不替代内核构建。

## 数据与工作目录

| 位置 | 用途 |
|---|---|
| Ackem 活跃数据根 | `ackem.db`、记忆、历史、导入、日记、扩展等 |
| `<dataRoot>/workspace/` | 默认工作目录，首次需要时创建 |
| 用户选定的其他目录 | 真实输入资源或工作产物，可位于数据根之外 |
| Electron userData | `ackem-app-settings.json`、渠道内核会话映射等 |
| 桌面内核默认 `<codeRoot>/data/` | 内核会话和独立模型设置 |
| 渠道启动默认 `~/.ackemcode/` | 渠道内核会话和设置 |

设置为便携模式时，开发数据根为 `<cwd>/data/`，打包后为程序目录的 `data/`。用户目录模式在 Windows 使用 `%LOCALAPPDATA%/Ackem`，macOS 使用 `~/Library/Application Support/Ackem`。Electron userData 是另一套路径，以运行中的应用为准。

`ACKEMCODE_DATA_DIR` 覆盖内核目录。若复用已有服务，真实目录取决于该进程；详见[内核文档](ackemcode-kernel.zh.md)。

## 版本与备份

应用版本、内核 package 版本、SQLite schema 版本和扩展 API 版本分别维护。当前 SQLite 迁移为 V22；扩展校验常量以 `ecosystem/constants.ts` 为准，不要机械替换成应用版本。

备份需包含使用中的数据根、设置、内核数据和工作产物。它们含凭据或私人内容，不能放入公开发布包。工作目录不是全机权限边界。

[文档导航](OPEN-SOURCE-DOC-MAP.zh.md) · [数据格式](memory-format.zh.md) · [隐私](privacy-and-data.zh.md)
