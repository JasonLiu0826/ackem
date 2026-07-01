# 整体系统

> **语言：** 中文 · [English](./00-overall-system.md)

> **对应**：应用壳 + 编排 + 数据层 + 进程边界  
> **核心问题**：Ackem 的代码是如何组织在一起的？一条消息从输入到回复经历了什么？

---

## 1. 设计目标

| 目标 | 实现方式 |
|------|----------|
| **本地优先** | 所有数据存在用户硬盘，无强制云端同步 |
| **BYOK** | 用户自备 LLM API Key，Ackem 不捆绑任何大模型 |
| **离线可用** | 聊天与记忆检索在 Embedding 降级后仍可工作 |
| **隐私可审计** | 数据以 JSON/Markdown 明文存储，用户可读可删 |
| **可扩展** | 扩展系统通过协议边界与引擎解耦，不破坏核心 |

---

## 2. 技术栈

| 层 | 技术 | 选型理由 |
|----|------|----------|
| 桌面壳 | **Electron 33** | 原生 Windows 体验，直接文件系统与 SQLite 访问 |
| 主进程 | **Node.js 20+ / TypeScript** | 全部引擎逻辑、IPC、DB、LLM 调用 |
| 渲染进程 | **React 18 + TypeScript** | UI 层，经 IPC 桥与主进程通信 |
| 构建 | **electron-vite** | 主进程/渲染进程/preload 三端统一构建 |
| 样式 | **Tailwind CSS** | 快速 UI 开发 |
| 持久化 | **better-sqlite3** | 同步 SQLite，零配置，高性能 |
| 本地 ML | **onnxruntime-node** | 可选依赖，Embedding 推理 |
| 打包 | **electron-builder** | NSIS 安装包 + 绿色版目录 |

---

## 3. 进程架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Renderer Process (React)                     │
│                                                                   │
│  ┌───────────┐ ┌──────────────┐ ┌────────────────┐              │
│  │ ChatPage  │ │ SettingsPage │ │ ExtensionCenter │  ...         │
│  └─────┬─────┘ └──────┬───────┘ └───────┬────────┘              │
│        │              │                  │                       │
│  ┌─────┴──────────────┴──────────────────┴──────────────────┐   │
│  │                  window.ackem.* API                       │   │
│  │  chat.send() / memory.search() / settings.get() / ...    │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │ preload IPC桥                       │
├────────────────────────────┼────────────────────────────────────┤
│                     Main Process (Node.js)                       │
│                            │                                     │
│  ┌─────────────────────────┴────────────────────────────────┐   │
│  │                    index.ts                                │   │
│  │  窗口创建 · registerIpc() · 扩展引导 · 数据层初始化       │   │
│  └────┬──────────┬──────────┬──────────┬─────────────────────┘   │
│       │          │          │          │                         │
│  ┌────┴───┐ ┌───┴────┐ ┌──┴─────┐ ┌──┴──────────────┐          │
│  │ ipc/   │ │engine/ │ │memory/ │ │ extensions/     │          │
│  │ 聊天   │ │ 编排器  │ │ 记忆    │ │ 协调器/Dispatch  │          │
│  │ 设置   │ │ 脑+心  │ │ 检索   │ │ Skill/Plugin    │          │
│  │ 记忆   │ │ 参数   │ │ 写入   │ │ OpenForU        │          │
│  └────────┘ └────────┘ └────────┘ └─────────────────┘          │
│       │          │          │          │                         │
│  ┌────┴───┐ ┌───┴────┐ ┌──┴─────┐ ┌──┴──────────────┐          │
│  │ db/    │ │prompt/ │ │context/│ │ embedding/      │          │
│  │ SQLite │ │ 嘴系统  │ │ 运行时  │ │ 就绪态管理      │          │
│  │ repos  │ │ 模板   │ │ 上下文  │ │                 │          │
│  └────────┘ └────────┘ └────────┘ └─────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 进程边界约束

| 规则 | 原因 |
|------|------|
| 渲染进程 **不得** 直接读 `data/` 或调 LLM | 安全：IPC 层做权限与校验 |
| 渲染进程通过 `window.ackem.*` 调用 IPC | 架构：preload 暴露有限 API |
| 扩展 **不得** `import` `engine/`、`memory/` 内部 | 解耦：只能通过 `protocols.ts` 定义的接口通信 |
| 开发时必须 `npm run dev` 启动 Electron | 渲染进程依赖 preload 注入的 `window.ackem` |

### 为什么用 Electron，而不是其他方案？

