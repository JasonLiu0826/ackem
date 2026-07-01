# 扩展系统 · Extension System

> **语言：** 中文 · [English](./05-extension-system.md)

> **代号**：Hands & Feet / Extensions  
> **核心问题**：Ackem 如何 **真实执行** 能力（搜索、提醒、家居控制、日程管理）而 **不破坏** 引擎内核？  
> **设计原则**：协议边界隔离，EngineSnapshot 只读，ExtensionEvent 回传  
> **远景**：从聊天伴侣进化为 **居家生活智能体** — 控制设备、管理日程、主动关怀

---

## 1. 定位

扩展系统是核心引擎与 **外部世界** 的桥梁。引擎负责"感受和思考"（脑+心），扩展系统负责"行动和感知"（手脚）。

```
┌──────────────────────────────────────────────────────────────────┐
│                       引擎 (脑 + 心)                             │
│  感受: L0 解释器 · L1-L3 情绪关系 · L4 记忆检索                │
│  思考: LLM 回复生成                                             │
└────────────────────────┬─────────────────────────────────────────┘
                         │ EngineSnapshot (只读)
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                     ExtensionsCoordinator                        │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Dispatch │ │  Skills  │ │  Plugins │ │    OpenForU        │  │
│  │  调度管线  │ │  技能    │ │  插件    │ │  用户自建扩展      │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬────────────┘  │
│       │            │            │              │                │
│  ┌────┴────────────┴────────────┴──────────────┴────────────┐  │
│  │                   Policy Layer                            │  │
│  │  ProactiveGate · IntensityModulator · AttentionBudget     │  │
│  │  ToolDecider · UserProfile · DecisionLog                 │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                              │ ExtensionEvent                  │
└──────────────────────────────┼─────────────────────────────────┘
                               │
                               ▼
                        orchestrator / 嘴系统
```

### 1.1 与各系统的数据流

```
每轮对话:
  用户消息
    │
    ├──→ 脑系统 (L0+L4) → Event + tierBBlock
    ├──→ 心系统 (L1-L3) → Emotion + Relationship
    │
    └──→ 扩展系统
           ├── Dispatch 决策: plan / auto_invoke / ask_invoke / chat
           ├── Skill 执行: 搜索/天气/提醒
           ├── Plugin 钩子: beforeUserMessage / afterAssistantMessage
           └──→ ExtensionEvent 回传 → orchestrator 消费
                   ├── contextInjection → 嘴系统
                   ├── emotionHint → 心系统 (情绪调制)
                   └── action_result → UI 通知

每 60s 后台:
  Scheduler tick
    ├── 习惯维护 (升级/清理/降级)
    ├── ProactiveGate 决策
    ├── Autonomous 扩展执行 (日记/健康提醒)
    └── 特殊日检测
```

---

## 2. 核心架构

### 2.1 四层架构

```
应用层 (IPC + React UI)
  ┌─────────────────────────────────────────────┐
  │  ipc.ts · ChatPage · Surface · 扩展中心     │
  └─────────────────┬───────────────────────────┘
                     │
协调层 (ExtensionsCoordinator)
  ┌─────────────────────────────────────────────┐
  │  Singleton 协调器 · 事件队列 · 快照管理     │
  └─────────────────┬───────────────────────────┘
                     │
能力层 (Skills + Plugins + OpenForU + GameMode)
  ┌─────────────────────────────────────────────┐
  │  Skill 一次性执行 / Plugin 常驻钩子         │
  │  OpenForU 自然语言→扩展 / GameMode 游戏陪伴 │
  └─────────────────┬───────────────────────────┘
                     │
策略层 (Policy)
  ┌─────────────────────────────────────────────┐
  │  主动门控 · 强度调制 · 注意力预算 · 画像   │
  └─────────────────────────────────────────────┘
```

### 2.2 Coordinator（协调器）

**文件**：`src/main/extensions/coordinator.ts` (299 行)

单例协调器，一切扩展操作的入口：

