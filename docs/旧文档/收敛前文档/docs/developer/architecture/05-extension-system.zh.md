> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../../README.md)。

# 扩展系统与 plugin 路由

[English](05-extension-system.md) · [架构索引](README.zh.md)

## 在整体架构中的位置

Ackem 有 chat / plugin / work 三种处理方式。plugin 代表使用当前可用扩展；work 使用 AckemCode 处理真实资源，也负责创建或修改扩展。

扩展系统本身包含 Skill、Plugin、OpenForU 与游戏模式等模块。它们是运行时模块分类，不能把每一类都当成新的聊天路由。

## 关键模块

| 路径 | 职责 |
|---|---|
| `extensions/coordinator.ts` | 引导、生命周期、注册与快照/事件交互 |
| `extensions/protocols.ts` | 快照、事件、生命周期与调度协议 |
| `extensions/skills/registry.ts` | Skill 注册、状态、调用与工具定义 |
| `extensions/plugins/registry.ts` | Plugin 注册与生命周期 |
| `extensions/dispatch/` | 候选目录、偏好、执行与兼容调度 |
| `channel/routeChannel.ts` | 桌面通道主分类 |
| `channel/executeChannel.ts` | 通道执行与插件回执 |
| `extensions/openforu/` | 本机用户扩展、设计部署、沙箱与 Surface |
| `extensions/gamemode/` | 游戏模式接入 |
| `extensions/ecosystem/` | 市场包、兼容版本与签名协议；市场当前关闭 |

## 调用和创建

使用请求先根据启用目录匹配真实目标，再执行并记录结果。目录中的 planned、disabled、error 条目不能冒充可调用能力；基础能力是否强制启用以 `shared/coreExtensions.ts` 为准。

创建/修改走 work，不把聊天中提到“插件”一律解释成调用。生成了源码还需要正确 manifest、权限、注册与可调用实现。主聊天通道分类与扩展内部 Dispatch 是不同层次。

## OpenForU 与内核插件

`u/` 扩展从活跃数据根的 `openforu/` 加载。源代码中的模板和示例不会自动当作用户扩展安装。Plan 工作区、部署、Worker 隔离与 Surface 窗口仍属于该子系统，不能据此宣称整个项目只通过 Plan 执行。

AckemCode 的技能、MCP 和插件加载是内核能力；不会自动进入 Ackem 的扩展 registry。跨边界集成需要适配协议与生命周期。

## 权限与状态

扩展只能按其协议和权限访问资源。扩展目录、staging、网络白名单不等于 work 的全局权限。用户关闭某扩展应使其退出可用候选；已尝试执行后的失败应通过真实状态反馈。

扩展可能有持续运行、窗口或后台 hook。停止插件与停止内核任务不是同一操作，需调用对应控制入口。

## 文档与维护

[开发协议](../DEVELOPER-EXTENSION-PROTOCOL.zh.md) · [OpenForU 协议](../../../../../../src/main/extensions/openforu/PROTOCOL.md) · [路由与任务](09-routing-and-tasks.zh.md) · [内核](../../ackemcode-kernel.zh.md)

应用版本与扩展 API 校验常量分开维护；新增模块不要直接沿用旧文档中的版本范围。能力目录和权限说明应随 manifest 与实际实现更新。
