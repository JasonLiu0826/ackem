# Ackem 七系统 + 数据层 + IPC 架构（开发者）

> **语言：** 中文 · [English](./README.md)

> **产品版本**：Ackem **v1.0.0**  
> **读者**：接手代码的开发者、扩展作者、架构审查  
> **代码权威**：以 `src/main/` 为准；本文档与代码冲突时 **以代码为准**

---

## 架构哲学

Ackem 不是「聊天框套壳」。它是一个 **有状态的本地 AI 伴侣**，围绕一个核心设计原则构建：

**认知 → 情感 → 表达 → 语义 → 执行 → 时间感知**，六层协作，外加数据层、IPC 与应用壳。

每一层解决一个独立的问题域，有自己的数据模型和运行时边界：

```
用户消息
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│  ① 脑 (Brain)    理解用户意图，召回相关记忆                   │
│                    L0 解释器 + L4 记忆检索                    │
└────────────────────────┬────────────────────────────────────┘
                         │ Event + tierBBlock
┌────────────────────────┴────────────────────────────────────┐
│  ② 心 (Heart)    维护关系状态、情绪模型、表达策略             │
│                    L1 关系 FSM + L2 四维情绪 + L3 心理块      │
└────────────────────────┬────────────────────────────────────┘
                         │ psycheBlock + ExpressionHint
┌────────────────────────┴────────────────────────────────────┐
│  ③ 嘴 (Mouth)    组装 Prompt，调用 LLM                      │
│                    六层 System Prompt + 流式调用              │
└────────────────────────┬────────────────────────────────────┘
                         │ LLM 回复流
                         ▼
                     ┌──────────┐
                     │  用户 UI  │
                     └──────────┘

  ④ 神经 (Neural)  ──►  Embedding/向量，为脑提供语义基础设施
  ⑤ 扩展 (Extension) ─►  Skill/Plugin/OpenForU，为嘴注入外部能力
  ⑥ 整体 (Overall)  ──►  Electron 壳 + IPC + 持久化
  ⑦ 时间 (Time)    ──►  时间感知、作息曲线、重逢冲击、感慨

  — 数据层 (Data)   ──►  SQLite Repository、迁移、WAL
  — IPC 接口        ──►  window.ackem.* preload 桥
```

---

## 阅读顺序

| 顺序 | 文档 | 一句话 | 行数 |
|------|------|--------|------|
| 1 | [整体系统](./00-overall-system.md) | Electron 壳、进程边界、一轮对话全链路、项目地图 | ~250 |
| 2 | [脑系统](./01-brain-system.md) | L0 意图理解 + L4 记忆检索（不调 LLM） | ~250 |
| 3 | [心系统](./02-heart-system.md) | L1 关系 FSM + L2 四维情绪 + L3 表达状态 + 涌现 | ~280 |
| 4 | [嘴系统](./03-mouth-system.md) | 六层 Prompt 组装 + LLM 调用 + 多任务 prompt 体系 | ~230 |
| 5 | [神经系统](./04-neural-system.md) | ONNX Embedding + Provider 降级 + 向量检索 | ~200 |
| 6 | [扩展系统](./05-extension-system.md) | Skill/Plugin/Dispatch 调度 + OpenForU 沙箱 | ~280 |
| 7 | [时间系统](./06-time-system.md) | 时间感知、作息曲线、重逢冲击、时间感慨 | ~200 |
| — | [数据层](./07-data-layer.md) | 18 表 SQLite Schema V1-V10 + Repository 模式 | ~250 |
| — | [IPC 接口](./08-ipc-api.md) | ~100+ window.ackem.* API + ~30 推送事件 | ~150 |

**相关文档**：
- [扩展接口协议](../DEVELOPER-EXTENSION-PROTOCOL.md)
- [AI 上下文与检索策略](../../ai-context-and-retrieval-policy.md)
- [数据目录格式](../../memory-format.md)
- [索引与规模](../../indexing-and-scale.md)

---

## L0–L4 层级与七系统对照

