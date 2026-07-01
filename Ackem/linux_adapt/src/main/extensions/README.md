# Ackem 扩展系统 — 开发者指南

> 版本：1.0.0 | 最后更新：2026-05-24 凌晨

---

## 零、概述

Ackem 扩展系统为开发者提供**四个独立的接入通道**，让你可以为 AI 伴侣添加新能力，而**不需要理解核心引擎的内部实现**。

**对话认知分层**（扩展开发者常问）：扩展调度 / 管家分寸 / **用户要什么成品** 是不同层 — 见 [DEVELOPER-EXTENSION-PROTOCOL.md](../../docs/developer/DEVELOPER-EXTENSION-PROTOCOL.md) 与架构文档 [05-extension-system.md](../../docs/developer/architecture/05-extension-system.md)。扩展只需读 `UserTaskFrame`（若影响呈现），**勿**与 `extensions/policy/` 混写。

| 模块 | 一句话 | 适合场景 |
|------|--------|---------|
| **GameMode** | 让伴侣进入游戏陪你玩 | 适配新游戏（原神、星露谷、LOL…） |
| **Plugins** | 换皮、换性格、加工具 | Live2D 皮肤、新人格、文件操作工具 |
| **Skills** | 让伴侣能干活 | 网页搜索、文件整理、天气预报、定时提醒 |
| **OpenForU** | 用户自创扩展（AI 辅助生成） | 通过对话让 Ackem 帮你写 uskill/uplugin |

**核心原则**：扩展模块通过标准化协议与引擎通信，绝不直接修改引擎内部状态。

**扩展不可用时的行为**（未安装、规划中、用户关闭）：对话层当作「没有这个功能」，静默降级为正常聊天 — 详见 [`EXTENSION_AVAILABILITY_POLICY.md`](./EXTENSION_AVAILABILITY_POLICY.md)。

---

## 一、架构速览

```
┌─────────────────────────────────────────────┐
│              核心引擎 (engine/)              │
│  L0 解释 → L1 关系 → L2 情绪 → L3 表达      │
│  + L0·TF 交付理解 (taskFrame/) — 见认知分层文档 │
│  + MnemoStack 记忆 (memory/)                │
├─────────────────────────────────────────────┤
│  context/（CTX）  extensions/policy/（JP）   │
├─────────────────────────────────────────────┤
│         ExtensionsCoordinator               │  ← 唯一桥梁
│  只读快照 ◄── 引擎  ──► ExtensionEvent      │
├───────────┬──────────┬──────────┬───────────┤
│ GameMode  │ Plugins  │  Skills  │ OpenForU  │
│ 协调器    │ 注册表   │ 注册表   │ Agent管线 │
├───────────┴──────────┴──────────┴───────────┤
│           IPC 通道 (ext:*)                   │
├─────────────────────────────────────────────┤
│          渲染进程 (React UI)                 │
│ 游戏面板 │ 插件市场 │ 技能管理 │ 我的扩展    │
└─────────────────────────────────────────────┘
```

**你只需要关心**：你的扩展模块和 `ExtensionsCoordinator` 之间的接口。引擎内部对你完全不透明——你只能看到 `EngineSnapshot`（只读快照），也只能通过 `ExtensionEvent` 发送反馈。

---

## 二、快速开始：写一个"PPT 休息提醒"插件

这是一个最简单的插件示例。它检测你连续工作了 30 分钟，然后让 Ackem 提醒你休息。

### 2.1 创建 manifest

```json
{
  "id": "ackem/ppt-break-reminder@1.0.0",
  "name": "PPT 休息提醒",
  "version": "1.0.0",
  "category": "plugin",
  "pluginType": "behavior",
  "description": "检测到你长时间使用 PPT 时，提醒你休息",
  "author": "你的名字",
  "license": "AGPL-3.0",
  "main": "index.js",
  "engineVersion": "0.1.0",
  "permissions": ["readonly", "engine_read", "system_notification"],
  "tags": ["健康", "提醒"]
}
```

### 2.2 编写逻辑

