> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../../README.md)。

# IPC 与内核接口

[English](08-ipc-api.md) · [架构索引](README.zh.md)

## 接口边界

渲染层通过 preload 暴露的 `window.ackem` 访问宿主，不直接操作 Node.js 或 AckemCode 的托管会话。

| 来源 | 作用 |
|---|---|
| [preload/index.ts](../../../../../../src/preload/index.ts) | 真实暴露的 API、IPC 名称和订阅解除 |
| [renderer ackem.d.ts](../../../../../../src/renderer/src/ackem.d.ts) | 渲染层类型声明 |
| [main/ipc.ts](../../../../../../src/main/ipc.ts) | 主进程注册入口 |
| [main/ipc/](../../../../../../src/main/ipc) | 参数校验与业务委派 |
| [shared/](../../../../../../src/shared) | 共享协议与状态类型 |

本页列关键接口族，完整参数以代码为准，不维护容易失效的 API 数量承诺。

## 聊天

`chat:start` 进入当前编排与路由；`chat:stop` 控制聊天流。聊天正文、推理、状态、交付与任务通知分别有事件。

**停止聊天回复不等于停止所有工作任务。** 对具体任务使用任务停止接口，并核对执行回执。

附件由 `chat:captureAttachments` 等入口规范化；不要把用户任意字符串当成已授权、已读取的文件。

## 托管任务：window.ackem.tasks

| API | IPC | 职责 |
|---|---|---|
| `submit` | `tasks:submit` | 接受工作区托管输入 |
| `cancel` | `tasks:cancel` | 撤销对应输入请求 |
| `stop` | `tasks:stop` | 请求停止任务 |
| `list` / `snapshot` | `tasks:list` / `tasks:snapshot` | 授权范围内的投影 |
| `runQueuedNow` | `tasks:run-queued-now` | 调度队列 |
| `grantGoal` / `grantRule` | `tasks:goal-grant` / `tasks:rule-grant` | 显式本地用户的持续授权 |
| 事件订阅 | `tasks:event` | 任务状态变化 |

`tasks:submit` 属于托管区域；独立工作通过 `workbench:send`。持续授权不能由模型或引用文本冒充用户命令产生。

## 独立工作与监督：window.ackem.workbench

`open`、`snapshot`、`send`、`inputQueue`、`cancelInput`、`promoteInput` 对应会话与持久输入。`permission`、`answer`、`planDecision`、`abort` 管理权限与交互。CLI / 终端还有单独的打开、输入、缩放与关闭接口。

托管审批通过 supervision 接口处理。`workbench:event` 携带 taskId、turnId，并可带 goalRevision / controlEpoch。消费事件时需核对所属任务与版本；不能把旧 SSE 内容当成新目标结果。

订阅函数若返回解除函数，组件销毁时应调用。重放与状态恢复应以持久快照/回执为准，而非只依赖当前页面内存。

## 宿主到内核

[ackemcode/client.ts](../../../../../../src/main/ackemcode/client.ts) 处理桌面 HTTP / SSE，`chatClient.ts` 服务渠道桥接。内核 API 由 [server/index.ts](../../../../../../parts/ackemcode/src/server/index.ts) 定义，包括会话、聊天流、权限与交互、宿主任务控制和能力查询。

托管会话使用宿主绑定与任务控制元数据。新增 UI 不应绕过宿主校验直接访问托管内核会话。接口可用性应通过能力查询与实际响应判断。

## 已移除接口

旧电脑助手、调查、本机地图和旧任务计划的 preload / IPC 已删除。新实现使用 work / AckemCode，不注册这些旧事件。

[路由与任务](09-routing-and-tasks.zh.md) · [内核](../../ackemcode-kernel.zh.md)
