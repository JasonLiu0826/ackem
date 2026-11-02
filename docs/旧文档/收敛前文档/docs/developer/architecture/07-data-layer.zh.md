> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../../README.md)。

# 数据层：状态、记忆与任务持久化

[English](07-data-layer.md) · [架构索引](README.zh.md)

## SQLite 与文件

当前数据库位于活跃数据根的 `ackem.db`。[database.ts](../../../../../../src/main/db/database.ts) 按数据根管理连接、启用 WAL、外键和超时设置，并执行迁移与兼容补表。

[Schema 版本](../../../../../../src/main/db/schemaVersion.ts)当前为 **22**。早期“V10 / 18 张表”的清单不再代表整个数据库。

| 模块 | 存储职责 |
|---|---|
| `src/main/db/schemaV*.ts` | 按版本推进基础结构 |
| `schemaCompat.ts`、`schemaCommunity.ts` | 历史分支及 QQ / 空间表的幂等兼容 |
| `src/main/db/repos/` | 历史、状态和其他数据访问 |
| `src/main/memory/` | 事实、事件、行动、检索投影与记忆控制 |
| `src/main/tasks/repository.ts` | 任务契约、输入幂等、修订、事件与投影 |
| `src/main/tasks/communication.ts` | 任务通知 Outbox |
| `src/main/tasks/longTerm.ts` | 持续目标、规则、授权与决策 |
| `src/main/ackemcode/standaloneWorkService.ts` | 独立工作的持久输入队列 |

部分模块按需建表，不应把 schemaVersion 当成完整表目录。查看实际数据库结构时，应使用迁移副本或只读查询；不要以旧文档手工覆盖迁移版本。

## 记忆与执行事实

[MemorySystem](../../../../../../src/main/memory/memorySystem.ts) 提供 `record`、`recall`、`control`、`recover`。契约定义在 [contracts.ts](../../../../../../src/main/memory/contracts.ts)，区分聊天、插件、工作与记忆控制，以及意图、状态和证据来源。

事实检索、JSON 兼容文件与人类可读归档继续存在。它们与事件、行动记录各有用途，不能只依据某个 JSON 文件推断全部记忆状态。

托管任务保存目标版本、控制 epoch、契约、执行回执、验收和交付状态。结果正文与任务控制状态分离；停止或验收失败不得覆盖已保留的实际执行正文。

## 跨端与身份

`channels/conversation.ts` 合并渠道历史，`chat/unifiedChatHistory.ts` 处理桌面统一历史相关逻辑，`session/canonical.ts` 提供引擎会话。社会成员的身份与上下文由 `social/` 维护。共享显示历史不等于所有入口都使用相同任务生命周期。

## 数据目录与迁移

数据库不是唯一数据位置。Ackem 数据根、Electron userData、内核数据和工作目录分别管理。内核通过自己的 session/settings store 持久化，不直接依赖 Ackem 的 SQLite schema。

迁移先备份完整数据，退出相关进程，验证旧分支样本和重复启动的幂等性。兼容补表不能替代版本迁移设计；不要复用已有版本号定义另一套不同表结构。

[路径与数据](../../CODEBASE-PATHS.zh.md) · [备份](../../memory-format.zh.md) · [任务生命周期](09-routing-and-tasks.zh.md)