```typescript
// index.js — 插件入口
// 沙箱内可用的 API 通过全局 __ackemPlugin 对象暴露

const THIRTY_MINUTES = 30 * 60 * 1000
let lastActivityTime = Date.now()

export const hooks = {
  // 引擎每轮更新后调用
  onEngineUpdate: async (snapshot) => {
    // snapshot = { personality, emotion, relationship, memory, totalTurns, adultMode }
    const now = Date.now()
    if (now - lastActivityTime > THIRTY_MINUTES) {
      // 产出事件
      __ackemPlugin.emitEvent({
        category: 'plugin',
        sourceId: 'ackem/ppt-break-reminder@1.0.0',
        type: 'break_reminder',
        payload: {
          message: '你已经连续工作超过 30 分钟了，休息一下吧~',
          idleMinutes: Math.floor((now - lastActivityTime) / 60000)
        },
        injectToContext: true,
        contextInjection: '[系统提醒] 用户已经连续工作超过 30 分钟，建议提醒休息。',
        emotionHint: { affDelta: 1, secDelta: 1 }
      })
      lastActivityTime = now // 防止重复触发
    }
  },

  onLoad: async (snapshot) => {
    __ackemPlugin.log('info', `PPT 休息提醒已加载 — 当前陪伴者：${snapshot.personality.presetId}`)
  }
}
```

### 2.3 打包成 `.kplugin`

```
ppt-break-reminder/
├── manifest.json
├── index.js
└── icon.png          # 可选
```

压缩成 zip，改后缀为 `.kplugin`，放入 `data/imports/` → 在设置页导入。

---

## 三、GameMode 开发指南

### 3.1 概念

`GameProvider` 是一个**游戏事件源**的抽象。它监控游戏状态，将游戏内事件转化为标准化的 `GameEvent`，并接收 `CompanionReaction`。

### 3.2 GameProvider 接口

```typescript
interface GameProvider {
  readonly gameId: string           // 游戏唯一标识，如 "genshin_impact"
  readonly manifest: GameProviderManifest

  connect(config: GameProviderConfig): Promise<void>
  disconnect(): Promise<void>
  getStatus(): GameProviderStatus

  // 设置回调：当新事件到达时，协调器通过此回调获取反应
  onEvent(handler: (event: GameEvent) => Promise<CompanionReaction | null>): void

  // 接收引擎快照更新（每轮对话后调用）
  updateSnapshot(snapshot: EngineSnapshot): void
  drainEvents(): ExtensionEvent[]
}
```

### 3.3 GameEvent 格式

```typescript
{
  id: "genshin-death-2026-05-20-001",
  gameId: "genshin_impact",
  type: "player_death",           // 事件类型
  severity: 0.7,                  // [0-1]
  valence: "negative",            // positive / negative / neutral
  raw: "角色因坠崖而死亡",        // 原始文本
  timestamp: "2026-05-20T14:30:00Z",
  payload: {
    character: "旅行者",
    cause: "fall_damage",
    location: "璃月·绝云间"
  },
  dedupKey: "genshin-death-fall_damage-2026-05-20-14:30"
}
```

### 3.4 CompanionReaction 格式

```typescript
{
  eventId: "genshin-death-2026-05-20-001",
  mode: "action_and_speech",      // action | speech | bubble | action_and_speech | silent
  action: "gasp",                 // 动作名称（由桌宠系统解析）
  bubble: "小心！摔得疼不疼？",   // 气泡文本
  emotion: {
    delta: { aff: 0, sec: -1, aro: 3, dom: -1 },
    labelPriority: ["WORRIED", "CARING"]
  },
  shouldRemember: true,
  memorySummary: "在璃月绝云间坠崖",
  cooldownSeconds: 30
}
```

### 3.5 游戏事件 → 伴侣反应的完整流程

```
游戏进程 → GameProvider 事件源 (log tail / WS / memory scan)
    │
    ▼
GameEvent (标准化格式)
    │
    ├─→ Provider 内部模板匹配 / LLM 文案生成
    │
    ▼
CompanionReaction (动作 + 气泡 + 情绪偏移)
    │
    ├─→ 桌宠执行动作、显示气泡
    ├─→ ExtensionEvent.emotionHint → 引擎情绪微调
    └─→ shouldRemember → 写入情节记忆
```

