# 神经系统

> **语言：** 中文 · [English](./04-neural-system.md)

> **层级**：Embedding / 语义基础设施  
> **代号**：Neural Engine  
> **核心问题**：如何把文本变成可计算的语义向量？如何串联脑、心、嘴、扩展四大系统？  
> **设计原则**：降级不崩溃，冷启不阻塞，预热不重复

---

## 1. 定位

神经系统是 Ackem 的 **语义基础设施层**，本身不参与对话生成。它把文本转化为向量，让其他系统能 **理解语义而非仅匹配关键词**：

```
用户消息 "心情不好，想找人说话"
    │
    ▼
┌────────────────────────────────────────────────────────────┐
│  神经系统 · Embedding Pipeline                             │
│                                                            │
│  ① 基础设施层 (memory/embedding/)                         │
│     ONNX Runtime ─→ float[512] 向量                        │
│                                                            │
│  ② 应用层 (embedding/)                                    │
│     ┌──────────────┬──────────────┬──────────────────┐     │
│     │ AnchorVector │  RouteTable  │  TemporalSignal  │     │
│     │ 语义兜底分类   │ 扩展路由匹配   │ 时间语义检测      │     │
│     ├──────────────┼──────────────┼──────────────────┤     │
│     │   Scoring    │   Readiness  │   PreLlmWarmup   │     │
│     │ 情绪对齐/重排 │ 就绪状态机    │ 预计算缓存        │     │
│     └──────┬───────┴──────┬───────┴────────┬─────────┘     │
└────────────┼──────────────┼────────────────┼───────────────┘
             │              │                │
    ┌────────┴───┐   ┌──────┴──────┐   ┌────┴──────────┐
    │ 脑系统 L0  │   │ 扩展 Dispatch│   │ 脑系统 L4     │
    │ 语义兜底    │   │ 路由匹配     │   │ 向量搜索+时间  │
    └────────────┘   └─────────────┘   └───────────────┘
```

### 1.1 与其他系统的数据流

神经系统像一条 **神经网络**，每轮对话中所有系统都从中获取语义信息：

```
                         神经系统
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
    ┌───┴───┐        ┌───┴───┐         ┌────┴───┐
    │ 脑系统 │        │ 心系统 │         │ 扩展系统 │
    │        │        │        │         │         │
    │ L0 兜底│        │ 情绪   │         │ 路由    │
    │ L4 检索│        │ 对齐   │         │ 匹配    │
    │ 关联   │        │ 镜像   │         │ 意图    │
    │ 冷启动 │        │ 矛盾   │         │ 检测    │
    │        │        │ 检测   │         │         │
    └────────┘        └────────┘         └─────────┘
         │                │                    │
         └────────────────┴────────────────────┘
                        │
                   ┌────┴────┐
                   │ 嘴系统   │
                   │ (消费    │
                   │  检索结果)│
                   └─────────┘
```

**每轮对话的 Embedding 数据流**：

```
prepareTurnContext()
    │
    ├── embeddingProvider.embed(msg)          → queryEmbed
    │     传给 L0 语义兜底 (interpreter.ts)
    │     传给 L4 向量搜索 (retriever.ts searchAsync)
    │     传给 情绪对齐评分 (scoring.ts)
    │     传给 时间语义检测 (temporalSignalExtractor.ts)
    │     传给 扩展路由匹配 (routeTable.ts)
    │     传给 父亲指称解析 (creatorMemory.ts)
    │     传给 创造者记忆条目匹配 (orchestrator.ts)
    │
    ├── computeConversationEmbed(recentMsgs)  → conversationEmbed
    │     传给 主动回忆选择 (activeRecall.ts)
    │     传给 关联共现激活 (retriever.ts)
    │
    └── getCachedTemporalEmbeddings()
         └── detectTemporalSignal(queryEmbed) → temporalSemanticSignal
               传给 L4 时间语义检索 (retriever.ts FIX-007)
```

---

## 2. 双层架构

神经系统分两层设计，避免导入循环：

### 2.1 基础设施层 · `src/main/memory/embedding/`

| 文件 | 职责 |
|------|------|
| `types.ts` | `EmbeddingProvider` 接口、`ModelManifest`、`LocalModelId` |
| `provider.ts` | `createEmbeddingProvider()` 工厂 — 本地→远程→Noop 链 |
| `onnxProvider.ts` | ONNX Runtime 推理实现 — tokenizer + session + mean pooling |
| `modelManager.ts` | 模型文件生命周期 — 解压、下载(断点续传)、切换 |
| `bootstrapBundledModels.ts` | 启动时同步解压 bundled 模型 |

### 2.2 应用层 · `src/main/embedding/`