Ackem 需要 **直接的文件系统访问**（读/写 `data/`）、**SQLite 同步写入**、**系统托盘**、**子进程管理**（语音服务）。Electron 主进程 Node.js 环境提供了这些能力，且 React 生态让 UI 开发高效。权衡是安装包体积较大（~200MB 基础运行时），但对桌面应用是可接受的。

---

## 4. 启动序列

```
electron-vite dev / Ackem.exe
    │
    ▼
① index.ts 入口
    │  ├─ app.whenReady()
    │  ├─ 创建 BrowserWindow（加载 renderer）
    │  ├─ registerIpc() 注册所有 IPC handler
    │  │   ├─ chat.ts      — 消息发送与流式接收
    │  │   ├─ settings.ts  — 读写 ackem-app-settings.json
    │  │   ├─ memory.ts    — 记忆搜索/导入/导出
    │  │   ├─ extensions/  — 扩展管理
    │  │   └─ companion/   — 陪伴设置
    │  ├─ layout.ensureDataLayout() 初始化 data/ 目录结构
    │  └─ extensions/coordinator.boot() 加载扩展
    │
    ▼
② 后台异步初始化（不阻塞 UI）
    │  ├─ embedding/index.ts → warmupEmbeddingAtStartup()
    │  │   ├─ onnxProvider 是否可用
    │  │   ├─ bundled 模型解压 bootstrapBundledModels()
    │  │   └─ 设置 embeddingReadiness 状态
    │  ├─ memory/retriever 预热（加载索引快照）
    │  └─ companion 主动消息调度启动
    │
    ▼
③ UI 就绪，等待用户输入
```

---

## 5. 一轮对话的完整旅程

这是 Ackem 最核心的数据流。每一步对应一个或一组源文件：

```
Step 1: 用户输入
───────────────
用户打字发送 → renderer ChatPage
  → store.sendMessage() → window.ackem.chat.send(text)
  → preload → ipcRenderer.invoke('chat:send')
  → main process: ipc/chat.ts handler

Step 2: Dispatch 路由
───────────────
ipc/chat.ts → extensions/dispatch/router.ts
  判断用户消息是否触发了扩展调度：
    plan / ask_plan     → OpenForU 工作区创建
    auto_invoke         → Skill.execute（如 web-search）
    invoke_surface      → Plugin UI 窗口打开
    open_surface        → 打开 Surface
    chat                → 进入正常对话流程

Step 3: Pre-LLM 编排
───────────────
orchestrator.ts → runPreLlmTurn()
  按严格顺序执行：
  [L0]   interpretInput()            → Event type + hint
  [L0.5] interpretInputWithEmbedding → 语义兜底（可选）
         detectDndIntent()           → 勿扰模式
         detectMemoryIntent()        → 显式记忆操作
         detectUserVerbosity()       → 用户篇幅检测
  [L1]   updateRelationship()        → 信任/阶段/气氛
  [L1]   augmentL1FromMemory()       → 记忆微调关系输入
  [L2]   emotionStep()               → aff/sec/aro/dom 递推
  [L3]   evaluateEmergence()         → 长聊涌现检测
  [L3]   buildPsycheBlock()          → 心理块 + 表达提示
  [L4]   retriever.retrieve()        → 多路召回 → tierBBlock
         temporalAwareness/          → 时间/特殊日信号
         strategy/injectionPolicy    → 槽位竞争决策
         strategy/topicSelector      → 话题选择
         activeRecall                → 主动回忆

Step 4: 上下文组装
───────────────
context.ts → assembleChatContext()
  合并所有块成 system prompt + messages 数组：
    Tier A:   伴侣快照 (self.md + state.md)
    Canon:    Ackem 人设、创造者记忆、陌生人守卫
    psyche:   情绪/关系心理块 [心系统产出]
    Tier B:   检索到的记忆片段 [脑系统产出]
    扩展注入: 扩展 contextInjection [扩展系统产出]
    时间:     时段/特殊日提示
    System:   人格 + 融合 + 底线 + 能力列表
    Messages: 最近对话历史

Step 5: LLM 调用
───────────────
ipc/chat.ts → OpenAI 兼容 HTTP/SSE 客户端
  流式返回 token → preload → renderer store → UI 打字机效果

Step 6: Post-LLM
───────────────
orchestrator.runPostLlm() + MemoryIngestPipeline.afterTurnAsync()
  写路径：
    轻量提取（同步）: 情绪上下文、规则事实、时间锚点
    LLM 提取（异步）: 事实抽取、情节抽取、三元组抽取
    状态持久化: FullState → SQLite + companion 文件
    扩展回调: afterAssistantMessage hook

Step 7: 主动行为检查
───────────────
companion 模块检查是否应主动发起消息
  定时 + 事件驱动，受 proactiveGate 频率控制
```