### 3.6 示例：为游戏新增 Provider

参见 `providers/minecraft/provider.ts` — 这是完整的 Minecraft Provider 实现参考。

每个新游戏 Provider 需实现：
1. **事件源监听器** (log tail / WebSocket / process stdout)
2. **事件解析器** (正则 / JSON parse → `GameEvent`)
3. **反应模板** (事件类型 → `CompanionReaction` 模板，支持变量替换)
4. **去重逻辑** (基于 `dedupKey`)

---

## 四、Plugins 开发指南

### 内置目录与占位

未实装功能的目录骨架见：

- `plugins/builtin/CATALOG.md` — 按 `skin/`、`behavior/`、`tool/` 等分类的 16 项占位
- `skills/builtin/CATALOG.md` — 按 `scheduled/`、`system_event/`、`tool/` 等分类的 20 项占位

每项含 `manifest.json`、`manifest.ts`、`stub.ts`、`README.md`。

- **`stub.ts` 不是运行时入口** — 详见 [`STUB_FILES.md`](./STUB_FILES.md)（FIX-033）。仅满足 manifest schema；禁止在 `register*.ts` 中 import。
- 占位**不会**在启动时自动注册；实装后改 `register-placeholders.ts` 并接入 `coordinator.boot()`。

重新生成占位：`node scripts/scaffold-extension-placeholders.mjs`  
同步 stub 头注释：`node scripts/sync-stub-headers.mjs`

### 4.1 插件类型

| 类型 | 说明 | 权限需求 |
|------|------|---------|
| `skin` | Live2D 模型、CSS 主题、表情包 | `readonly` |
| `personality` | 新人格预设、种子记忆、语气模组 | `readonly` + `engine_read` |
| `behavior` | 事件反应链、主动行为规则 | `engine_read` + `engine_inject` |
| `tool` | 工具插件（文件操作、网页搜索等） | `data_write` + `network_outbound` |
| `game_provider` | 新游戏陪伴 Provider | `engine_read` + `system_notification` |
| `skill_pack` | 一组 Skills 的集合 | 取决于包含的 Skills |
| `theme` | 主题包（配色、字体） | `readonly` |

### 4.2 权限分级

| 权限 | 级别 | 需审批 | 说明 |
|------|------|--------|------|
| `readonly` | L0 | 否 | 只能读自己的数据目录 |
| `data_write` | L1 | 是 | 可写 `staging/` 和自身目录 |
| `engine_read` | L1 | 是 | 可读伴侣的情绪和记忆状态 |
| `engine_inject` | L2 | 是 | 可向对话上下文注入文本 |
| `network_outbound` | L2 | 是 | 可发起出站网络请求 |
| `system_notification` | L2 | 是 | 可发送系统通知 |
| `clipboard_read` | L3 | 是 | 可读剪贴板（每次需确认） |
| `foreground_detect` | L3 | 是 | 可检测前台窗口标题 |

### 4.3 插件 API（沙箱内可用）

```typescript
// 通过全局变量 __ackemPlugin 访问
interface PluginSandboxApi {
  getEngineSnapshot(): EngineSnapshot | null
  emitEvent(event: ExtensionEvent): void
  readOwnFile(path: string): Promise<string>
  writeOwnFile(path: string, content: string): Promise<void>
  log(level: string, message: string): void
  getDataDir(): string
}
```

### 4.4 打包格式

```
my-plugin/
├── manifest.json       # 必须
├── index.js            # 必须（主入口，导出 hooks）
├── assets/
│   ├── icon.png
│   └── styles.css
└── data/               # 可选（安装时复制到插件数据目录）
    └── config.json
```

打包（注意：**zip 包内第一层必须是 manifest.json 和 index.js**，不能多一层同名文件夹）：

```bash
cd my-plugin && zip -r ../my-plugin.kplugin .
```