| 文件 | 职责 | 行数 |
|------|------|------|
| `anchorVectors.ts` | 94 锚定词 × 10 类别、语义中心计算、否定检测 | 488 |
| `semanticFallback.ts` | 将 embedding 分类映射回 EventType | — |
| `routeTable.ts` | 12 内置扩展路由表、构建/匹配/规则检查 | 247 |
| `scoring.ts` | 情绪对齐、语义重排、对话向量、画像推断、日记中心 | 205 |
| `embeddingReadiness.ts` | 就绪状态机 (idle→loading→syncing→warming→ready) | 80 |
| `preLlmWarmup.ts` | 模块级缓存(锚定/时间/父亲/创造者记忆) | 158 |
| `types.ts` | 应用层类型、置信阈值 | 150 |

---

## 3. Provider 架构

### 3.1 核心接口

```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
  dimension(): number
  name(): string       // 如 "local:bge-small-zh" | "remote:deepseek"
  ready(): boolean
  dispose(): void
}
```

### 3.2 三优先级链

`createEmbeddingProvider()` 永不抛异常，逐级降级：

```
① 本地 ONNX
   if activeModel !== 'none' && isOnnxRuntimeAvailable() && 模型已解压
   → OnnxEmbeddingProvider
   │ 延迟: 10-50ms · 离线可用 · 完全本地

② 远程 API
   if remote.url 已配置
   → RemoteEmbeddingProvider (OpenAI 兼容)
   │ 延迟: 100-500ms · 需网络 · 发到远程
   │ 首次调用 embed('test') 连通性验证, 5s 超时

③ Noop 降级
   → NoopEmbeddingProvider
   │ ready() 始终 false
   │ 下游 VectorStore 自动切到 TF-IDF 兜底
```

### 3.3 RemoteEmbeddingProvider

支持任何 OpenAI 兼容的 embedding API：

```typescript
class RemoteEmbeddingProvider {
  // 维度猜测: model.includes('small') → 512, 否则 1536
  // 请求格式: POST { model, input: texts }
  // 认证: Authorization: Bearer ${apiKey}
  embedBatch(texts) → POST → json.data[].embedding
}
```

### 3.4 Provider 配置变更检测

`engineCache.ts` 管理 provider 生命周期。当用户切换模型或配置远程 API 时自动重建：

```
providerConfigSignature = `${activeModel}|${remoteUrl}|${remoteModel}`

getOrInitEmbeddingProvider(dataRoot):
  if 配置签名不变 → 返回缓存的 provider
  if 配置签名变了:
    ① 释放旧的 provider
    ② 作废 Pre-LLM 预热缓存
    ③ 创建新的 provider
    ④ 后台重建全部事实 embedding (scheduleEmbeddingRebuild)
```

---

## 4. ONNX Runtime 推理引擎

**文件**：`src/main/memory/embedding/onnxProvider.ts` (439 行)

### 4.1 模型文件结构

```
{modelDir}/
├── model.onnx          # ONNX 格式模型
├── tokenizer.json      # BPE 词表
└── config.json         # max_position_embeddings + hidden_size
```

### 4.2 支持的模型

| 模型 | 维度 | 压缩 | 解压 | 来源 | 中文效果 |
|------|------|------|------|------|----------|
| **bge-small-zh** | 512 | 35MB | 90MB | bundled | ★★★★ |
| **bge-small-en** | 512 | 40MB | 130MB | bundled | ★★★★ |
| m3e-small | 512 | 35MB | 90MB | downloadable | ★★★★ |
| bge-base-zh | 768 | 150MB | 400MB | downloadable | ★★★★★ |

bundled = 随安装包分发，启动时自动解压。downloadable = 按需从 GitHub Releases 下载（国内镜像 Gitee）。

### 4.3 推理全流程

```
embed(text):
    │
    ├── ① Tokenize (简化 BPE)
    │     [CLS] → 逐字符查 vocab (优先 2-char 匹配) → [SEP]
    │     尝试 BERT-style ## 前缀 → 未命中则 [UNK]
    │     pad 到 maxLen (默认 512)
    │
    ├── ② 创建 ONNX Tensor
    │     input_ids:      BigInt64Array [1, maxLen]
    │     attention_mask: BigInt64Array [1, maxLen]
    │     token_type_ids: BigInt64Array [1, maxLen]
    │
    ├── ③ session.run()
    │     ONNX Runtime InferenceSession
    │     输入名: input_ids / attention_mask / token_type_ids
    │
    ├── ④ 后处理
    │     if shape = [batch, hidden]       → 直接使用 (已池化)
    │     if shape = [batch, seq, hidden]  → mean pooling
    │        pooled[h] = Σ(data[s][h]) / validTokens
    │
    └── ⑤ L2 归一化
          norm = sqrt(Σ(vec[h]²))
          vec[h] = vec[h] / norm
          → float[512]
```

**批处理**：最多 8 条一批 (`BATCH_SIZE = 8`)。单条走单条推理路径，多条走批量路径。

**输出维度探测**：启动时用短输入异步探测实际 hidden_size，覆盖 config.json 默认值。

### 4.4 onnxruntime-node 可用性

`isOnnxRuntimeAvailable()` 动态检测：