```typescript
class ExtensionsCoordinator {
  readonly plugins: PluginRegistry
  readonly skills: SkillRegistry
  readonly openforu: OpenForULoader
  readonly gameMode: GameModeCoordinator

  // 启动序列
  async boot(snapshot):
    ① plugins.loadRegistry()
    ② skills.loadRegistry()
    ③ registerBuiltinKnowledgePresentation(plugins)
    ④ registerBuiltinDesktopCompanion(plugins)
    ⑤ registerBuiltinPlugins(plugins)        // 13 个占位
    ⑥ registerBuiltinSkills(skills)          // 约 15-20 个
    ⑦ registerPluginCatalogPlaceholders()
    ⑧ registerSkillCatalogPlaceholders()
    ⑨ ensureCoreExtensionsActive()           // 确保核心扩展启用
    ⑩ openforu.boot()                        // 加载用户自建扩展
    ⑪ community.boot() (仅社区扩展开放时)

  // 每轮 Pre-LLM 后更新快照
  updateSnapshot(snapshot):
    → 更新 gameMode / plugins / skills 的快照

  // 事件队列 — 所有扩展产的 ExtensionEvent 汇总
  drainAllEvents(): ExtensionEvent[]
  getContextInjections(): string[]
  getAggregatedEmotionHints(): { affDelta, secDelta, aroDelta, domDelta }

  // 工具调用 — LLM function calling
  getAvailableTools(): FunctionDef[]
  executeSkill(invocation): SkillResult
}
```

### 2.3 协议边界（最重要）

**文件**：`src/main/extensions/protocols.ts` (305 行)

扩展系统最核心的设计：**扩展不得直接 import 引擎内部模块**，只能通过协议接口通信。

```
允许:                             禁止:
  · 通过 Coordinator 注册          · import engine/ 内部
  · 读取 EngineSnapshot (只读)     · import memory/ 内部
  · 回传 ExtensionEvent            · 直接操作数据库
  · 调用 EngineApi 暴露的方法      · 直接读写 data/ 引擎目录
```

**EngineSnapshot** — 扩展能看到的引擎全貌：

```typescript
interface EngineSnapshot {
  personality: { presetId, T, I, S, O, R, tags, hiddenRatio? }
  emotion:     { aff, sec, aro, dom, primaryLabel, isLocked }
  relationship:{ stage, trust, rifts, atmosphere, sharedEventsCount }
  memory:      { activeFactCount, recentFactSummaries, kgNodeCount, episodeCount }
  totalTurns: number
  adultMode: boolean
  capturedAt: string
  lastActiveAt: string
  sessionId: string
}
```

**ExtensionEvent** — 扩展反馈的唯一通道：

```typescript
interface ExtensionEvent {
  id: string
  category: 'gamemode' | 'plugin' | 'skill'
  sourceId: string
  type: string
  payload: Record<string, unknown>
  emotionHint?: { affDelta, secDelta, aroDelta, domDelta }  // 情绪调制建议
  injectToContext?: boolean     // 是否注入 LLM 上下文
  contextInjection?: string     // 注入文本
  timestamp: string
}
```

**ExtensionLifecycleHooks** — Plugin 生命周期：

```typescript
interface ExtensionLifecycleHooks {
  onLoad?: (snapshot) => ExtensionOpResult
  onUnload?: () => ExtensionOpResult
  onEngineUpdate?: (snapshot) => ExtensionOpResult     // 每轮对话后
  beforeUserMessage?: (msg, snapshot) => { contextInjections }
  afterAssistantMessage?: (reply, snapshot) => ExtensionOpResult
}
```

---

## 3. Dispatch 调度系统

**目录**：`src/main/extensions/dispatch/` (14 个文件)

### 3.1 六种 Dispatch Mode

| Mode | 触发方式 | 典型用途 | 示例 |
|------|---------|----------|------|
| `dispatched` | LLM 精判 (关键词+语义+embedding→LLM) | 大多数 Skill | "帮我查天气" |
| `autonomous` | 定时器 + ProactiveGate 门控 | 主动提醒 | 久坐提醒、喝水 |
| `always_on` | 始终活跃 | 核心功能 | 桌面陪伴、知识展示 |
| `manual` | 用户明确通过 UI 触发 | 配置操作 | /diary, /remind |
| `engine_event` | 引擎事件驱动 | 游戏事件 | 游戏内成就 |
| `scheduled` | Cron 表达式 | 定时任务 | 每日 8 点问安 |

### 3.2 调度决策树 (7 优先级)

`routeDispatch()` 按严格优先级依次判断：

