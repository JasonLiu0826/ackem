# Ackem

[English](README.en.md) · [完整文档](docs/README.md)

**Ackem 是本地优先的 AI 伙伴与任务协调应用，AckemCode 是通用智能体执行内核。**

Ackem 负责持续对话、记忆、性格与情绪，理解请求并跟进任务；AckemCode 负责文件、命令、检索、文档和其他工具支持的真实操作，也提供独立 CLI 与 Web 界面。A.C.K.E.M：Autonomous Companion Keeping Emotional Memory。

![Ackem 请求处理总览](docs/diagrams/request-routing-zh.light.svg)

[放大查看](docs/diagrams/request-routing-zh.light.svg) · [深色版本](docs/diagrams/request-routing-zh.dark.svg)

Ackem 按请求意图选择 **chat（对话与内容回应）／plugin（调用已启用扩展）／work（交给 AckemCode 操作真实资源）**。三者是处理方式，不是依次执行的三个步骤；只读检查本机状态也属于 work。

不需要先手动选通道。使用例子见[请求如何处理](docs/usage.zh.md#请求如何处理)，判断与执行链见[三级路由](docs/architecture.zh.md#三级路由)。

## 安装

在[主仓库 Releases](https://github.com/JasonLiu0826/ackem/releases)选择适合平台的版本，按对应发行说明安装。Windows 便携版完整解压后启动 `Ackem.exe` 或随包启动脚本。安装包功能和验证范围以该版本说明为准；当前源码应用版本为 `2.0.0`。

首次启动，在设置中配置模型地址、密钥和模型名称，再发送一条普通消息。需要操作项目时，在聊天里明确委托任务，或进入工作页。权限、渠道和数据位置见[使用指南](docs/usage.zh.md)。

## 从源码快速启动

当前 CI 使用 Windows / Node.js 22。根应用与内核需要分别安装依赖：

```powershell
git clone https://github.com/JasonLiu0826/ackem.git
cd ackem
npm ci
npm --prefix parts/ackemcode ci
npm --prefix parts/ackemcode run build
npm run dev
```

应用依赖 Electron preload，请从 `npm run dev` 启动。环境排障、检查与打包命令统一见[开发指南](docs/development.zh.md)。

## 按需阅读

| 文档 | 解决的问题 |
|---|---|
| [使用指南](docs/usage.zh.md) | 安装、设置、渠道、工作执行、数据与隐私 |
| [架构说明](docs/architecture.zh.md) | Ackem / AckemCode 分工、三级路由、任务生命周期 |
| [开发指南](docs/development.zh.md) | 环境、扩展开发、验证、构建与发布 |
| [模块参考](docs/modules.zh.md) | 源码入口、内核接入、存储与接口 |
| [记忆、性格情绪与时间引擎](docs/companion-engines.zh.md) | 陪伴状态如何理解、记住并组织表达 |

[贡献](CONTRIBUTING.zh.md) · [问题反馈](https://github.com/JasonLiu0826/ackem/issues) · [变更记录](CHANGELOG.md) · [旧文档归档](docs/旧文档/README.md)

许可：[AGPL-3.0](LICENSE)；第三方说明：[NOTICE](NOTICE.md)。云模型、渠道与联网工具会按配置发送相关内容；使用前阅读[数据与隐私](docs/usage.zh.md#数据与隐私)。