```typescript
function isOnnxRuntimeAvailable(): boolean {
  try {
    ort = require('onnxruntime-node')  // optionalDependency
    return true
  } catch {
    return false  // 用户未安装 → 走降级
  }
}
```

---

## 5. 模型管理

**文件**：`src/main/memory/embedding/modelManager.ts`

### 5.1 存储布局

```
安装目录 resources/models/          ← bundled zip
  ├── bge-small-zh-v1.5.onnx.zip
  └── bge-small-en-v1.5.onnx.zip

data/models/                        ← 解压/下载目标
  ├── bge-small-zh/
  │   ├── model.onnx
  │   ├── tokenizer.json
  │   └── config.json
  ├── bge-small-en/
  └── .model-state.json              ← 当前激活模型
```

### 5.2 生命周期

```
ensureModelExtracted(id, dataRoot):
  ① 检查解压目录存在
  ② 从 bundled zip 解压 (PowerShell Expand-Archive / unzip)
  ③ 从开发缓存种子 (.test-cache/models/)
  ④ 返回 { modelDir, success }

downloadModel(id, dataRoot, onProgress, signal):
  ① 获取 manifest (URL + mirrorUrl)
  ② 检查已有 .downloading 部分下载 → 断点续传
  ③ 主 URL → 失败 → mirror URL
  ④ doDownload(): 重定向(最多5次) + Range 请求 + 每200ms进度回调
  ⑤ 下载完成 → 重命名 .zip → 解压 → switchModel()

switchModel(id, dataRoot):
  ① 写入 .model-state.json { activeModel, version, dimension }
  ② 触发 engineCache.scheduleEmbeddingRebuild()
```

### 5.3 启动时引导

**文件**：`bootstrapBundledModels.ts`

```typescript
// 在 index.ts 中同步调用, 不阻塞 UI
bootstrapBundledEmbeddingModels(dataRoot):
  for each bundled model (bge-small-zh, bge-small-en):
    ① 检查 data/models/{id}/model.onnx 存在
    ② 不存在 → 从 resources/ 解压
    ③ 存在 → 跳过
  if 当前无激活模型 && locale 默认模型已解压:
    自动激活 bge-small-zh (中文) 或 bge-small-en (英文)
```

---

## 6. 向量存储 · VectorStore

**文件**：`src/main/memory/vectorStore.ts` (256 行)

### 6.1 双缓存设计

VectorStore 维护 **两套独立的向量缓存**：

```
VectorStore
│
├── 稀疏 TF-IDF 向量 (always)
│   build(facts): 从 facts 构建 TF-IDF 索引
│   分词: CJK 标点分割, 全词 + 字符双字母组
│   TF: count / maxTf
│   IDF: log((1+N)/(1+df)) + 1
│   → Map<termId, float>[]
│
└── 稠密 Embedding 向量 (当 provider 就绪)
    buildDenseCache(facts): 批量 embedding
    → { factId, vec: float[], norm }[]
```

### 6.2 搜索策略

```
searchAsync(query, topK, queryEmbed?):
    │
    if 稠密缓存就绪 && (queryEmbed 或 embedQuery 可用):
    │   └── searchByDenseVector(qVec, topK)
    │        cosine = dot(qVec, factVec) / (qNorm * norm)
    │        过滤 score > VECTOR_SEARCH_MIN_SCORE (0.05)
    │        排序取 topK
    │
    else:
        └── search(query, topK)  ← TF-IDF 兜底
             vectorizeQuery(query) → TF-IDF 稀疏向量
             余弦相似度计算
             过滤 + 排序 + topK
```

### 6.3 缓存持久化

稠密向量通过 `factEmbeddingsRepo.ts` 持久化到 SQLite：

```
fact_embeddings 表:
  fact_id   TEXT PRIMARY KEY
  model_sig TEXT           ← provider.name()，切换模型时全量重建
  dim       INTEGER
  updatedAt TEXT
  vector    BLOB           ← Float32Array 的二进制 (每维度 4 字节)

缓存失效: computeCorpusHash(activeFacts) = hash(id + updatedAt)
  增量: 只 embed 缺失的事实
  全量: 当模型签名变更 / corpusHash 不匹配时
```

### 6.4 嵌入事实缓存 · factEmbeddingCache

**文件**：`src/main/memory/factEmbeddingCache.ts`

除 VectorStore 的稠密缓存外，还有一个独立的 `factEmbeddingCache`：

```typescript
class FactEmbeddingCache {
  private cache: Map<string, number[]>  // factId → vector

  build(facts, provider):   // 全量构建
  get(id): number[]         // 单条获取
  set(id, vec): void        // 单条设置
  delete(id): void          // 删除
  size(): number            // 数量
}

// 通用余弦相似度函数 (整个代码库共用)
cosineSimilarity(a, b): number
```

---

## 7. 应用层 — 锚定向量与语义兜底

**文件**：`src/main/embedding/anchorVectors.ts` (488 行)

这是 embedding 应用层的核心模块，提供 **无 LLM 的语义分类** 能力。