```
用户消息
    │
    ├── ① 显式扩展需求 (P1)
    │     "帮我做一个番茄钟" → detectExtensionDemandExplicit
    │     → decision: 'plan' (创建 OpenForU 工作区)
    │
    ├── ② 能力探测 (P2)
    │     "要是能自动记日记就好了" → shouldRunCapabilityProbe
    │     → LLM 分类: extension_demand? → 'ask_plan' | 'chat'
    │
    ├── ③ Slash 命令 (P3)
    │     "/番茄钟" → matchSlashInvoke
    │     → 'auto_invoke' (跳过 LLM, 直接触发)
    │
    ├── ④ 进化指令 (P4)
    │     "优化一下番茄钟" → matchEvolveExtension
    │     → 'evolve' (打开 Refine 模式)
    │
    ├── ⑤ Surface 打开 (P5)
    │     "打开番茄钟界面" → matchExplicitOpenSurface
    │     → 'open_surface' (打开 UI 窗口)
    │
    ├── ⑥ 显式调用 (P6)
    │     "启动番茄钟" → matchExplicitInvoke
    │     → 'auto_invoke' (直接触发)
    │
    └── ⑦ LLM 精判 (P7) ← 最复杂的路径
          │
          ├── keywordHits: 关键词精确匹配 → 候选列表
          ├── semanticHits: token 重叠 + bigram 评分 → 候选列表
          ├── embeddingCandidates: 语义路由匹配 → 候选列表
          │   (cosine 相似度 ≥ 0.70 高置信直接 auto_invoke)
          │
          └── merge → LLM rerank (3 选, 0-1 分)
                ├── ≥ 0.85 (×人格调参) → 'auto_invoke'
                ├── ≥ 0.60 (×人格调参) → 'ask_invoke' (问用户)
                └── < 0.60 → 'silent'
```

### 3.3 LLM 精判阈值调参

阈值受四个因素动态调整：

```typescript
AUTO_THRESHOLD = 0.85    // 自动触发
ASK_THRESHOLD = 0.60     // 询问用户

// 人格调参
PERSONALITY_MOD = {
  deredere: 1.15,  // 黏人型 → 更易触发
  tsundere: 0.90,  // 傲娇型 → 更难触发
  kuudere: 1.25,   // 冷娇型 → 更难触... 不对, 更易触发 (因为话少所以精)
  genki: 0.85,     // 元气型 → 更难触发 (因为话多所以抑制)
}

// 用户偏好调制
confidence += getDispatchedConfidenceDelta(dataRoot, id, rejectedInSession)
  // 用户允诺过 → +0.12
  // 用户拒绝过 → -0.20
  // 本会话拒绝 → -0.15

// 强制触发 (用户 profile 设为永久允许)
if shouldForceAutoInvoke(dataRoot, id) → 直接 auto_invoke
```

### 3.4 Intent 消解

**文件**：`dispatch/intentResolver.ts`

在处理 dispatch 前，先对用户消息做 **上下文感知意图消解**：

```
resolveIntent(msg, sessionId, llm):
  ├── isAmbiguous(msg): 纯规则检测 <0.1ms
  │     指示词: "呢/这个/那个/它/她/他"
  │     短句: "继续/然后/接着"
  │     裸问句: "怎么了？/啥呢？"
  │
  ├── 歧义 + 有话题栈 → LLM 消解
  │     prompt: "最近话题: {topic}\n用户消息: {msg}\n消解后:"
  │     10 分钟 TTL
  │
  └── 不歧义 → 原样返回
```

话题栈由前几轮 dispatch 触发时 push，辅助消解"继续""那个呢"等回指。

### 3.5 Dispatch Pipeline

**文件**：`dispatch/contextPipeline.ts`

完整的调度管线包装了所有步骤：

```
runDispatchPipeline(input):
  ┌── ① filterDispatchedCatalogByProfile 过滤用户排斥的扩展
  ├── ② matchSlashInvokeDisabled 检查 slash 禁用状态
  ├── ③ buildDispatchMemoryBlock 构建调度记忆块
  ├── ④ resolveIntent 意图消解
  ├── ⑤ Embedding 路由 (queryEmbed + routeIndex)
  ├── ⑥ routeDispatch 主决策树
  ├── ⑦ topic push 话题追踪
  ├── ⑧ 处理结果
  │     auto_invoke → executeDispatchedExtension
  │     invoke_surface → executeSurfaceInvoke
  │     ask_invoke + skipAsk → 转为 chat
  └── ⑨ 返回 extraInjections + emotionHintDelta
```

---

## 4. Skill 系统

**目录**：`src/main/extensions/skills/`

### 4.1 定位

Skill 是 **一次性执行** 的能力 — 触发→执行→返回结果，无常驻状态。

### 4.2 Skill 类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `rule` | 关键词触发 + 固定回复 | 喝水提醒 |
| `tool` | LLM function calling 工具 | web-search, weather |
| `proactive` | 定时激活的主动技能 | 日记归档 |
| `workflow` | 多步工作流 | Plan 部署 |

### 4.3 触发方式

| 触发 | 说明 |
|------|------|
| `manual` | 用户通过 UI 手动触发 |
| `keyword` | 关键词匹配后 auto_invoke |
| `llm_function_call` | LLM 通过 tool calling 调用 |
| `scheduled` | 定时器间隔触发 |
| `engine_event` | 引擎事件 |
| `game_event` | 游戏事件 |
| `system_event` | 系统事件 |

