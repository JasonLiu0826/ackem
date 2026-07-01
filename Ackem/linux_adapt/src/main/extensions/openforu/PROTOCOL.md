# OpenForU 用户扩展协议（v1）

> **读者**：通过 Plan 部署、或手改 `data/openforu/` 下 JSON/代码的用户与贡献者。  
> **原则**：用户扩展 **100% 复用** 官方 Skill/Plugin manifest + **Dispatch 调度协议**，额外约束 `u/` 前缀与权限上限。

---

## 一、和「眼睛 + 管家 + 手脚」怎么配合？

Ackem 扩展调度对标 Jarvis 三层（详见 `docs/mainDocs/对话认知分层_5_28更新.md`）：

```
用户发消息
    │
    ▼
┌─────────────────────────────────────┐
│  CTX 状态层（眼睛）                    │  context/runtimeContext.ts
│  时段、活跃度、生活场景（工作/出游…）      │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Dispatch 调度层（手脚入口）            │  dispatchRouter + contextPipeline
│  从 catalog 里选：要不要调某个扩展？       │
│  · Create 轨 → OpenForU Plan          │
│  · Use 轨   → auto_invoke / invoke_surface / open_surface / ask_invoke │
└─────────────────────────────────────┘
    │  filterDispatchedCatalogByProfile
    ▼
┌─────────────────────────────────────┐
│  JP 管家层（分寸）                      │  extensions/policy/
│  用户「记住选择/勿扰」、扩展偏好过滤       │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Skill / Plugin 执行（手脚）            │  dispatchExecutor → Skill.execute
│  uskill：contextInjection 注入 LLM     │  uplugin：beforeUserMessage hooks
│  uplugin Surface：BrowserWindow + HTML │  （见 §4.5 invoke 协议）
└─────────────────────────────────────┘
    │
    ▼
  伴侣 LLM 回复（L1–L4 情绪/关系/表达）
```

**用户自创扩展要能被这套流程调用，必须满足：**

| 条件 | uskill | uplugin |
|------|--------|---------|
| id 以 `u/` 开头 | ✅ | ✅ |
| 文件在 `data/openforu/` | ✅ | ✅ |
| `manifest.dispatch` 完整且 `mode: dispatched` | ✅ **必填** | ✅ **必填**（才能进 catalog） |
| 注册表状态 `active` | ✅ | ✅ |
| 有可调用的 handler/hooks | ✅ 配置驱动 | ✅ inject 轨 / Worker 轨 / Surface 轨（见 §4） |

> **v1 现实（2026-06）**：Plan 部署的 **uskill / uplugin 均已走完整 Dispatch 链**；带 UI 的 uplugin 通过 **Extension Surface + invoke_surface** 自动开独立窗口。  
> **对标文档**：`docs/review/贾维斯对标_5_28.md`（执行层随 Surface 持续补齐）。

### 1.1 主聊天如何进入 Plan（Create 轨）

模块：`dispatch/explicitDispatch.ts` → `routeDispatch` Step 0（**不经** L0 解释层 LLM）。

| 用户说法 | 路由 |
|----------|------|
| 「帮我/ **给我** / 帮帮我」+ 做/做个… + **Skill / 插件 / XX器** | `decision: plan` → 开 Plan 工作区 |
| 「给我做个差距提醒器，我要卧薪尝胆」 | 同上（句尾动机不破坏 topic） |
| 「帮我做番茄钟」（无制品词） | Capability Probe → 聊天内确认卡 → Plan |
| 漏判 / 未进 Plan | 普通聊天（**勿**期待真执行；v1 uskill 亦仅 injection） |

改 main 进程规则后须 **重启 Ackem**。详见 `explicitDispatch.test.ts`。

## 二、文件落盘位置（和 src 模板的区别）