---

## 6. 主进程分层架构（由底向上）

| 层 | 职责 | 关键路径 | 依赖 |
|----|------|----------|------|
| **协议边界** | 扩展只读快照、事件回传 | `extensions/protocols.ts` | 无 |
| **核心引擎** | 脑 + 心编排 | `engine/orchestrator.ts` | `types.ts`、`ackemParams.ts` |
| **记忆** | 事实、情节、检索、写入 | `memory/` | `engine/types.ts`、`db/` |
| **运行时感知** | 时段、前台、习惯 | `context/`、`temporalAwareness/` | `engine/types.ts` |
| **扩展** | Skill/Plugin/Dispatch/OpenForU | `extensions/` | `protocols.ts`、`snapshot.ts` |
| **应用壳** | 窗口、IPC、设置、日志 | `index.ts`、`ipc/`、`settings.ts` | 全部下层 |

---

## 7. `src/main/` 目录地图

```
src/main/
├── index.ts                  # 应用入口，窗口创建，IPC 注册
├── settings.ts               # 设置读写（ackem-app-settings.json）
├── paths.ts                  # 路径工具函数
├── layout.ts                 # data/ 目录结构初始化
├── personalityPresets.ts     # 29 套人格预设（TISOR 五维）
├── logger.ts                 # 日志工具
│
├── ipc/                      # 渲染进程 API 实现
│   ├── chat.ts               #   消息发送/流式接收 IPC
│   ├── settings.ts           #   设置读写
│   ├── memory.ts             #   记忆搜索/导入/导出
│   ├── companion.ts          #   陪伴/桌宠控制
│   ├── extensions/           #   扩展管理
│   └── ...                   #   其他 IPC handler
│
├── engine/                   # 脑 + 心系统核心
│   ├── orchestrator.ts       #   Pre-LLM 全链路编排
│   ├── interpreter.ts        #   L0 事件解释（关键词规则）
│   ├── relationship.ts       #   L1 关系 FSM + 信任
│   ├── emotion.ts            #   L2 四维情绪模型
│   ├── psyche.ts             #   L3 心理块组装
│   ├── emotionalEmergence.ts #   长聊涌现
│   ├── desire.ts             #   欲望/动机栈
│   ├── rhythmEngine.ts       #   回复节奏决策
│   ├── reunion.ts            #   离线重逢
│   ├── mirror.ts             #   用户情绪镜像
│   ├── user-profiler.ts      #   用户画像推断
│   ├── user-dimension-inferrer.ts # 六维画像
│   ├── tracer.ts             #   单轮追踪调试
│   ├── state-persistence.ts  #   状态持久化
│   ├── ackemParams.ts        #   全部参数常量（单一来源）
│   ├── types.ts              #   Event, FullState, 等核心类型
│   ├── temporalAwareness/    #   时间感知
│   └── strategy/             #   策略层（选题/注入槽位）
│
├── memory/                   # L4 记忆系统
│   ├── factStore.ts          #   事实 CRUD
│   ├── retriever.ts          #   多路检索 → tierBBlock
│   ├── ingest.ts             #   记忆摄入管线
│   ├── factExtractor.ts      #   LLM 事实抽取
│   ├── episodeExtractor.ts   #   情节抽取
│   ├── consolidator.ts       #   合并去重
│   ├── vectorStore.ts        #   向量索引
│   ├── knowledgeGraph.ts     #   知识图谱
│   ├── associationColdStart.ts # 关联冷启动
│   ├── documentImport/       #   文档导入
│   └── embedding/            #   神经系统的 Provider 都在这里
│
├── prompt/                   # 嘴系统
│   ├── main-chat.ts          #   主聊天 system prompt
│   ├── personality.ts / .en.ts  # 人格预设文案
│   ├── emotion-fusion.ts     #   情绪融合块
│   ├── adult-mode.ts         #   成人模式 prompt
│   ├── memory-*.ts           #   记忆提取/合并 prompt
│   ├── diary.ts              #   日记生成
│   ├── openforu-*.ts         #   OpenForU 专用 prompt
│   └── index.ts              #   统一导出
│
├── context.ts                # 运行时上下文组装
│
├── extensions/               # 扩展系统
│   ├── coordinator.ts        #   总协调器
│   ├── protocols.ts          #   协议类型定义
│   ├── snapshot.ts           #   EngineSnapshot 构建
│   ├── dispatch/             #   调度路由
│   ├── skills/               #   Skill 注册与 builtin
│   ├── plugins/              #   Plugin 注册与 builtin
│   ├── openforu/             #   用户扩展（沙箱+权限）
│   ├── ecosystem/            #   community 包格式（当前关闭）
│   ├── gamemode/             #   游戏模式
│   └── policy/               #   主动/强度策略
│
├── canon/                    # Ackem 本体人设
│   ├── ackemCanon.ts         #   不可改写的人设
│   ├── creatorMemory.ts      #   创造者记忆（不衰减）
│   └── creatorMemorySeed.ts  #   起源种子
│
├── companion/                # 陪伴模式
│   ├── proactiveScheduler.ts #   主动消息调度
│   └── harassmentGuard.ts    #   骚扰检测
│
├── db/                       # SQLite 层
│   ├── database.ts           #   数据库连接
│   ├── schema.ts             #   schema 定义
│   ├── repos/                #   Repository 模式
│   └── paths.ts              #   数据库路径
│
├── embedding/                # 全局就绪态管理
│   └── embeddingReadiness.ts
│
├── i18n/                     # 国际化
│   ├── zh.ts                 #   中文
│   └── en.ts                 #   英文
│
├── channels/                 # 外部通道
│   └── weixin/               #   微信桥接
│
├── desktop-agent/            # 实验性：桌面代理
│
├── paperCard/                # 卡片/可视化
├── planDocument/             # OpenForU 文档
└── taskFrame/                # 任务框架
```