### 7.1 锚定词体系

94 个精心设计的锚定词，覆盖 10 个语义类别：

```
通用 (74 词, 7 类)             成人模式 (20 词, 3 类)
─────────────────────         ─────────────────────
vulnerable    脆弱  20 词      adult_suggestive  性暗示  8 词
praise        赞美  10 词      adult_dominant    支配    6 词
hurtful       伤害  12 词      adult_submissive  臣服    6 词
apology       道歉   8 词
cold          冷漠   8 词
tease         挑逗   8 词
question      提问   8 词
```

中英文各有独立锚定词，由 `getLocale()` 自动选择。

### 7.2 语义中心计算

```
buildAnchorVectors(provider):
  对每个类别, 批量 embedding 该类别的所有锚定词
  → 取向量平均值 = 该类别的"语义中心"

AnchorVectors = {
  vulnerable: float[512],   // 脆弱类别的语义中心
  praise: float[512],       // 赞美类别的语义中心
  hurtful: float[512],      // ...
  ...
  adult_suggestive?: float[512],  // 成人模式可选
  adult_dominant?: float[512],
  adult_submissive?: float[512],
}
```

### 7.3 语义兜底分类

```
classifyBySemantics(queryEmbed, anchors, mode):
    │
    for each category:
        score = cosineSimilarity(queryEmbed, anchors[cat])
    │
    best = max(score)
    │
    if best < MID_CONFIDENCE_THRESHOLD (0.45):
        return null  ← 未命中
    │
    confidence = best >= HIGH_CONFIDENCE_THRESHOLD (0.70)
                ? 'high' : 'medium'
    │
    return { category, score, confidence }
```

### 7.4 否定检测

```
detectNegation(msg, category):
  中文否定词: 不 / 没 / 别 / 才 / 非
  英文否定词: not / don't / never / no / can't / ...

  if 消息含否定词 (在目标词前 6/12 字符窗口内):
     否定反转映射:
       praise    → hurtful
       vulnerable → cold
       apology   → hurtful
       tease     → cold
```

### 7.5 与 L0 解释器的集成

```
interpretInputWithEmbedding(msg, queryEmbed, anchors):
  ① 先跑纯规则路径 (interpretInput)
  ② if 规则命中非 casual_chat → 直接返回规则结果
  ③ if 规则结果是 casual_chat:
       applyEmbeddingFallback(queryEmbed, anchors)
       if 命中 → 用 embedding 分类覆盖事件类型
       if 未命中 → 保持规则结果
```

这个设计确保 **零延迟的 L0 路径** 始终优先，embedding 仅作为关键词规则未命中时的语义兜底。

---

## 8. 应用层 — 路由表 (扩展调度)

**文件**：`src/main/embedding/routeTable.ts` (247 行)

### 8.1 内置路由表

12 个内置扩展，每个 5-10 条用户典型询问：

| 扩展 | exampleQueries |
|------|---------------|
| `ackem/weather-sense` | 帮我查天气, 明天会下雨吗, 需要带伞吗 ... |
| `ackem/web-search` | 帮我搜一下, 查一下这个什么意思 ... |
| `ackem/sedentary-reminder` | 坐得腰疼, 该站起来了吧, 脖子好酸 ... |
| `ackem/drink-water-reminder` | 该喝水了, 好渴, 提醒我喝水 ... |
| `ackem/late-night-reminder` | 熬夜好伤身, 该睡觉了 ... |
| `ackem/emergency-companion` | 我心情不好, 好难受, 想哭 ... |
| `ackem/markdown-table` | 帮我做个表格, 整理成表格形式 ... |
| `ackem/light-schedule` | 提醒我下午3点开会, 设个闹钟 ... |
| `ackem/diary-auto` | 写日记, 今天发生了什么 ... |
| `ackem/plan-document` | 做个计划, 帮我规划一下 ... |
| `ackem/knowledge-presentation` | 这是什么, 解释一下, 帮我科普 ... |
| `ackem/fun-profile` | 我今天是什么状态, 分析一下我 ... |
| `ackem/desktop-companion` | 打开桌面陪伴, 显示桌面 ... |

### 8.2 路由索引构建

```
buildRouteIndex(provider, extraEntries):
  ① 收集所有 exampleQueries (内置 + uskill/uplugin 新增)
  ② 去重 (同一 query 可能对应多个扩展)
  ③ provider.embedBatch(allQueries) 批量计算
  ④ 组装 RouteIndex { entries: [{ extensionId, query, embedding }] }

addToRouteIndex(index, extId, newQueries, provider):
  增量: 只 embed 新 queries, 追加到 entries
```

### 8.3 路由匹配

```
matchAgainstRouteTable(queryEmbed, index, topK=5):
  for each entry:
    score = cosineSimilarity(queryEmbed, entry.embedding)
  filter(score >= MID_CONFIDENCE_THRESHOLD 0.45)
  sort(desc) → topK

applyQuickRules(message):  ← 第二层规则检查
  规则1: 否定词 (不要/别/不想) → block
  规则2: 疑问句非请求 (好不好/是什么) → block
  规则3: 时间相关非 dispatched → block
```