### 4.4 Skill 执行流程

```
execute({ skillId, trigger, userMessage, snapshot }):
  ├── ① 查找 handler (SkillRegistry)
  ├── ② 读取 EngineSnapshot (只读)
  ├── ③ 执行业务逻辑 (搜索API/天气API/本地计算)
  ├── ④ 返回 SkillResult
  │     ├── output → 直接回复文本
  │     ├── events[] → ExtensionEvent 数组
  │     └── injectToContext → 是否注入 LLM
  └── ⑤ orchestrator 消费结果
```

### 4.5 内置 Skill

| ID | 类型 | 功能 | 状态 |
|----|------|------|------|
| ackem/web-search | tool | 联网搜索 (LLM function calling) | 实现中 |
| ackem/weather-sense | rule+proactive | 天气感知与提醒 | 实现中 |
| ackem/diary-auto | proactive | 自动日记生成 | 实现中 |
| ackem/sedentary-reminder | proactive | 久坐提醒 | stub |
| ackem/drink-water-reminder | proactive | 喝水提醒 | stub |
| ackem/late-night-reminder | proactive | 深夜提醒 | stub |
| ackem/light-schedule | tool | 简易日程管理 | stub |
| ackem/plan-document | tool | 计划书生成 | stub |
| ackem/emergency-companion | rule | 紧急陪伴 | stub |
| ackem/markdown-table | tool | Markdown 表格 | stub |
| ackem/fun-profile | tool | 趣味分析 | stub |

---

## 5. Plugin 系统

**目录**：`src/main/extensions/plugins/`

### 5.1 定位

Plugin 是 **常驻** 的能力 — 有生命周期钩子、可有 UI 界面（Surface）、可持有状态。

### 5.2 Plugin 类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `skin` | 伴侣外观皮肤 | Live2D 皮肤 |
| `personality` | 人格扩展 | 额外人格预设 |
| `behavior` | 行为逻辑 | 知识展示板 |
| `tool` | 工具能力 | TTS 语音 |
| `game_provider` | 游戏提供方 | 五子棋引擎 |
| `skill_pack` | 技能包 | 组合多个 skill |
| `theme` | 主题 | UI 主题 |

### 5.3 权限模型 (8 级)

| 等级 | 权限 | 说明 | 风险 |
|------|------|------|------|
| L0 | `readonly` | 读取自身文件 | 安全 |
| L1 | `data_write` | 写入自身数据目录 | 低 |
| L2 | `engine_read` | 读取 EngineSnapshot | 低 |
| L3 | `engine_inject` | 注入 LLM 上下文 | 中 |
| L4 | `network_outbound` | HTTPS 出站 (禁止 localhost) | 中 |
| L5 | `system_notification` | OS 系统通知 | 低 |
| L6 | `clipboard_read` | 读取剪贴板 — **需用户批准** | 高 |
| L6 | `foreground_detect` | 检测前台应用 — **需用户批准** | 高 |

### 5.4 Surface 系统

Plugin 可以拥有 Surface（在渲染进程打开的 UI 窗口）：

```typescript
interface SurfaceConfig {
  route: string      // React 路由 (如 '/plugin/knowledge-presentation')
  size?: { width, height }
  title?: string
}
```

Surface 支持两种渲染方式：
- **`html`**: 自定义 HTML/Widget (OpenForU 默认)
- **`react-builtin`**: 内置 React 页面 (官方 Plugin)

### 5.5 内置 Plugin

| ID | 功能 | Surface | 类型 | 状态 |
|----|------|---------|------|------|
| ackem/knowledge-presentation | 知识卡片展示 | ✅ | behavior | 完成 |
| ackem/desktop-companion | 桌面状态信息 | ❌ | behavior | 完成 |
| ackem/tts-voice | 语音合成 | ❌ | tool | stub |
| ackem/companion-skin | 伴侣皮肤 | ❌ | skin | 占位 |
| ackem/live2d | Live2D 桌宠 | ❌ | skin | 占位 |

---

## 6. OpenForU — 用户自建扩展

**目录**：`src/main/extensions/openforu/` (13 个文件)

### 6.1 定位

OpenForU 允许用户在聊天中 **用自然语言创建自己的扩展**（Skill 或 Plugin），无需写代码或理解 Ackem 内部架构。这是 Ackem **从伴侣到居家智能体** 的关键能力。

### 6.2 完整流程

