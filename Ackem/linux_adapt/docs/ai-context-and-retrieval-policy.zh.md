# AI 上下文与检索策略

> **语言：** 中文 · [English](./ai-context-and-retrieval-policy.md)

> **产品**：Ackem v1.0.0  
> **核心承诺**：记忆是检索后注入的——绝不会将全部记忆倒入 LLM 上下文。

---

## 1. 设计原则

Ackem **不会** 将你的全部记忆加载到 LLM prompt 中。它遵循 **检索增强** 的方式：

1. 每轮对话中，编排器只选取最相关的记忆片段
2. 这些片段被格式化为紧凑的上下文块，放入 system prompt
3. LLM 看到的是聚焦的子集，而非全部历史

这样可以控制 prompt 成本、保护隐私，并避免用无关信息淹没模型。

---

## 2. 记忆层级

| 层级 | 内容 | 始终注入？ | 来源 |
|------|------|-----------|------|
| **Tier A** | 伴侣快照（自我身份、当前情绪、关系摘要） | 是 | `companion/self.md`、编排器状态 |
| **Tier B** | 检索到的事实、情节记忆、知识图谱关联 | 否 — 按相关性选取 | `retriever.ts`、`factStore`、`vectorStore` |
| **Canon** | 创造者身份、Ackem 起源、不可改写的性格种子 | 是 | `canon/ackemCanon.ts`、`creatorMemorySeed.ts` |

Tier A 和 Canon 构成每个 system prompt 的稳定部分。Tier B 每轮动态组装。

---

## 3. 读路径（记忆如何进入 LLM）

```
用户消息
    │
    ▼
┌──────────────────────────────────────────────────┐
│ 编排器（Pre-LLM）                                  │
│                                                    │
│  1. L0 解释器 → 事件类型                            │
│  2. L1 关系更新                                    │
│  3. 触发词匹配                                     │
│  4. 全文搜索（FTS5）                               │
│  5. 语义搜索（jaccard + tf-idf）                   │
│  6. Embedding 向量搜索（ONNX 可用时）              │
│  7. 关联扩散（知识图谱）                            │
│  8. 时间锚点匹配                                   │
│                                                    │
│  → 合并、去重、按相关性评分                         │
│  → 构建 tierBBlock（字符预算上限）                   │
└──────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────┐
│ context.ts                                        │
│                                                    │
│  · Tier A（伴侣快照）                              │
│  · Canon（创造者与起源）                           │
│  · Tier B（检索到的记忆）                          │
│  · psycheBlock（情绪/关系状态）                    │
│  · 扩展上下文注入                                  │
│  · 对话历史（最近消息）                            │
│                                                    │
│  → 组装为 system + messages → 发往 LLM             │
└──────────────────────────────────────────────────┘
```

### 检索方法（大致优先级排序）

| 方法 | 运行时机 | 依赖 |
|------|----------|------|
| 触发词匹配 | 始终（同步） | FactStore 触发词索引 |
| 全文搜索（FTS5） | 始终 | SQLite FTS 索引 |
| 语义搜索 | 始终 | `semanticSearch.ts` |
| Embedding 向量搜索 | ONNX 运行时可用时 | `memory/embedding/onnxProvider.ts` |
| 关联扩散 | 知识图谱可用时 | `associationColdStart.ts`、`knowledgeGraph.ts` |
| 时间锚点 | 检测到时间信号时 | `temporalAnchorPolicy.ts` |

### 预算与上限

所有 Tier B 内容受 **字符预算**（`TIER_B_CHAR_BUDGET`）限制。若检索到的内容超出上限，按相关性评分截断：

```
TIER_B_CHAR_BUDGET  →  注入记忆的最大字符数
MIN_CONFIDENCE      →  注入的最低置信度门槛
```

---

## 4. 写路径（记忆如何存储）

```
LLM 回复后
    │
    ▼
┌──────────────────────────────────────────────────┐
│ MemoryIngestPipeline.afterTurnAsync               │
│                                                    │
│  阶段 1 — 轻量提取（同步）                          │
│  · 捕获情绪上下文                                  │
│  · 提取简单的规则事实                               │
│  · 写入时间锚点                                    │
│  · 运行自动镜像与矛盾检测                           │
│                                                    │
│  阶段 2 — LLM 提取（异步任务）                      │
│  · 事实提取器：领域/主题/摘要                       │
│  · 情节提取器：叙事片段                             │
│  · 三元组提取器：知识图谱边                         │
│  · 合并去重器：衰减、自动退休                       │
│                                                    │
│  阶段 3 — 持久化                                   │
│  · 写入 FactStore（facts.v2.json + SQLite）         │
│  · 写入情节存储                                    │
│  · 写入知识图谱                                    │
│  · 更新 Embedding 缓存                             │
└──────────────────────────────────────────────────┘
```

### 安全护栏

- **Canon 守卫**：与 Ackem 创造者 canon 矛盾的事实被拒绝
- **隐私级别**：事实标记 `normal` / `intimate` / `explicit`；explicit 事实仅在成人模式启用时注入
- **自动退休**：低置信度或过时的事实会在衰减期后自动退休
- **用户事实守卫**：特定类型的用户事实会被过滤

---

## 5. 优雅降级

当组件不可用时，Ackem 的检索管线自适应：

| 缺失组件 | 行为 |
|----------|------|
| ONNX runtime / embedding 模型 | 降级到 FTS5 + 语义（TF-IDF）搜索 |
| 知识图谱 | 降级到无关联扩散的平面事实检索 |
| 无记忆 | 伴侣仅基于 Tier A + Canon 运行 |

Embedding 不可用时，设置中会显示 **降级** 指示。用户仍可正常聊天——检索会变粗略但功能正常。

---

## 6. 隐私

- 记忆数据 **绝不离开你的机器**，除非作为 prompt 的一部分发送到你配置的 LLM 地址
- Ackem **没有默认遥测**——对话内容、记忆和使用模式不会被上传
- LLM 地址完全由你控制：云端 API 或本地推理服务器均可
- 记忆以明文 `.md`/`.json` 文件和 SQLite 存储——你可以通过 `data/` 审计、备份或删除所有内容

---

## 7. 相关文档

| 文档 | 内容 |
|------|------|
| [memory-format.zh.md](./memory-format.zh.md) | 数据目录结构 |
| [architecture/01-brain-system.md](./developer/architecture/01-brain-system.md) | 脑系统（L4 记忆） |
| [architecture/04-neural-system.md](./developer/architecture/04-neural-system.md) | 神经系统（Embedding） |
| [architecture/00-overall-system.md](./developer/architecture/00-overall-system.md) | 完整对话生命周期 |

*AI 上下文与检索策略 · Ackem v1.0.0 · 2026-06*