### 8.4 与 Dispatch 的集成

```
dispatchRouter.ts:
  if explicitDispatch 匹配到 auto_invoke:
    可选: 先用 routeTable 做 embedding 语义验证
    中置信结果 + quickRules allow → 执行 Skill
```

---

## 9. 应用层 — 评分与重排

**文件**：`src/main/embedding/scoring.ts` (205 行)

### 9.1 情绪对齐评分

在现有权重排序之上，用 embedding 做语义层情绪对齐：

```typescript
computeEmotionAlignmentBoost(queryEmbed, factEmbed, maxBoost = 0.3):
  alignment = cosineSimilarity(queryEmbed, factEmbed)
  return 1 + alignment * maxBoost
  // → 语义与用户消息越对齐的事实, 排序越靠前, 最高 +30%
```

### 9.2 上下文语义重排

```
rerankBySemanticRelevance(facts, queryEmbed, getFactEmbed):
  for each fact:
    semanticScore = cosineSimilarity(queryEmbed, factEmbed)
  最终分 = baseScore × 0.6 + semanticScore × 0.4
  sort(desc)
```

### 9.3 对话向量计算

```typescript
computeConversationEmbed(recentMsgs, provider):
  输入: 最近 N 轮用户消息 (通常 3 条)
  输出: 多条消息的 embedding 平均值
  用途: 主动回忆选择、关联共现激活
```

### 9.4 用户画像维度计算

用 embedding 从用户对话中推断三个维度的倾向：

```typescript
computeDimensionFromEmbedding(recentEmbeds, anchors):
  // anchors: { low, mid, high } 三档锚定中心
  for each embed:
    lowScores[] = cosineSimilarity(embed, anchors.low)
    midScores[] = cosineSimilarity(embed, anchors.mid)
    highScores[] = cosineSimilarity(embed, anchors.high)
  // 加权平均: 低档 0.2, 中档 0.5, 高档 0.9
  return (avgLow × 0.2 + avgMid × 0.5 + avgHigh × 0.9) / total
```

维度锚定词 (9 组)：

| 维度 | 低 | 中 | 高 |
|------|----|----|----|
| sexualDirectness | 想被你融化 | 想抱你 | 操我 |
| dominancePreference | 我是你的 | 我们一起 | 跪下 |
| emotionalNeediness | 随便 | 想你了 | 不能没有你 |

### 9.5 日记素材重要度中心

```typescript
computeMeaningfulCenter(provider):
  锚定句: ['心里话', '压力大撑不住', '信任你', '决定了', '我发现原来我']
  取这 5 句 embedding 平均值 → "有意义对话"的语义中心
```

---

## 10. 时间语义信号提取

**文件**：`src/main/memory/temporalSignalExtractor.ts` (94 行)

### 10.1 时间锚定句

37 条预定义的时间相关句子，通过 embedding 匹配检测用户消息中的时间信号：

```
时间方向: 去年这个时候 / 上周的今天 / 一个月前 / 三天前 / 刚才
未来方向: 明天 / 后天 / 下周 / 下个月 / 明年
模糊时间: 最近 / 前几天 / 前阵子 / 那天 / 那时候
周期事件: 生日 / 纪念日 / 过年 / 中秋 / 新年 / 年底 / 年初
增量时间: 上次 / 好久不见 / 很久没 / 又过了一年
频次:    每天 / 每周 / 每月 / 每年 / 经常
```

### 10.2 检测流程

```
detectTemporalSignal(msgEmbedding, sentenceEmbeddings, threshold=0.6):
  for each (sentence, embed) in sentenceEmbeddings:
    score = cosineSimilarity(msgEmbedding, embed)
  best = max(score)
  if best < 0.6 → return null
  type 判定:
    含"时候/前阵子/那天/好久" → fuzzy
    含"生日/纪念日/过年/每天" → recurring
    含"明天/上周/去年"        → exact
  return { label: "去年这个时候", type: "fuzzy" }
```

### 10.3 对 L4 检索的影响

时间信号检测结果传入 `retriever.ts` 后触发两条路径：

```
时间语义路径 (FIX-007):
  if temporalSemanticSignal.label:
    ① FTS 搜索此 label → temporalSemanticHits
    ② Jaccard 语义搜索此 label → temporalSemanticHits
    ③ embedding 搜索 (用 temporalLabelEmbed, 阈值 0.6×0.85=0.51)

时间锚点路径 (第 8 路):
  不用 embedding, 直接从 SQLite temporal_anchors 表查询:
    周期性锚点: 同月同日 ±30 天 → "用户生日快到了！"
    模糊锚点: 近 3 个月 → "最近发生的事"
```

---

## 11. 启动预热与缓存

**文件**：`src/main/embedding/preLlmWarmup.ts` (158 行)

### 11.1 预计算缓存