```
用户在聊天中说:
  "帮我做一个每天提醒我喝水的插件"
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  ① 能力探测 (dispatchRouter.ts)                             │
│     detectExtensionDemandExplicit → decision: 'plan'        │
│     或 shouldRunCapabilityProbe → LLM 分类 → 'ask_plan'     │
│     createToolAnchor cosine 匹配 ("要是能自动就好了" 等)     │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  ② Plan 工作区创建 (OpenForUCoordinator)                     │
│     createWorkspace(name?) → 写入 data/openforu/sessions/    │
│     → 用户进入 Plan 对话界面                                 │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  ③ Plan Agent 多轮对话                                       │
│     runPlanAgentTurn() — LLM 引导用户明确:                   │
│       · uskill (配置+注入) 还是 uplugin (沙箱执行+Surface)   │
│       · 触发方式 (关键词/定时/主动)                          │
│       · 行为描述                                             │
│       · 所需权限                                             │
│       · Design Spec (uplugin 的 UI 设计)                     │
│     自动同步: dispatchDraft + planSummary + designSpec       │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  ④ 确认方案 (confirmPlan)                                    │
│     检查: planSummary 就绪 || dispatchDraft 四维齐全         │
│     检查: artifactType 已明确 (uskill/uplugin)              │
│     检查: designSpec 就绪 (uplugin 需 wireframeApproved)    │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  ⑤ 生成产物                                                 │
│     uskill:  generateUskillFromSession()                    │
│       → manifest.json + skill.json (声明式配置)             │
│     uplugin: generateUpluginFromSession()                   │
│       → manifest.json + plugin.meta.json + surface.html     │
│       → injectTemplate (beforeUserMessage 回退方案)         │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  ⑥ 部署 (deployPlan)                                        │
│     ↓ 写入 data/openforu/uskills/{slug}/                    │
│     ↓ 或 data/openforu/uplugins/{slug}/                     │
│     ↓ loader.boot() 重新加载                                 │
│     ↓ 注册到 SkillRegistry / PluginRegistry                 │
│     ↓ 扩展到 Dispatch Catalog                                │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 uskill vs uplugin

| 维度 | uskill | uplugin |
|------|--------|---------|
| 本质 | 声明式配置 + contextInjection | 可执行代码 + Surface |
| 触发 | onKeyword.reply / onProactive | beforeUserMessage 钩子 |
| 权限 | engine_read, engine_inject, system_notification | 完整 8 级权限 |
| 沙箱 | 无 (不执行代码) | Worker Thread 隔离 |
| UI | ❌ | ✅ Surface Widget (HTML) |
| 失败回退 | — | injectTemplate (无 Worker 时) |
| 代码量 | ~20 行 JSON | ~50 行 JSON + HTML |
| 复杂场景 | ❌ 简单消息注入 | ✅ API 调用 + 状态 + UI |

### 6.4 沙箱 (uplugin)

**文件**：`openforu/sandbox/`

```
uplugin 执行:
  ① 用户部署 → 写入 data/openforu/uplugins/{slug}/
  ② 触发调用 → UpluginSandboxHost 创建 Worker Thread
  ③ Worker 内执行 uplugin 代码
  ④ 通过 sandboxApiBridge 访问受限 API:
       getEngineSnapshot()     — 引擎读取
       readOwnFile(path)       — 白名单路径 (路径穿越防护)
       writeOwnFile(path,data) — 需要 data_write 权限
       fetch(url)              — HTTPS only, 256KB max, 15s timeout
       notify(title,body)      — 需要 system_notification
       emitEvent(event)        — 需要 engine_read
  ⑤ 返回 invokeResult → 注入上下文 / UI 通知

  失败回退:
    Worker 初始化失败 → injectTemplate (无代码执行)
    inject 也失败 → 静默降级, 不阻塞聊天
```

### 6.5 能力探测

**文件**：`openforu/extensionIntentClassifier.ts`

纯规则的显式需求检测 + LLM 辅助的隐式需求检测：

```typescript
// 显式: "帮我做一个..."
detectExtensionDemandExplicit(msg):
  pattern: /帮我[做创建写]一个|帮我做个工具|能做一个.*吗/

// 隐式: "要是能自动就好了"
shouldRunCapabilityProbe(msg, queryEmbed?, createToolAnchor?):
  if queryEmbed && createToolAnchor:
    cosine(queryEmbed, createToolAnchor) ≥ 0.45 → 触发 LLM 分类
  else:
    规则关键词: /要是能|能自动|有个工具就好了/

// LLM 分类
classifyExtensionIntent(msg, context, llm):
  输出: {
    category: 'extension_demand' | 'ephemeral_task' | 'emotional_vent' | 'chat',
    confidence: 0-1,
    suggested_name?: string,
    reasoning?: string
  }
  // 门控: recurring + gap≥0.62 + implementable≥0.68 + composite≥0.72