| 用途 | 路径 | 说明 |
|------|------|------|
| **用户真扩展** | `{dataRoot}/openforu/uskills/<slug>/` | Plan 部署或手改后放这里 |
| **用户真插件** | `{dataRoot}/openforu/uplugins/<slug>/` | 同上 |
| **仓库内模板/例题** | `src/main/extensions/openforu/uskills|uplugins/` | 给开发者参考，**不会被运行时加载** |

`{dataRoot}`：设置 → 数据与备份 → 「当前」路径（便携模式默认 `Ackem/data`）。

### 2.1 Design Spec（Create 轨单一真相源）

Plan 确认方案后固化结构化规格，供 generate / deploy / verify / Delivery Card 共用。类型见 `shared/planDesignSpec.ts`。

| 字段 | 说明 |
|------|------|
| `artifactKind` | `uskill` \| `uplugin` |
| `ui.type` | `surface`（独立窗口）\| `injection_only` \| `none` |
| `trigger.keywords` / `trigger.slash` | 进 manifest.dispatch |
| `ui.designBrief` | Surface 布局/交互（生成 `surface.html`） |
| `acceptance.expectSurfaceOpenable` | deploy smoke 是否验窗口 |

uplugin + `ui.type === 'surface'` 时，Plan 生成 `plugin.meta.json.surface` 与 `surface.html`，并写入默认 `surface.invoke`（见 §4.5）。

---

## 三、uskill 协议（两个 JSON）

### 3.1 目录

```
<slug>/
├── manifest.json   ← 身份证 + 触发 + dispatch（进调度 catalog）
└── skill.json      ← 触发后注入什么 prompt
```

### 3.2 manifest.json 必填要点

```json
{
  "id": "u/my-skill@1.0.0",
  "category": "skill",
  "skillType": "rule",
  "triggers": ["keyword"],
  "keywords": ["触发词"],
  "permissions": ["engine_read"],
  "dispatch": {
    "mode": "dispatched",
    "subtype": "keyword_hint",
    "habits": ["用户说「触发词」"],
    "scenarios": ["需要此能力时"],
    "summary": "一句话说明干什么",
    "keywords": ["触发词"],
    "time": {
      "active_hours": "08:00-22:00",
      "cooldown_minutes": 10
    },
    "personality_hint": "neutral"
  }
}
```

- **id 格式**：`u/<slug>@<semver>`，正则见 `openforu/types.ts` → `isValidUextensionId`
- **缺 dispatch** → 不会进入 `getDispatchCatalog()` → 用户说关键词也 **不会被调度**
- **subtype**：OpenForU v1 固定 `keyword_hint`；`llm_function_call` 走 LLM tools，不由 dispatchExecutor 直接执行

### 3.3 skill.json 必填要点

```json
{
  "version": "1.0.0",
  "onKeyword": { "reply": "触发时的行为描述" },
  "promptTemplates": {
    "contextInjection": "【Skill名 已触发】…注入给 LLM 的完整指示…"
  }
}
```

**至少要有其一**：`promptTemplates.contextInjection` 或 `onKeyword.reply`（后者会自动拼成 injection，见 `uskillRuntime.ts`）。

### 3.4 v1 能力边界（避免误以为「真计时/真通知」）

| 声明的权限/行为 | v1 实际 |
|----------------|---------|
| `engine_read` | ✅ 可读引擎快照 |
| `engine_inject` / contextInjection | ✅ 注入 LLM 上下文 |
| `system_notification` | ✅ **JE-1b** · `api.notify` 网关（需 granted） |
| `network_outbound` | ✅ **JE-1b** · `api.fetch` 主进程 HTTPS（需 granted） |
| 番茄钟/定时器 | ⚠️ 靠 LLM 按 prompt **模拟**行为；**uskill autonomous tick → JE-1c** |

---

## 四、uplugin 协议（manifest + 代码）

### 4.1 目录

**轻量 / inject 轨**（仅上下文）：

```
<slug>/
├── manifest.json
└── plugin.meta.json    ← injectTemplate
```

