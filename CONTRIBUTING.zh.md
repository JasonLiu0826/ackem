# 贡献指南

[English](CONTRIBUTING.md) · [架构导航](docs/architecture.zh.md)

欢迎修复问题、改进文档与可访问性，或贡献渠道、工具、内核与扩展能力。开始前先阅读当前源码，理解 Ackem 与 AckemCode 的边界。

## 先理解执行链

- Ackem：对话、记忆、人格情绪、chat / plugin / work 路由和任务协调。
- AckemCode：通用智能体循环、工具、会话、权限和执行回执。
- 托管任务、独立工作与 QQ / 微信代码桥接是不同入口。
- 旧电脑助手已经删除，新功能不应依赖其类型、IPC 或执行器。

[整体架构](docs/architecture.zh.md) · [路由与任务](docs/architecture.zh.md#任务生命周期) · [内核](docs/modules.zh.md#ackemcode)

## 开发与验证

当前 CI 使用 Windows / Node.js 22，主应用和内核分别安装、检查和构建：

```powershell
npm ci
npm --prefix parts/ackemcode ci
npm --prefix parts/ackemcode run build
npm run dev
```

```powershell
npm run typecheck
npx tsc --noEmit -p tsconfig.node.json
npm --prefix parts/ackemcode run typecheck
npm run build
```

根应用依赖 Electron preload；单独浏览器页面不能替代运行验收。根 build 脚本使用 Windows shell 语法，其他平台需按实际环境适配。详见[开发环境](docs/development.zh.md#环境与运行)。

公开仓库不分发完整本地测试套件，也没有根 `npm test` 脚本承诺。对改动执行有意义的验证，并说明真实模型、渠道、原生模块与平台的未验证范围。不要将提前退出或跳过当成通过。

## 提交流程

外部贡献通常采用分支和 PR；说明具体问题、最终行为、验证与限制。已获维护权限的协作者按约定自主处理日常维护、小功能和新模块；大功能、总体架构或项目方向调整先沟通。

保持改动聚焦，避免无关格式化。同步中英文文档，更新涉及的路由、任务状态、权限或存储说明。应用版本、内核包版本与扩展 API 版本不同，不要批量改成同一数字。

不要提交用户数据、内核配置/会话、凭据、日志、生成产物或本机路径。安全漏洞按 [SECURITY](SECURITY.zh.md) 报告。

## 扩展贡献

现有能力使用 plugin 路由；创建或修改能力通过 work / AckemCode。生成的代码仍需满足 Ackem 扩展协议、注册、权限与加载要求；内核插件不自动等同于 Ackem 扩展。

本机 `u/` 原型与官方 `ackem/` 扩展可贡献。`community/` 市场保持关闭，不作为当前可用功能宣传。

[扩展协议](docs/development.zh.md#扩展开发) · [OpenForU](src/main/extensions/openforu/PROTOCOL.md)

## 许可与行为

贡献遵循项目 [LICENSE](LICENSE)、[CLA](CLA.md) 与 [行为准则](CODE_OF_CONDUCT.zh.md)。第三方代码和素材保留来源及许可说明。