```

### 6.6 Refine 模式

已部署的扩展可继续优化：

```
openRefineInPlan(extensionId, opts?):
  ① 查找已关联的 Plan 工作区
  ② 找不到 → 创建新工作区 "优化 · 扩展名"
  ③ linkExtensionToPlan(sessionId, extensionId)
  ④ 设置 refineMode = true, planConfirmed = false
  ⑤ 用户描述修改需求 → redeployPlan() 重新生成
```

这种"聊天造扩展→不满意再聊再改"的闭环，是 OpenForU 的核心体验。

---

## 7. GameMode 游戏陪伴系统

**目录**：`src/main/extensions/gamemode/`

### 7.1 定位

GameMode 让 Ackem 能在游戏中陪伴用户 — 看棋局、给反应、记回忆，**不直接参与游戏逻辑**。

### 7.2 架构

```
GameProvider 接口:
  connect(config) / disconnect()
  getStatus()
  pushEvent(event)
  onEvent(callback)          ← 游戏事件监听
  updateSnapshot(snapshot)   ← 引擎快照同步
  drainEvents()

GameModeCoordinator (单例):
  registerProvider(provider)
  activateGame(gameId, config)
  deactivateGame()
  invoke(gameId, method, params)  ← RPC 调用

集成方式:
  GameEvent → handleGameEvent() → ExtensionEvent
    → contextInjection + emotionHint → orchestrator
```

### 7.3 游戏事件 → 伴侣反应

```typescript
handleGameEvent(event):
  valance: 'positive' | 'negative' | 'neutral'
  severity: 0-1

  ① 先问 provider.buildReaction(event) — 自定义反应
  ② 无自定义 → 默认反应:
       positive → "哇！/好耶~/太棒了！"
       negative → "啊……/小心！/没事吧？"
       neutral  → "嗯？/我在看呢~/继续加油~"
  ③ severity > 0.5 → 写入记忆:
       "[{gameId}] {event.raw}" → 注入 LLM 上下文
  ④ 情绪影响:
       positive: aff+2, sec+1, aro+2
       negative: aff-1, sec-2, aro+2
```

---

## 8. 策略层 (Policy)

**目录**：`src/main/extensions/policy/` (11 个文件)

### 8.1 ProactiveGate — "该不该说话"

**文件**：`policy/proactiveGate.ts`

9 条纯规则决策树 (<1ms)：

```
evaluateProactiveGate({ snapshot, runtime, matchedHabits, foregroundBusy, budgetExceeded })
    │
    ├── ① 长时 DND/会议习惯 → silent (30min)
    ├── ② rifts ≥ 2 (刚吵过架) → silent (15min)
    ├── ③ 前台会议/PPT/专注 → silent (15min)
    ├── ④ 注意力预算超标 → whisper (10min)
    ├── ⑤ 情绪波动大 + 负面 → whisper (10min)
    ├── ⑥ 情绪波动大 + 正面 + INTIMATE → proactive (5min)
    ├── ⑦ 深夜 + 用户不在活跃 → whisper (20min)
    ├── ⑧ 周末早上 + 关系 FAMILIAR+ → proactive (5min)
    ├── ⑨ 短时 DND/休息习惯 → whisper (10min)
    └── ⑩ 默认 → casual (1min)
```

proactiveLevel 影响后续调度:
- **silent**: 不主动说话, 跳过非维护类 autonomous 扩展
- **whisper**: 仅允许非健康类扩展, defer 健康提醒
- **casual**: 正常触发
- **proactive**: 可主动发起 (cooldown 缩短)

**情绪波动计算**:

```typescript
computeAffVolatility():
  window = 最近 10 轮 aff 值
  mean = average(window)
  variance = sum((v - mean)²) / N
  return sqrt(variance)
```

### 8.2 IntensityModulator — 语气强度

**文件**：`policy/intensityModulator.ts`

```
computeIntensityModifier({ snapshot, runtime, matchedHabits }):
  mod = 1.0 (基线)
  if aff > 60   → +0.2   // 开心, 语气活泼
  if aff < 20   → -0.2   // 低落, 语气平稳
  if aro > 60   → +0.1   // 兴奋, 可以多话
  if dom < -30  → -0.1   // 不安, 更谨慎
  if INTIMATE   → +0.1
  if STRANGER   → -0.1
  if 深夜/夜间  → -0.15
  if 周末早上   → +0.1
  if 休息习惯   → -0.1
  return clamp(0.5, 1.5)
