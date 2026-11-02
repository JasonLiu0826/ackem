> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../../README.md)。

# 时间感知与陪伴节奏

[English](06-time-system.md) · [架构导航](README.zh.md)

时间能力分布在时钟、时间语义解析、记忆调制和陪伴策略中。长期任务监督与内核定时工具有独立的生命周期；普通对话中的时间提示本身不会创建定时任务。

```mermaid
flowchart TB
    accTitle: 陪伴时间感知的上下文流
    accDescr: 时钟与时间语义信号影响检索、情绪和特殊日期提示，再注入心理块。

    user_message["用户消息"]
    prepare_time["准备时间上下文<br/>时钟 · 间隔 · 语义信号"]
    temporal_recall["检索调制<br/>时间权重与锚点"]
    emotion_time["情绪调制<br/>星期 · 节日 · 重逢"]
    special_dates["特殊日期与时间感慨"]
    psyche_context["心理块与 Prompt 提示"]

    user_message --> prepare_time
    prepare_time --> temporal_recall
    prepare_time --> emotion_time
    prepare_time --> special_dates
    temporal_recall --> psyche_context
    emotion_time --> psyche_context
    special_dates --> psyche_context

    classDef neutral fill:#f3f4f6,stroke:#6b7280,stroke-width:1.4px,color:#1f2937
    classDef primary fill:#dbeafe,stroke:#2563eb,stroke-width:1.6px,color:#1e3a5f
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:1.6px,color:#3b0764
    class user_message neutral
    class prepare_time,temporal_recall,emotion_time,special_dates primary
    class psyche_context accent
```

## 主要实现

| 模块 | 代码入口 | 职责 |
|---|---|---|
| 时钟与时区 | [memory/temporal/clock.ts](../../../../../../src/main/memory/temporal/clock.ts) | 统一时间读取；时区规则见 timezonePolicy.ts |
| 时间语义 | [memory/temporal/temporalParser.ts](../../../../../../src/main/memory/temporal/temporalParser.ts) | 解析对话中的时间范围与表达 |
| 检索调制 | [memory/temporalContextModulator.ts](../../../../../../src/main/memory/temporalContextModulator.ts) | 将时间信号纳入记忆上下文 |
| 特殊日期 | [engine/temporalAwareness/specialDateDetector.ts](../../../../../../src/main/engine/temporalAwareness/specialDateDetector.ts) | 检测生日、纪念日等时间提示 |
| 主动时间提示 | [engine/temporalAwareness/temporalProactiveTrigger.ts](../../../../../../src/main/engine/temporalAwareness/temporalProactiveTrigger.ts) | 产生供陪伴策略使用的时间信号 |
| 长期工作 | [tasks/longTerm.ts](../../../../../../src/main/tasks/longTerm.ts) | 处理托管长期目标，与陪伴时间提示分开 |

## 阅读时需要区分

- 时间锚点参与记忆召回；特殊日期和时间深度参与心理块与表达。是否主动发言仍受对应策略和状态限制。
- 涉及“今天、明天、上周”等范围时，应同时核对用户时区、解析窗口和实际时间来源。
- 持续规则、长期目标、定时工具和用户授权需在各自执行链中核验，不能从一段时间感慨推导出后台任务。

[任务生命周期](09-routing-and-tasks.zh.md) · [AckemCode 内核](../../ackemcode-kernel.zh.md)

[旧版长篇说明](../../../../公开文档/docs/developer/architecture/06-time-system.zh.md)仅供历史追溯，当前职责以本篇、路由文档与实际源码为准。