所有预计算的 embedding 结果 **一次性算好、模块级缓存、模型切换时作废**：

```typescript
// 缓存变量 (模块级, 跨对话)
let cachedAnchorVectors: AnchorVectors | null
let cachedProfileAnchors: ProfileAnchors | null
let cachedCreateToolAnchor: number[] | null
let cachedTemporalEmbeddings: Map<string, number[]> | null
let cachedFatherReferenceEmbeddings: Map<string, {cluster, vector}> | null
let cachedCreatorEntryEmbeddings: Map<string, number[]> | null
let cachedProviderSig: string  // provider name, 用于检测切换
```

### 11.2 预热启动

```
warmupPreLlmEmbeddings(provider, dataRoot?):
  if !provider.ready() → 跳过
  Promise.all([
    getCachedAnchorVectors(provider),           // 10 类语义中心
    getCachedTemporalEmbeddings(provider),       // 37 条时间锚定
    getCachedFatherReferenceEmbeddings(provider),// 父亲指称解析
    dataRoot ? getCachedCreatorEntryEmbeddings(provider, dataRoot) : undefined
  ])
```

### 11.3 缓存作废

```typescript
invalidatePreLlmEmbeddingCache():
  // 模型切换 / provider 重建时调用
  所有缓存 = null
  cachedProviderSig = ''
```

---

## 12. 就绪状态机

**文件**：`src/main/embedding/embeddingReadiness.ts` (80 行)

### 12.1 阶段

```
idle (0%) → loading_provider (15%) → syncing_facts (50%)
         → warming_prellm (85%) → ready (100%) | degraded (100%)
```

### 12.2 订阅 API

```typescript
getEmbeddingReadiness(): { phase, progress, providerReady, factEmbeddingsReady, preLlmWarmReady }
isEmbeddingReadyForChat(): boolean  // phase === 'ready' || 'degraded' 即可聊天
onReadinessChange(cb): () => void   // UI 显示进度条
```

### 12.3 完整启动预热序列

```typescript
// index.ts warmupEmbeddingAtStartup() 后台异步
async function warmupEmbeddingAtStartup(dataRoot, index):
  setPhase('loading_provider')
  provider = await getOrInitEmbeddingProvider(dataRoot)  // 加载 ONNX

  if !provider?.ready():
    setPhase('degraded')  // 降级, 不妨碍聊天
    return

  setPhase('syncing_facts', { providerReady: true })
  entry = getOrCreateEngineCache(dataRoot, index)
  entry.embeddingProvider = provider
  wireVectorStoreEmbeddings(entry.vs, provider)
  await ensureFactEmbeddingsReady(entry)  // 批量 embed 全部活跃事实

  setPhase('warming_prellm', { factEmbeddingsReady: true })
  await warmupPreLlmEmbeddings(provider, dataRoot)  // 锚定+时间+父亲+创造者

  setPhase('ready')  // ← 全部就绪
```

---

## 13. 每轮对话的 Embedding 计算

**文件**：`src/main/engine/prepareTurnContext.ts` (131 行)

### 13.1 计算入口

每轮用户消息进入后, `orchestrator.ts` 先调用 `prepareTurnContext()`：

```typescript
async function prepareTurnContext({ msg, state, factStore, retriever, ... }):
  // 1. 获取 embedding provider (缓存或初始化)
  embeddingProvider = getCachedEmbeddingProvider(dataRoot)
  if !embeddingProvider?.ready() && index:
    ensureFactEmbeddingsReady(entry)
    embeddingProvider = getCachedEmbeddingProvider(dataRoot)

  // 2. 计算 queryEmbed + conversationEmbed + temporal signal (并行)
  if embeddingProvider?.ready():
    recentMsgs = recentUserMessages.slice(-3)  // 最近 3 轮
    [queryEmbed, convEmb] = await Promise.all([
      embeddingProvider.embed(msg),                     // 用户消息 → 向量
      computeConversationEmbed(recentMsgs, provider),   // 对话上下文 → 向量
    ])

    temporalEmbeddings = await getCachedTemporalEmbeddings(provider)
    temporalSignal = detectTemporalSignal(queryEmbed, temporalEmbeddings)
    if temporalSignal?.label:
      temporalLabelEmbed = temporalEmbeddings.get(temporalSignal.label)

  // 3. 传给 retriever (L4 多路召回)
  retrieval = await retriever.retrieve(
    msg, queryEmbed, temporalSignal, temporalLabelEmbed, ...
  )

  return { queryEmbed, conversationEmbed, temporalSignal, retrieval }
```

### 13.2 一次完整的 Embedding 链路