```

### 8.3 其他策略模块

| 文件 | 职责 |
|------|------|
| `attentionBudget.ts` | 每小时主动消息配额 (默认 3 条) |
| `toolDecider.ts` | 根据习惯和用户偏好决定 suppress/ask/auto_invoke |
| `userProfile.ts` | 每个扩展的用户偏好 (永久允许/拒绝/隐藏) |
| `evaluate.ts` | 综合策略评估 (维护绕行→紧急绕行→全局 DND→...) |
| `decisionLogStore.ts` | 决策日志持久化 (供 UI 回溯) |
| `decisionLogRouting.ts` | 决策反馈路由 (调整后续决策) |

---

## 9. Autonomous 调度器

**文件**：`dispatch/scheduler.ts`

每 60s 后台 tick：

```
tickAutonomousDispatch(opts):
  │
  ├── ① 习惯维护 (每小时)
  │     ├── promoteShortTermHabits  短时→长时
  │     ├── cleanupExpired          清理过期
  │     ├── scanForegroundHistory   前台→候选习惯
  │     └── decayLongTermHabits     长时降级 (凌晨3点)
  │
  ├── ② 日记补写 (tryCatchUpMissedDiary)
  │
  ├── ③ ProactiveGate 决策
  │
  └── ④ 遍历 autonomous 扩展
        ├── 是否到时间 (interval_ms / daily_at)
        ├── 是否在活跃时段内
        ├── proactiveGate = silent 时跳过非维护类
        ├── proposeGate = whisper 时 defer 健康类
        ├── evaluateAutonomousExtensionPolicy
        ├── toolDecider 判断
        └── 执行 → recordProactiveMessage
```

---

## 10. Community 生态（当前关闭）

**文件**：`src/main/extensions/ecosystem/`

**开关**：`src/shared/communityExtensionFeature.ts` → `COMMUNITY_EXTENSIONS_OPEN = false`

### 10.1 包格式

`.ackem-ext` 文件 = zip + 签名侧车：

```
package.ackem-ext
├── format_version: "1.0"
├── publisherId: "community_publisher"
├── manifest.json
├── files/                     # 扩展文件 (keyed by path)
├── files.sha256               # 文件摘要
└── signature.sig              # Ed25519 签名
```

### 10.2 信任链

```
verify():
  ① manifest.json → canonical JSON
  ② files.sha256 → 验证每个文件的 SHA-256
  ③ signature.sig → 用 publisher 公钥验证
  ④ trust/publishers.json → 检查 publisher 是否受信任
  ⑤ scope 检查 → publisher 是否有权限发布此 ID
```

### 10.3 关闭时的行为

- `coordinator.boot()` 不调用 community.boot()
- `installCommunityPackage()` 返回「社区扩展市场暂未开放」
- `data/extensions/community/` 不会被加载
- 贡献者路径：本机 `u/` 试验 → PR 到 `ackem/` → 随发行包分发

---

## 11. 远景：居家智能体伴侣

Ackem 的扩展系统设计从一开始就考虑了 **从聊天伴侣到居家智能体** 的进化路径。

### 11.1 当前能力

```
当前 (v1.0):
  ┌─────────────────────────────────────────┐
  │  聊天伴侣                                │
  │  · 情绪感知 + 关系经营                    │
  │  · 记忆 + 主动关怀                       │
  │  · 基础 Skill: 天气/搜索/提醒            │
  │  · OpenForU: 用户自建 uskill/uplugin     │
  │  · GameMode: 游戏陪伴                    │
  └─────────────────────────────────────────┘
```

### 11.2 近期目标

```
近期 (v1.x):
  ┌─────────────────────────────────────────┐
  │  个人助理                                │
  │  · 日程管理 (日历同步 + 智能提醒)        │
  │  · 邮件/消息摘要                         │
  │  · 文件管理 (整理/归档/搜索)             │
  │  · Web 搜索 + 知识问答                   │
  │  · TTS 语音输出 + 简单语音输入           │
  │  · 桌面自动化 (窗口管理/快捷键)          │
  └─────────────────────────────────────────┘
```

### 11.3 中长期愿景

```
中期 (v2.x):
  ┌─────────────────────────────────────────┐
  │  居家控制中心                            │
  │  · IoT 设备控制 (米家/HomeKit 桥接)     │
  │     "把客厅灯调到暖色"                   │
  │     "空调开到 26 度"                    │
  │  · 环境感知 (温度/湿度/空气质量)        │
  │  · 安防监控 (摄像头事件通知)             │
  │  · 能源管理 (用电统计/节能建议)         │
  │  · 多房间语音分布                       │
  │  · 定时场景 (起床/离家/睡眠自动化)      │
  └─────────────────────────────────────────┘