| 层级 | 名称 | 归属 | 核心文件 |
|------|------|------|----------|
| L0 | 事件解释 | **脑** | `engine/interpreter.ts` — 关键词 + 规则，零 LLM |
| L0.5 | 意图路由 | **脑** + **神经** | embedding 语义兜底 + Dispatch 路由 |
| L1 | 关系状态 | **心** | `engine/relationship.ts` — 阶段 FSM + 信任 + 裂痕 |
| L2 | 情绪模型 | **心** | `engine/emotion.ts` — 四维递推 + 噪声 + 调制 |
| L3 | 表达/心理块 | **心** | `engine/psyche.ts` — prompt 心理描写 |
| L4 | 记忆 | **脑** | `memory/retriever.ts` + `ingest.ts` — 多路召回 + 写入 |
| — | Prompt/LLM | **嘴** | `prompt/` + `context.ts` — 系统 Prompt 组装 |
| — | Embedding | **神经** | `memory/embedding/` — ONNX 推理 + Provider 抽象 |
| — | 扩展执行 | **扩展** | `extensions/coordinator.ts` — Dispatch + Skill/Plugin |
| — | 时间感知 | **时间** | `temporalAwareness/` — 假期/时段/作息/重逢/感慨 |
| — | 数据持久化 | **数据层** | `db/` — SQLite Repository、迁移、WAL 管理 |
| — | IPC 通信 | **IPC** | `ipc/` — 主进程 ↔ 渲染进程桥 |

---

## 数据流主线（一轮对话）

```
用户输入
  │
  ▼
ipc/chat.ts ────────────────────────────────── IPC 入口
  │
  ▼
extensions/dispatch/ ───────────────────────── Dispatch 路由
  │  plan? auto_invoke? invoke_surface? chat?
  │
  ▼
orchestrator.runPreLlmTurn()
  │  ├─ L0  interpretInput()          → Event
  │  ├─ L0.5 interpretWithEmbedding()  → 意图兜底
  │  ├─ L1  updateRelationship()      → 信任/阶段/气氛
  │  ├─ L2  emotionStep()             → 四维情绪
  │  ├─ L3  buildPsycheBlock()        → 心理描写块
  │  ├─ L4  retriever.retrieve()      → tierBBlock
  │  ├─     temporalAwareness/        → 时间/特殊日
  │  ├─     emergence/                → 长聊涌现
  │  └─     strategy/injectionPolicy  → 槽位竞争
  │
  ▼
context.ts ─────────────────────────────── 组装 system + messages
  │  Tier A + Tier B + Canon + psyche + 扩展注入 + 历史
  │
  ▼
LLM 流式调用 ───────────────────────────── 流式返回 → UI
  │
  ▼
MemoryIngestPipeline.afterTurnAsync() ──── 事实提取 + 落库
  │  状态持久化 state-persistence.ts
  │  扩展 afterAssistantMessage hook
  │
  ▼
下一轮等待
```

---

## 设计要点

| 设计决策 | 选择 | 理由 |
|---------|------|------|
| 进程模型 | Electron 主进程 + 渲染进程 | 原生桌面体验，直接访问文件系统与 SQLite |
| 语言 | TypeScript 全栈 | 主进程/渲染进程类型共享，降低认知成本 |
| 持久化 | SQLite + JSON + Markdown | SQLite 保证结构化查询性能，md/json 保证人类可审计 |
| 本地 ML | ONNX Runtime | 离线可用，隐私友好，bge-small 模型仅 ~30MB |
| LLM 接口 | OpenAI 兼容（仅此一种） | 事实标准，Ollama/LM Studio/云端均支持 |
| 扩展接口 | 协议边界 + EngineSnapshot | 防止扩展破坏引擎内核，保持架构整洁 |
| 记忆策略 | 检索后注入 | 不把全部历史塞进 prompt，控制成本与隐私 |

---

## 维护说明

- 改 **Pre-LLM 链路**：从 `engine/orchestrator.ts` 读起
- 改 **扩展接入**：读 `extensions/protocols.ts` + [05-extension-system.md](./05-extension-system.md)
- 改 **记忆进模型**：读 [04-neural-system.md](./04-neural-system.md) + [ai-context-and-retrieval-policy.md](../../ai-context-and-retrieval-policy.md)
- 改 **情绪/关系规则**：读 `engine/ackemParams.ts`（所有参数单一来源）

*Ackem Architecture · v1.0.0 · 2026-06*