```
每轮用户消息:
  1 次 embed(msg)                            → queryEmbed (L0/L4/路由/镜像/父亲指称)
  1 次 computeConversationEmbed(recentMsgs)  → conversationEmbed (主动回忆)
  37 次 cosineSimilarity (时间信号检测)       → temporalSemanticSignal (时间检索)

启动时 (一次性):
  74 次 embed (通用锚定词)            → 7 类语义中心
  20 次 embed (成人锚定词)            → 3 类成人语义中心 (可选)
  9 次 embed (画像锚定词)             → 3 维度 × 3 档画像锚定
  8 次 embed (创建工具锚定词)         → 工具意图检测
  37 次 embed (时间锚定句)            → 时间语义缓存
  5 次 embed (日记有意义中心)         → 日记素材中心
  若干 embed (父亲指称锚定)           → 创造者记忆解析
  若干 embed (创造者记忆条目)         → 创造者语义匹配
  N_ACTIVE_FACTS 次 embed (全部事实)  → 稠密向量缓存 (潜在几百次, 异步)
```

---

## 14. 神经系统 × 各系统集成点

### 14.1 脑系统 (L0 解释器)

```
interpreter.ts → interpretInputWithEmbedding():
  规则未命中 casual_chat → classifyBySemantics(queryEmbed, anchors)
  → 覆盖 EventType (如 vulnerable → VULNERABLE)
  否定检测 → 反转类别 (如 praise + "不" → hurtful)
```

### 14.2 脑系统 (L4 检索器)

```
retriever.ts → retrieve():
  第 4 路: vectorStore.searchAsync(query, topK, queryEmbed)
  第 6 路: temporalSemanticHits (temporalLabelEmbed 搜索)
  第 9 路: associationIndex 关联扩散 (同 domain + embedding cosine > 0.3 才连接)
  排序:   scoreRelevance 内调用 queryEmbed 做情绪对齐
```

### 14.3 脑系统 (关联冷启动)

```
associationColdStart.ts:
  batchSeedAssociationsFromEmbeddings():
    embedding cosine >= 0.65 → 创建关联边
    优先链接"孤儿"事实 (关联数 = 0)
    每事实最多 3 条关联

  seedAssociationsForNewFacts():
    新事实 vs 库中事实: cosine >= 0.7 (或 0.55 宽松)
    不可用时回退 textOverlapScore() (2-gram 字符重叠)
```

### 14.4 脑系统 (记忆写入后刷新)

```
finalizeNewFacts.ts → refreshFactEmbeddingsForIds():
  新事实入库后：
  ① embedBatch(新事实文本) → factEmbeddingCache.set(id, vec)
  ② vs.loadDenseCacheFromMap() 重建稠密缓存
  ③ upsertFactEmbeddings() 写入 SQLite
```

### 14.5 心系统 (镜像矛盾检测)

```
mirror.ts → detectContradictions():
  新旧文本抽取断言 → 先精确话题匹配
  未匹配 → embed 新旧话题词 → cosine > 0.70 + 效价差 >= 0.6 → 标记矛盾
```

### 14.6 心系统 (情绪对齐)

```
retriever.ts → scoreRelevance():
  if queryEmbed 可用:
    score *= computeEmotionAlignmentBoost(queryEmbed, factEmbed)
    // 语义与用户消息越一致的事实越靠前, 最高 +30%
```

### 14.7 扩展系统 (路由匹配)

```
dispatchRouter.ts:
  if embedding 路由表就绪:
    matchAgainstRouteTable(queryEmbed, routeIndex)
    中置信结果 + 规则检查通过 → auto_invoke 扩展
```

### 14.8 Canon (创造者记忆)

```
orchestrator.ts (Pre-LLM):
  父亲指称解析: resolveFatherReference(queryEmbed, fatherAnchors)
    → 判断用户说的"他"是指创造者还是现实中的父亲
  创造者条目匹配: queryEmbed vs cachedCreatorEntryEmbeddings
    → 选取语义相关的创造者记忆注入
```

---

## 15. 优雅降级

这是神经系统最重要的设计原则：**embedding 不可用时，整个应用不崩溃，聊天不中断**。

