# Ackem 扩展系统

本目录实现 Ackem 的 Skill、Plugin、OpenForU 与游戏模式接入。它与 `parts/ackemcode` 内核的技能、MCP、插件加载接口分别管理。

## 与三级路由的关系

| 请求 | 处理 |
|---|---|
| 交流、解释、内容回应 | chat |
| 使用已有且启用的扩展能力 | plugin |
| 创建或修改扩展、操作真实文件与项目 | work / AckemCode |

模块类型不是额外的聊天通道。主聊天先做语义路由，再由目录和运行时核验目标；不能把旧 Dispatch Create → Plan 当成当前唯一入口。

## 代码地图

| 路径 | 职责 |
|---|---|
| `coordinator.ts`、`protocols.ts` | 运行时组装、快照、事件与生命周期 |
| `skills/` | Skill 类型、registry、handler 与内置能力 |
| `plugins/` | Plugin 类型、registry、hooks 与内置能力 |
| `dispatch/` | 能力候选、偏好、执行及兼容调度 |
| `openforu/` | 本机用户扩展、模板、Plan、部署、沙箱与 Surface |
| `gamemode/` | 游戏模式协议与接入 |
| `policy/` | 主动行为、强度与偏好等策略 |
| `ecosystem/` | 版本校验、签名与包格式；社区市场当前关闭 |

## 编写和接入能力

1. 先确认是否已有实现，避免重复建设。
2. 使用对应的 Skill / Plugin 类型与 manifest；通过协议快照和事件交互。
3. 为可调用能力配置 dispatch，注册可用实现并核对 active 状态。
4. 本机用户原型放在活跃数据根的 `openforu/uskills/` 或 `uplugins/`。源码模板不是安装目录。
5. 验证权限、调用、回执、关闭/停止与失败反馈。
6. 贡献官方源码时按贡献指南提交；社区市场保持关闭。

应用、内核与扩展 API 版本不同。当前兼容常量以 `ecosystem/constants.ts` 为准，不直接用根应用版本替换 manifest 范围。

扩展目录、staging 与网络白名单只约束对应扩展，不构成 AckemCode 的全局文件访问边界。不可用能力不进入可调用目录；已尝试但失败的操作应如实说明。

## 文档与模板

- [当前扩展接口](../../../docs/development.zh.md#扩展开发)
- [扩展架构](../../../docs/development.zh.md#扩展开发)
- [路由与任务](../../../docs/architecture.zh.md#任务生命周期)
- [可用性策略](EXTENSION_AVAILABILITY_POLICY.md)
- [占位文件说明](STUB_FILES.md)
- [Skill 目录](skills/builtin/CATALOG.md) · [Plugin 目录](plugins/builtin/CATALOG.md)
- [OpenForU 协议](openforu/PROTOCOL.md)
- [uskill 模板](openforu/uskills/_template/README.md) · [uplugin 模板](openforu/uplugins/_template/README.md)
