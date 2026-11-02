> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../../README.md)。

# Ackem 架构文档

[English](README.md) · [项目说明](../../../README.zh.md)

先理解 **Ackem 负责交互、记忆与协调，AckemCode 负责通用任务执行**，再阅读子系统细节。原来的“脑、心、嘴、神经、时间”等划分描述陪伴子系统，不能覆盖当前整个项目。

| 阅读顺序 | 文档 | 内容 |
|---|---|---|
| 1 | [整体架构](00-overall-system.zh.md) | 进程、主线与核心边界 |
| 2 | [路由与任务生命周期](09-routing-and-tasks.zh.md) | chat / plugin / work、契约、执行、验收与交付 |
| 3 | [理解与记忆](01-brain-system.zh.md) | 陪伴事件解释、事实检索与记忆 |
| 4 | [人格、关系与情绪](02-heart-system.zh.md) | 状态更新与表达 |
| 5 | [Prompt 与回复](03-mouth-system.zh.md) | 上下文、模型、流式正文与工具 |
| 6 | [Embedding](04-neural-system.zh.md) | 向量检索与降级 |
| 7 | [扩展系统](05-extension-system.zh.md) | Skill / Plugin / OpenForU |
| 8 | [时间系统](06-time-system.zh.md) | 时间感知与陪伴节奏 |
| 9 | [数据层](07-data-layer.zh.md) | SQLite V22、任务持久化与兼容表 |
| 10 | [IPC 与内核接口](08-ipc-api.zh.md) | preload、任务、工作页及 HTTP / SSE |

## 当前系统关系

- 桌面聊天按 chat / plugin / work 选择处理方式。
- 托管任务经 TaskCoordinator / Repository 驱动内核，区分执行、验收和交付。
- 独立工作页直接驱动私有内核会话，保留独立队列。
- QQ / 微信目前仍有独立代码桥接，不应画成已完全接入桌面链路。
- 记忆同时包含检索事实与事件行动账本；人格情绪继续支持陪伴。
- 旧电脑助手已删除，执行入口为 work / AckemCode。

[AckemCode 内核](../../ackemcode-kernel.zh.md) · [渠道接入](../../ackem-code-bridge.zh.md) · [开发环境](../dev-setup.zh.md)

## 文档维护

各篇按当前源码说明模块边界与代码入口。旧版长篇说明、更新前公开文档和历史发行资料统一收进[旧文档归档](../../../../README.md)。公式、参数与启用状态以对应源码为准。

改变路由、任务状态、权限、存储或 IPC 时，同步相关篇目和中英文。产品应用版本、内核包版本、数据库版本、扩展 API 版本分别维护。历史安装包资料见 `docs/旧文档/公开文档/docs/releases/`。