**Worker 轨**（可选，LLM 或手写代码）：

```
<slug>/
├── manifest.json
├── plugin.meta.json
├── main.ts             ← 入口（export default factory）
└── src/index.ts        ← ExtensionLifecycleHooks
```

**Surface 轨**（带独立窗口，Plan 常见）：

```
<slug>/
├── manifest.json
├── plugin.meta.json    ← injectTemplate + surface { enabled, html, invoke }
├── surface.html        ← 内联 UI（或由 meta.surface.html 嵌入）
└── main.ts             ← 可选；Surface 不依赖 main.ts 亦可运行
```

### 4.2 manifest 额外字段

与官方 Plugin 相同，见 `plugins/types.ts`。用户插件 id 同样 `u/<name>@<version>`。

**同样需要 `dispatch`** 才能被聊天调度命中（`beforeUserMessage` 路径）。

### 4.3 沙箱 API

见 `uplugins/CATALOG.md` 与 `PluginSandboxApi`（`plugins/types.ts`）。

### 4.4 v1 能力边界（2026-06 更新）

- Plan **可**自动生成 uskill / uplugin 并 **deploy**（`loader.deployUskill` · `loader.deployUplugin`）
- **uplugin 三轨**：
  - **inject 轨**：仅 `plugin.meta.json` → `injectTemplate` 注入 LLM
  - **Worker 轨**：有 `main.ts` → Worker 沙箱 + `beforeUserMessage` hooks
  - **Surface 轨**：`plugin.meta.json.surface.enabled` → Electron `BrowserWindow` + HTML（**JE-3 ✅**）
- 主聊天 **`/关键词`**（`dispatch.slash`）保底触发；Surface 插件 slash 默认 **`invoke_surface` 并自动开窗口**
- 注入内容在 LLM **system 的【扩展上下文】**；Surface slash 默认 **跳过主聊天 LLM**，仅系统确认
- **LLM 写 `main.ts`**：`llmUpluginCode.ts`（staticScan + esbuild，失败回退 inject）
- **JE-1b ✅**：`sandboxApiBridge` · `api.notify` / `api.fetch` / `api.emitEvent`；runtime 校验 **`grantedPermissions`**
- elevated 权限 **审批 UI ✅（JE-1a）** · uskill autonomous tick → **JE-1c**

**Dispatch 决策（Use 轨）** — 见 `engine/dispatchRouter.ts` · `extensions/protocols.ts`：

| decision | 典型触发 | 行为 |
|----------|----------|------|
| `auto_invoke` | 关键词 / slash（**无 Surface**） | 仅 contextInjection |
| **`invoke_surface`** | slash / 关键词（**有 Surface**） | **自动开窗口** + 可选 inject |
| `open_surface` | 「打开 XX」 | 仅开窗口 |
| `plan` / `ask_plan` | 「帮我做个 XX」 | 开 Plan 工作区 |
| `evolve` | 「继续优化 XX」 | Refine |
| `ask_invoke` | 置信度中等 | 询问是否调用 |

**v1 如何使用自创 uplugin（实机定稿）**：

| 步骤 | 操作 |
|------|------|
| 部署 | Plan 生成 deploy，或手改 `{dataRoot}/openforu/uplugins/<slug>/` 后 **扩展中心启用** |
| 触发（无 Surface） | **`/slash`** · keywords · 语义调度 → `auto_invoke` |
| 触发（有 Surface） | **`/slash`** → **`invoke_surface` + 自动弹窗**；关键词 → 开窗 + inject |
| 手动开界面 | 扩展中心详情 → **打开窗口**（IPC `openforu:surface:open`） |
| 验收（inject） | **查看上下文** `【扩展上下文】` · 系统通知 |
| 验收（Surface） | 独立窗口可见 · deploy smoke 验 `BrowserWindow` |
| 管理 | 扩展中心启停 · 补批 elevated 权限 · Refine |