Windows 用户注意：不要在文件夹外层右键"压缩到 zip"——那样会多一层 `my-plugin/` 导致加载失败。正确做法是**进入文件夹，选中所有文件**后压缩，或使用上述命令。

---

## 五、Skills 开发指南

### 5.1 概念

Skill 是 Ackem 的"执行单元"。不同于核心引擎（做情绪/关系/记忆），Skill 负责**具体的任务**。

### 5.2 Skill 类型

| 类型 | 触发方式 | 示例 |
|------|---------|------|
| `rule` | 关键词匹配或 `shouldTrigger()` | "帮我记一下"→写 memory |
| `tool` | LLM function calling | `web_search("天气")` |
| `proactive` | `shouldActivate()` 定时检查 | 久坐提醒、喝水提醒 |
| `workflow` | 多步骤编排 | "整理下载文件夹"→扫描→分类→报告 |

### 5.3 SkillHandler 接口

```typescript
interface SkillHandler {
  manifest: SkillManifest

  // 核心方法：执行技能
  execute(invocation: SkillInvocation): Promise<SkillResult>

  // 可选：判断是否应触发（rule 类必须实现）
  shouldTrigger?(userMessage: string, snapshot: EngineSnapshot): boolean

  // 可选：判断是否应主动触发（proactive 类必须实现）
  shouldActivate?(snapshot: EngineSnapshot): Promise<boolean>

  // 可选：获取主动触发的调用参数
  getProactiveInvocation?(snapshot: EngineSnapshot): Promise<SkillInvocation>
}
```

**shouldActivate 示例 — 久坐提醒：**

```typescript
async shouldActivate(snapshot: EngineSnapshot): Promise<boolean> {
  const idleMinutes = await this.getIdleTimeMinutes() // 从 OS API 获取
  if (idleMinutes < 45) return false
  // 30 分钟内已经提醒过则不再触发
  if (Date.now() - this.lastReminderTime < 30 * 60 * 1000) return false
  // 用户处于应急模式时抑制
  if (snapshot.emotion.primaryLabel === 'DISTRESSED') return false
  return true
}
```
```

### 5.4 编写一个 tool 类 Skill：网页搜索

```typescript
// web-search.skill.ts
import type { SkillHandler, SkillManifest, SkillInvocation, SkillResult } from '../types'

