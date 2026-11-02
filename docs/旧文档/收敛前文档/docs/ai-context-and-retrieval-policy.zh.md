> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# 上下文、记忆与执行证据

[English](ai-context-and-retrieval-policy.md) · [隐私](privacy-and-data.zh.md)

## 不同入口使用不同上下文

Ackem 主对话、语义路由、托管监督与 AckemCode 执行各自组装模型输入。不能把主对话的 Tier B 字符预算理解为整个项目的唯一上下文预算。

| 上下文 | 主要来源 |
|---|---|
| 主对话 | 用户本轮、近期历史、人格/情绪、Canon、检索记忆、运行架构、任务事实 |
| 路由 | 本轮意图、近期对话、已启用能力目录 |
| 托管任务 | 当前契约、目标、约束、权限、工具结果、回执与验收信息 |
| 独立内核 | 会话历史、系统提示、工具/技能与实际资源内容 |
| 渠道 | 对应渠道在场约束、人格记忆、统一会话与渠道输入 |

核心代码：`context.ts`、`prompt/`、`engine/orchestrator.ts`、`channel/classifyIntent.ts`、`tasks/runtime.ts` 和内核 `server/agent/`。

## 记忆检索与写入

主对话采用检索后注入，而非把全部事实库放入单次 Prompt。Tier A / Canon 提供稳定身份与状态相关信息，Tier B 选取相关事实、情节、关联或时间片段；具体注入仍受策略、预算与上下文控制。

原有 factStore、retriever、ingest、embedding 与归档继续使用。当前记忆门面还提供：
- `record`：聊天、路由、计划与执行证据；
- `recall`：读取相关事件和事实；
- `control`：纠正、静音、遗忘、删除等控制；
- `recover`：恢复待处理状态。

见 `memory/memorySystem.ts`、`memory/contracts.ts` 和相关 adapters。不要把单个 JSON 文件当成唯一权威，也不要把“记录了意图”当成“执行成功”。

## 任务事实与新旧版本

上下文可包含当前任务目标、执行、验收与交付状态。目标修订、controlEpoch、runId 与发布围栏共同避免旧轮次替代新目标。旧回执保留用于事实溯源，不应当结算当前任务。

工具结果、用户陈述、模型推断与运行回执拥有不同证据属性。没有真实执行结果时，不编造文件内容、进度、检查或完成。

## 预算与降级

检索、历史裁剪、内核上下文压缩与托管任务预算各由对应模块控制。Embedding 不可用时可使用可用的关键词/全文等检索路径；路由失败、任务数据库不可用或执行证据缺失则必须如实说明未派工/未执行，不能统称为无影响的“正常降级”。

## 数据出站

被选入模型上下文的记忆、文件正文和工具结果会发往所配置的模型服务。搜索、MCP 与渠道还可能向对应服务发送数据。本地存储不是无出站保证。

[记忆与理解](developer/architecture/01-brain-system.zh.md) · [数据层](developer/architecture/07-data-layer.zh.md) · [任务生命周期](developer/architecture/09-routing-and-tasks.zh.md) · [内核](ackemcode-kernel.zh.md)