> 非 Surface 的 uplugin：**不会**自动开窗口，仅注入。uskill **永远没有** Surface 窗口。

| 权限 | 级别 | deploy 行为 |
|------|------|-------------|
| `readonly` · `engine_read` | auto | 静默授予 |
| `engine_inject` · `data_write` · `network_outbound` · `system_notification` | elevated | **弹窗审批** · 拒绝 → deploy 失败 + pending |
| `clipboard_read` · `foreground_detect` | forbidden | validate/deploy **拒绝** |

- 批准后写入 `plugin.meta.json` → **`grantedPermissions`** · 重启保留
- IPC：`openforu:permissions:request` · `approve` · `deny` · `approveAndActivate`
- 扩展中心可对 pending uplugin **补批**
- `api.notify` / `api.fetch` / `api.emitEvent` **JE-1b ✅** — 仅 **`grantedPermissions`** 内 elevated 权限可调用；无权限 runtime 清晰失败

### 4.5 OFU-Surface invoke 协议（JE-3 · 2026-06）

**类型定义**：`shared/surfaceInvoke.ts` · `shared/extensionSurface.ts`  
**运行时**：`openforu/surface/invokeSurface.ts` · `extensionSurfaceHost.ts`

Surface 配置写在 **`plugin.meta.json`**（与 `injectTemplate` 同级）：

```json
{
  "version": "1.0.0",
  "injectTemplate": "【番茄钟 已触发】…",
  "surface": {
    "enabled": true,
    "title": "番茄钟",
    "html": "<!DOCTYPE html>…",
    "invoke": {
      "onSlash": "open",
      "onKeyword": "open_and_inject",
      "onManual": "open",
      "focusIfOpen": true,
      "skipMainChatLlmOnSlash": true
    }
  }
}
```

| `invoke` 字段 | 可选值 | 默认 | 含义 |
|---------------|--------|------|------|
| `onSlash` | `inject_only` \| `open` \| `open_and_inject` | `open` | `/slash` 时宿主行为 |
| `onKeyword` | 同上 | `open_and_inject` | 关键词 / LLM 调度命中时 |
| `onManual` | 同上 | `open` | 扩展中心「打开窗口」 |
| `skipMainChatLlmOnSlash` | boolean | `true` | slash 后是否跳过主聊天 LLM |
| `focusIfOpen` | boolean | `true` | 已开则聚焦 |

**`invoke` 模式说明**：

| 模式 | 宿主动作 |
|------|----------|
| `inject_only` | 不开窗口，等同普通 `auto_invoke` |
| `open` | 开 `BrowserWindow`，不额外 inject |
| `open_and_inject` | 开窗口 + `executeDispatchedExtension` 注入上下文 |

**执行链路**：

```
/slash 或关键词
  → dispatchRouter: decision = invoke_surface, surfaceInvoke = { mode, skipMainChatLlm }
  → contextPipeline: executeSurfaceInvoke()
      → executeOpenExtensionSurface()   // 读 meta，创建窗口
      → （open_and_inject 时）beforeUserMessage / injectTemplate
  → chat.ts: skipMainChatLlm ? 系统确认 : LLM + SURFACE_OPENED_LLM_HINT
```

**Surface 窗口内 API**（`preload/surfacePreload.ts`，窄 API）：

- `ackem.extension.getContext()` → `{ extensionId, title }`
- `ackem.extension.close()` → 关闭当前 Surface 窗口

HTML 须满足 CSP：`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'`（Plan 生成的 `surface.html` 已遵守）。

Plan / `syncBundleFromSpec` 生成 Surface 时会调用 `withSurfaceInvokeDefaults()` 写入上述默认 `invoke`。

### 4.6 deploy 后 Verify smoke（AC-4 · 2026-06）

模块：`agent/verifyAgent.ts` · deploy 完成后 **5s** 内试触发。

