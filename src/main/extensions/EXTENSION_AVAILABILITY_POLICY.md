# 扩展可用性与失败反馈

当前主聊天按 chat / plugin / work 选择职责。扩展是否可调用，由真实 registry、catalog、manifest 与实现共同决定。

## 进入候选的条件

- 需要实际安装或注册的实现，具备对应 handler / hooks / invoke / Surface。
- 运行状态须为 active；planned、disabled、error 不能作为已可用能力。
- 可调用目标须满足 dispatch 与 catalog 的要求；后台 hook 不必等同于可调用插件。
- 官方与本机 OpenForU 扩展按同一状态原则处理。
- 基础扩展例外以 `src/shared/coreExtensions.ts` 和强制激活实现为准，管理面不能随意关闭。

## 缺少能力时

从可用目录移除不可用项，避免向模型提供虚假的工具。可继续交流、解释或澄清；创建/修改能力使用 work / AckemCode，并遵守当前编排及权限。

不能把“没有运行”写成“已经做完”。路由分类失败、能力未绑定、执行报错、缺少回执应分别按实际状态说明。反馈可用简短自然语言，不必暴露内部栈，但不得隐去用户请求实际没有完成的事实。

## 执行与管理分开

管理面返回启用、关闭、安装或权限操作的实际结果。运行面在每个调用入口检查 active 或使用已过滤目录；不要在 IPC 中硬编码绕过状态。

正在运行的插件可能需要单独停止生命周期或 Surface。关闭目录项、停止插件、停止 work 内核任务分别处理；不要假定一种操作会完成全部控制。

## 权限边界

扩展网络、文件、Worker 和 staging 限制属于扩展自身，不是 AckemCode 的全局权限。内核插件也不自动进入 Ackem registry。

相关实现：`extensions/coordinator.ts`、`skills/registry.ts`、`plugins/registry.ts`、`dispatch/`、`channel/routeChannel.ts`、`channel/executeChannel.ts`。

[扩展协议](../../../docs/development.zh.md#扩展开发) · [任务生命周期](../../../docs/architecture.zh.md#任务生命周期)