```
ONNX Runtime 不可用 / 模型文件缺失 / 加载失败
    │
    ├── provider = NoopEmbeddingProvider
    ├── embeddingReadiness = 'degraded'
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  L0 解释器 (interpreter.ts)                                  │
│    规则命中 → 正常工作                                       │
│    规则未命中 → 跳过 semanticFallback → 保持 casual_chat     │
│    精度下降，但绝大多数用户消息仍能被关键词规则正确分类       │
├─────────────────────────────────────────────────────────────┤
│  L4 检索 (retriever.ts)                                      │
│    第 4 路 embedding 搜索 → 跳过                             │
│    第 6 路 temporal semantic → 跳过                          │
│    第 9 路关联扩散 → 靠共现 (而非 embedding cosine 门控)     │
│    触发词 + FTS + Jaccard + TF-IDF + 时间锚点 × 5 路仍工作  │
│    核心记忆召回不受影响                                       │
├─────────────────────────────────────────────────────────────┤
│  扩展路由 (routeTable.ts)                                    │
│    embedding 路由匹配 → 跳过                                 │
│    靠关键词规则 dispatch 仍可触发                            │
├─────────────────────────────────────────────────────────────┤
│  关联冷启动 (associationColdStart.ts)                        │
│    embedding 相似度 → textOverlapScore() 2-gram 回退        │
├─────────────────────────────────────────────────────────────┤
│  VectorStore                                                 │
│    稠密缓存不可用 → TF-IDF 稀疏向量搜索                      │
│    精度不如 embedding, 但对高频词/关键词仍有效               │
├─────────────────────────────────────────────────────────────┤
│  UI 显示 "Embedding: degraded"                               │
│  用户可尝试重建索引 / 检查模型文件                            │
│  聊天功能完全正常                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 16. 参数中心

所有 embedding 相关参数集中在 `ackemParams.ts`：

| 参数 | 默认值 | 用途 |
|------|--------|------|
| `EMBEDDING_SEARCH_ENABLED` | true | 是否启用 embedding 向量搜索 |
| `EMBEDDING_SEARCH_TOP_K` | 20 | 向量搜索返回 top K |
| `EMBEDDING_MIN_SCORE` | 0.5 | 最低 cosine 相似度阈值 (向量搜索) |
| `VECTOR_SEARCH_ENABLED` | true | TF-IDF 向量搜索开关 |
| `VECTOR_SEARCH_TOP_K` | 15 | TF-IDF 搜索 Top K |
| `VECTOR_SEARCH_MIN_SCORE` | 0.05 | TF-IDF 最低相似度阈值 |
| `SEMANTIC_SEARCH_ENABLED` | true | Jaccard 语义搜索开关 |
| `SEMANTIC_SEARCH_TOP_K` | 15 | Jaccard 搜索 Top K |
| `SEMANTIC_SEARCH_MIN_SIMILARITY` | 0.12 | Jaccard 最低相似度 |
| `HIGH_CONFIDENCE_THRESHOLD` | 0.70 | 语义兜底高置信阈值 |
| `MID_CONFIDENCE_THRESHOLD` | 0.45 | 语义兜底中置信阈值 |
| `TRIGGER_MATCH_BOOST` | 2.0 | 触发词匹配排序加权 |
| `FACT_DEDUP_THRESHOLD` | 0.42 | 字符级 Jaccard 去重阈值 |
| `EMBEDDING_DEDUP_THRESHOLD` | 0.85 | embedding 去重阈值 (优先于 Jaccard) |
| `EMOTION_ALIGNMENT_MAX_BOOST` | 0.3 | 情绪对齐最大加成 |
| `TEMPORAL_SIGNAL_THRESHOLD` | 0.6 | 时间信号检测阈值 |
| `TEMPORAL_SIGNAL_EMBEDDING_THRESHOLD` | 0.51 | 时间语义 embedding 阈值 (=0.6×0.85) |

---

## 17. 修改指南

| 你想… | 先看 |
|-------|------|
| 换/增 embedding 模型 | `memory/embedding/types.ts` MODEL_MANIFESTS + `modelManager.ts` |
| 改语义兜底分类 | `anchorVectors.ts` 锚定词 + `semanticFallback.ts` |
| 改路由匹配 | `routeTable.ts` BUILTIN_ROUTE_TABLE + matchAgainstRouteTable |
| 改情绪对齐算法 | `scoring.ts` computeEmotionAlignmentBoost |
| 改时间信号检测 | `temporalSignalExtractor.ts` TEMPORAL_ANCHOR_SENTENCES |
| 改启动预热顺序 | `preLlmWarmup.ts` + `engineCache.ts` warmupEmbeddingAtStartup |
| 改降级行为 | `provider.ts` 三优先级链 + `retriever.ts` 非 embedding 分支 |
| 改 Provider 优先级 | `memory/embedding/provider.ts` createEmbeddingProvider |
| 新增 Provider 类型 | 实现 EmbeddingProvider 接口 + 注册到 provider.ts |
| 改事实 embedding 持久化 | `db/repos/factEmbeddingsRepo.ts` |
| 改每轮 embedding 计算 | `prepareTurnContext.ts` |
| 改向量搜索双缓存策略 | `vectorStore.ts` searchAsync + buildDenseCache |

**换模型注意**：换模型必须重建全部事实 embedding (scheduleEmbeddingRebuild)，否则 dimension 不匹配会导致 cosine 相似度全错。

---

## 18. 相关文档

| 文档 | 内容 |
|------|------|
| [01-brain-system.md](./01-brain-system.md) | L0/L4 如何消费 embedding |
| [02-heart-system.md](./02-heart-system.md) | 情绪对齐与镜像 |
| [03-mouth-system.md](./03-mouth-system.md) | 消费检索结果 (不直接使用 embedding) |
| [05-extension-system.md](./05-extension-system.md) | Dispatch 路由匹配 |
| [00-overall-system.md](./00-overall-system.md) | 全对话链路 |
| [ai-context-and-retrieval-policy.md](../../ai-context-and-retrieval-policy.md) | 记忆注入策略 |

*神经系统 · Ackem v1.0.0 · 2026-06*