---

## 8. 数据存储设计

### 为什么 SQLite + 文件混合？

Ackem 使用两种存储方式，各取所长：

| 存储 | 存什么 | 理由 |
|------|--------|------|
| **SQLite** (`ackem.db`) | 结构化状态（关系/情绪/设置）、扩展 registry、FTS 索引 | 事务性写入、高效查询 |
| **JSON 文件** (`facts.v2.json`) | 记忆事实、知识图谱 | 人类可读、Git 可 diff、可直接备份 |
| **Markdown 文件** (`*.md`) | 日记、伴侣状态、导入文档 | 用户可直接阅读编辑 |
| **派生索引** (`_derived/`) | 向量索引、缓存 | 可删除重建，不丢核心数据 |

### data/ 目录结构

```
data/
├── ackem.db              # SQLite 数据库
├── memory/
│   ├── facts.v2.json     # 结构化记忆事实
│   └── archive/          # 人类可读记忆归档
├── companion/
│   ├── self.md           # 伴侣第一人称状态
│   ├── state.md          # 伴侣快照
│   └── chat-history-*.json
├── diary/*.md            # 日记
├── imports/              # 用户导入文件
├── openforu/             # 用户扩展
├── _derived/             # 可重建的派生索引
├── models/               # Embedding 模型缓存
└── logs/                 # 运行日志
```

---

## 9. 错误处理与韧性模式

| 场景 | 行为 |
|------|------|
| LLM API 不可用 | 聊天返回错误提示，不丢失对话上下文 |
| Embedding 模型加载失败 | 降级到 TF-IDF 关键词检索，UI 显示 degraded |
| SQLite 写入失败 | 内存中保持状态，下次重试写入 |
| 扩展崩溃 | 沙箱隔离，不波及主进程 |
| 数据目录损坏 | `ensureDataLayout()` 重建缺失目录结构 |
| 模型文件缺失 | 自动触发下载 `downloadModel()` |

---

## 10. 相关文档

| 文档 | 链接 |
|------|------|
| 脑系统（L0 + L4） | [01-brain-system.md](./01-brain-system.md) |
| 心系统（L1–L3） | [02-heart-system.md](./02-heart-system.md) |
| 嘴系统（Prompt + LLM） | [03-mouth-system.md](./03-mouth-system.md) |
| 神经系统（Embedding） | [04-neural-system.md](./04-neural-system.md) |
| 扩展系统 | [05-extension-system.md](./05-extension-system.md) |
| 时间系统 | [06-time-system.md](./06-time-system.md) |
| 记忆注入策略 | [ai-context-and-retrieval-policy.md](../../ai-context-and-retrieval-policy.md) |
| 数据目录格式 | [memory-format.md](../../memory-format.md) |

*整体系统 · Ackem v1.0.0 · 2026-06*