长期 (v3.x):
  ┌─────────────────────────────────────────┐
  │  智能体生态                              │
  │  · 社区扩展市场 (已设计, 待开放)        │
  │  · 多智能体协作 (Ackem 调用其他 AI)     │
  │  · 跨设备同步 (手机/PC/智能音箱)        │
  │  · 主动学习用户习惯 (非 LLM, 本地)     │
  │  · 家庭成员识别 + 个性化                │
  │  · 健康管理 (用药提醒/运动建议/数据)    │
  │  · 第三方服务集成 (外卖/打车/购物)      │
  └─────────────────────────────────────────┘
```

### 11.4 架构支撑

扩展系统现有设计已经为这些远景做了准备：

| 远景需求 | 现有架构支撑 |
|---------|-------------|
| IoT 设备控制 | `network_outbound` 权限 + Worker 沙箱 + auto_invoke dispatch |
| 定时场景 | `autonomous` mode + `scheduled` subtype + 习惯系统 |
| 环境感知 | `foreground_detect` 权限 + proactive 技能 + contextInjection |
| 多房间分布 | IPC 协议 + ExtensionEvent 标准化 |
| 社区生态 | `.ackem-ext` 包格式 + Ed25519 签名 + 信任链 |
| 语音交互 | TTS Plugin (stub) + 通道系统 (weixin/) |
| 用户习惯学习 | habitsStore + decisionLog + userProfile |
| 第三方集成 | OpenForU 沙箱 + HTTPS 出站 + 权限审批 |
| 主动关怀 | ProactiveGate + IntensityModulator + attentionBudget |

### 11.5 扩展接入路线图

```
外部能力接入步骤:
  1. 实现 SkillHandler (规则/tool/proactive)
  2. 定义 DispatchConfig (触发方式 + 活跃时段)
  3. 声明所需权限 (engine_read / network_outbound / ...)
  4. 注册到 SkillRegistry
  5. LLM function calling 或 dispatch 自动触发

家居设备接入:
  1. 本地 Hub 服务 (进程内或子进程)
  2. OpenForU uplugin (沙箱 Worker + HTTPS API)
  3. community 签名包 (审核 + 签名 + 分发)
  4. (未来) 设备制造商官方插件

用户自定义:
  1. 聊天描述需求 → Plan Agent → 生成部署 (无需写代码)
  2. 不满意 → Refine 模式继续优化
  3. 高级用户 → 直接编辑 data/openforu/ 下的 JSON
```

---

## 12. 修改指南

| 你想… | 先看 |
|-------|------|
| 新增官方 Skill | `skills/registry.ts` + `skills/builtin/` |
| 新增官方 Plugin | `plugins/registry.ts` + 生命周期钩子 |
| 改调度决策树 | `engine/dispatchRouter.ts` routeDispatch |
| 改调度阈值 | `engine/dispatchRouter.ts` AUTO_THRESHOLD / ASK_THRESHOLD |
| 改 Intent 消解 | `dispatch/intentResolver.ts` |
| 改 Embedding 路由 | `dispatch/candidateCollector.ts` collectEmbeddingCandidates |
| 改 OpenForU Plan 流程 | `openforu/coordinator.ts` + `agentPipeline.ts` |
| 改权限系统 | `openforu/permissionGate.ts` + `protocols.ts` |
| 改沙箱实现 | `openforu/sandbox/` + `sandboxApiBridge.ts` |
| 改主动消息策略 | `policy/proactiveGate.ts` |
| 改语气强度调制 | `policy/intensityModulator.ts` |
| 改注意力预算 | `policy/attentionBudget.ts` |
| 改 autonomous tick | `dispatch/scheduler.ts` |
| 改能力探测 | `openforu/extensionIntentClassifier.ts` |
| 改社区生态 (日后开放) | `ecosystem/` |
| 改能力列表文案 | `dispatch/extensionCapabilityListing.ts` |

---

## 13. 相关文档

| 文档 | 链接 |
|------|------|
| 扩展开发者接口协议 | [DEVELOPER-EXTENSION-PROTOCOL.md](../DEVELOPER-EXTENSION-PROTOCOL.md) |
| OpenForU 内部协议 | [openforu/PROTOCOL.md](../../src/main/extensions/openforu/PROTOCOL.md) |
| 整体系统 | [00-overall-system.md](./00-overall-system.md) |
| 脑系统 | [01-brain-system.md](./01-brain-system.md) |
| 神经系统 | [04-neural-system.md](./04-neural-system.md) |

*扩展系统 · Ackem v1.0.0 · 2026-06*