const manifest: SkillManifest = {
  id: 'ackem/web-search@1.0.0',
  name: '网页搜索',
  version: '1.0.0',
  category: 'skill',
  skillType: 'tool',
  description: '搜索网页获取实时信息',
  author: 'Ackem 官方',
  license: 'AGPL-3.0',
  main: 'web-search.skill.ts',
  engineVersion: '0.1.0',
  triggers: ['llm_function_call'],
  permissions: ['network_outbound'],
  timeoutMs: 15000,
  adultModeSafe: true,
  functionDef: {
    name: 'web_search',
    description: '搜索网页获取实时信息。当用户询问当前事件、新闻、天气等需要最新数据的问题时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' }
      },
      required: ['query']
    }
  }
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const query = invocation.args?.query as string
  if (!query) {
    return { ok: false, output: '未提供搜索关键词', injectToContext: false, events: [], durationMs: 0 }
  }

  // 调用搜索引擎 API（使用用户配置的端点）
  const start = Date.now()
  try {
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`)
    const data = await response.json()
    const summary = data.AbstractText || data.Answer || '未找到相关信息'

    return {
      ok: true,
      output: summary,
      injectToContext: true,
      events: [],
      durationMs: Date.now() - start
    }
  } catch (err) {
    return {
      ok: false,
      output: '',
      error: String(err),
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }
}

export const skill: SkillHandler = { manifest, execute }
```

### 5.5 Skill 与 LLM 的交互流程

```
用户消息
    │
    ▼
context.ts 构建 LLM 请求
    │ tools = getAvailableTools()  ← 来自 SkillRegistry
    ▼
LLM 回复: { function_call: { name: "web_search", arguments: { query: "北京天气" } } }
    │
    ▼
chat.ts 解析 function_call → findByFunctionName("web_search") → skill.execute(invocation)
    │
    ▼
SkillResult { output: "北京今日晴，25°C..." }
    │
    ▼
chat.ts 将结果作为 tool message 追加到对话 → LLM 用自然语言回复用户
```

---

## 六、数据目录约定

扩展系统**绝不写入**引擎核心目录。数据隔离如下：

```
data/
├── memory/          ← 引擎权威目录（扩展模块禁止写入）
├── companion/       ← 引擎权威目录（扩展模块禁止写入）
├── preferences/     ← 引擎权威目录（扩展模块禁止写入）
├── extensions/      ← 扩展系统专属
│   ├── plugins/
│   │   ├── _registry.json
│   │   └── <plugin-id>/
│   │       ├── manifest.json
│   │       └── data/        ← 插件私有数据
│   ├── skills/
│   │   ├── _registry.json
│   │   └── <skill-id>/
│   └── gamemode/
│       ├── cache/
│       └── providers/
└── staging/         ← Skill 工具可写入的临时区域
```

---

## 七、协议版本与兼容性

| 项目 | 策略 |
|------|------|
| `EngineSnapshot` 结构 | 只增不减（新增字段放在末尾，旧字段保留） |
| `ExtensionEvent` 格式 | 字段增删通过 `version` 字段标记 |
| `manifest.engineVersion` | semver 范围匹配（如 `>=0.1.0 <1.0.0`） |
| 数据迁移 | 旧版本扩展自动禁用，提示开发者升级 |

`EngineSnapshot` 当前版本字段一览：

```typescript
{
  personality: { presetId, T, I, S, O, R, tags, hiddenRatio? }
  emotion:    { aff, sec, aro, dom, primaryLabel, isLocked }
  relationship: { stage, trust, rifts, atmosphere, sharedEventsCount, consecutivePositiveTurns }
  memory:     { activeFactCount, recentFactSummaries[], kgNodeCount, episodeCount }
  totalTurns: number
  adultMode:  boolean
  capturedAt: string  // ISO
}
```

---

## 八、加入"贾维斯计划"

我们正在寻找第一批社区贡献者：

### 8.1 第一批待建设内容

| 模块 | 项目 | 难度 | 工作量 |
|------|------|------|--------|
| GameMode | 为《原神》写 GameProvider | ★★☆ | ~3 天 |
| GameMode | 为《星露谷物语》写 GameProvider | ★★☆ | ~3 天 |
| Plugins | 编写一个 Live2D 桌宠渲染插件 | ★★★ | ~1 周 |
| Plugins | 编写 5 个新人格预设 | ★☆☆ | ~1 天 |
| Skills | 网页搜索 Skill | ★★☆ | ~2 天 |
| Skills | 文件整理 Skill（按类型分文件夹） | ★★☆ | ~2 天 |
| Skills | 天气预报 Skill（Open-Meteo） | ★☆☆ | ~1 天 |
| Skills | 番茄钟/专注计时 Skill | ★★☆ | ~2 天 |

### 8.2 贡献流程

1. Fork 仓库 → 在 `extensions/` 下创建你的模块
2. 按本文档规范写 `manifest.json` 和入口文件
3. 附带 `README.md`（描述用法、权限需求、已知限制）
4. 提交 PR → 代码审查 → 合并 → 在插件市场上线

**快速开始**：使用模板仓库或 CLI 脚手架（规划中）生成新扩展模板：
```bash
# 方式一：GitHub 模板仓库（立即可用）
git clone https://github.com/JasonLiu0826/ackem-extension-template.git my-skill

# 方式二：CLI 脚手架（即将发布）
npx ackem-cli create my-skill --type skill
```

### 8.3 设计原则（请遵守）

- **不侵入引擎**：只通过 `ExtensionEvent` 通信，不直接 import `engine/` 或 `memory/`
- **权限最小化**：只申请实际需要的权限
- **错误不传播**：你的错误不应导致引擎崩溃
- **用户可控**：敏感行为必须有开关
- **默认关**：主动行为类功能安装后默认关闭

---

*本文档随 Ackem 核心引擎版本同步更新。如有疑问或建议，请在 GitHub Issue 中标注 `extensions` 标签。*
