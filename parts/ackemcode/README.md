# AckemCode

[English](README.en.md) · [完整内核说明](../../docs/modules.zh.md#ackemcode)

AckemCode 是 Ackem 内嵌的通用智能体执行内核，包含模型与工具循环、会话、权限、计划、文件和终端、网页与文档工具、子智能体、MCP、LSP、技能、插件、CLI 与 Web UI。

Ackem 负责对话、记忆、人格和任务协调。本子包也可独立运行，不要求加载陪伴状态。

```powershell
npm ci
npm run typecheck
npm run build
npm run cli
```

以上命令在本子包目录运行。`npm run dev:server` 启动开发服务，`npm start` 运行编译服务。需要先配置模型及任务使用的外部工具/服务。

服务默认使用本机 8787。`ACKEMCODE_DATA_DIR` 可指定绝对数据路径。宿主适配有不同默认目录，也可能复用已有服务，应核对实际进程配置。

宿主托管会话携带授权、修订和回执绑定；新增工具或客户端应保持这些边界。工作目录本身不构成全机权限范围。

[接入、数据与凭据](../../docs/modules.zh.md#ackemcode) · [路由与任务](../../docs/architecture.zh.md#任务生命周期) · [源码验证](../../docs/development.zh.md#验证)