| 场景 | 行为 |
|------|------|
| **`surface.enabled === true`** | `executeOpenExtensionSurface` → 断言 `BrowserWindow` 存在；`open_and_inject` 时可选验 injection |
| manifest / draft 有 **文本** keywords（无 Surface） | `{keyword} 测试` → `executeDispatchedExtension` → 断言 `contextInjection` 非空 |
| 探针词来源顺序 | manifest.dispatch.keywords → slash → dispatchDraft → plan 摘要（过滤快捷键串） |
| **仅快捷键** | **跳过** smoke · 扩展 **保持启用** |
| 文本 smoke 跑过但无 injection（非 Surface） | **失败** · 扩展 **disable** |

Plan 对话文案：`触发验证通过` · `触发验证已跳过（快捷键…）` · Surface：`已打开独立窗口` · 失败：`已部署但触发验证未通过·已禁用`。

> 仅 notify 副作用、无 injection 的非 Surface 探针，仍可能 verify 红字但手动启用后实机正常（见 `docs/tests/实机测试计划.md` §JE-1b）。

---

## 五、校验与调试

| 阶段 | 模块 | 说明 |
|------|------|------|
| Plan 部署前 | `validator.ts` | `validateGeneratedUskill` |
| dispatch 字段 | `validateDispatchConfig.ts` | mode/habits/keywords 等 |
| 启动扫描 | `loader.scanUskills` | 合法 dispatch 的 uskill **自动 activate** |
| 列表展示 | `openforu:extensions:list` | 先 rescan 再读 catalog |

**自检清单**

1. 文件在 `data/openforu/`，不在 `src/`
2. `manifest.id` 以 `u/` 开头
3. `manifest.dispatch.mode === "dispatched"` 且 keywords / slash 含触发词
4. 扩展中心 → 状态 **已启用**
5. 聊天触发 → Trace 应出现：
   - 无 Surface：`auto_invoke` + contextInjection
   - 有 Surface：`invoke_surface` + 独立窗口弹出
6. Surface 手改后检查 `plugin.meta.json`：`surface.enabled` + `html` 或 `entry`

---

## 六、参考例题

| 类型 | 仓库内路径 | 部署后对标 |
|------|-----------|-----------|
| uskill | `uskills/examples/hello-world/` | 复制结构到 `data/openforu/uskills/` |
| uplugin inject | `uplugins/examples/hello-world/` | 复制结构到 `data/openforu/uplugins/` |
| uplugin Surface | Plan 部署 `data/openforu/uplugins/<slug>/` | 含 `surface.html` + `plugin.meta.json.surface` |
| Plan 生成实样 | — | `data/openforu/uskills/pomodoro/` 等 |

---

## 七、相关源码索引

| 主题 | 文件 |
|------|------|
| 加载/注册 | `openforu/loader.ts` |
| uskill 执行体 | `openforu/uskillRuntime.ts` |
| uplugin inject 执行体 | `openforu/upluginRuntime.ts` |
| Plan 生成 | `openforu/agentPipeline.ts` |
| Design Spec | `shared/planDesignSpec.ts` · `openforu/designSpec/syncBundleFromSpec.ts` |
| 调度路由 | `engine/dispatchRouter.ts` |
| 调度管线 | `dispatch/contextPipeline.ts` |
| Surface invoke | `shared/surfaceInvoke.ts` · `openforu/surface/invokeSurface.ts` |
| Surface 窗口宿主 | `extensionSurfaceHost.ts` · `openforu/surface/executeOpenSurface.ts` |
| Surface preload | `preload/surfacePreload.ts` |
| 调度执行 | `dispatch/dispatchExecutor.ts` |
| deploy verify | `openforu/agent/verifyAgent.ts` |
| Catalog | `coordinator.getDispatchCatalog()` |
| 扩展中心 IPC | `openforu/ipc.ts`（`openforu:extensions:list` · `openforu:surface:open`） |
| JP 用户偏好 | `policy/userProfile.ts` |
