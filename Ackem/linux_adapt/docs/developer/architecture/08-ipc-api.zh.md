# IPC 接口 · IPC API

> **语言：** 中文 · [English](./08-ipc-api.md)

> **层级**：进程边界桥  
> **代号**：Preload Bridge  
> **核心问题**：渲染进程如何与主进程通信？

---

## 1. 设计原则

Ackem 采用 **Electron IPC（contextBridge + ipcRenderer/invoke）** 作为进程通信的唯一通道：

| 原则 | 说明 |
|------|------|
| **窄表面** | preload 仅暴露有限 API，渲染进程不得直接访问 Node.js |
| **异步调用** | 所有通信走 `invoke/listen`，无同步阻塞 |
| **类型安全** | preload 类型定义集中在 `src/preload/index.ts` |
| **推拉分离** | 请求用 `invoke`（Promise），推送事件用 `on`（回调） |
| **扩展隔离** | 扩展窗口使用独立 preload（`surfacePreload.ts`），API 子集更窄 |

### 架构图

```
Renderer Process
  ┌──────────────────────────────────────┐
  │ window.ackem.*                       │
  │   .settings.get(key)                 │
  │   .chat.send(text)                   │
  │   .memory.search(query)              │
  │   .extensions.list()                 │
  │   .onCompanionState(cb)              │
  └──────────┬───────────────────────────┘
             │ contextBridge
             ▼
  ┌──────────────────────────────────────┐
  │ Preload (preload/index.ts)           │
  │   ipcRenderer.invoke → main process  │
  │   ipcRenderer.on    ← push events    │
  └──────────┬───────────────────────────┘
             │ IPC channel
             ▼
Main Process
  ┌──────────────────────────────────────┐
  │ ipc.ts → registerAllIpcHandlers()    │
  │   ├── registerSettingsIpc()          │
  │   ├── registerChatIpc()              │
  │   ├── registerMemoryIpc()            │
  │   ├── registerExtensionsIpc()        │
  │   └── ...                            │
  └──────────────────────────────────────┘
```

---

## 2. 频道命名约定

所有 IPC 通道使用冒号分隔的命名空间前缀：

```
{domain}:{action}
```

| 命名空间 | 用途 |
|----------|------|
| `settings:*` | 设置读写 |
| `chat:*` | 消息发送/流式接收 |
| `memory:*` | 记忆搜索/导入/导出 |
| `companion:*` | 伴侣状态 |
| `ext:*` | 扩展管理 |
| `openforu:*` | OpenForU 工作区 |
| `desktop-agent:*` | 桌面代理 |
| `voice:*` | 语音接口 |
| `weixin:*` | 微信桥接 |
| `ui:*` | UI 状态（窗口/托盘） |
| `files:*` | 文件操作 |
| `mc:*` | 已废弃，迁移到 `ext:gamemode:invoke` |

---

## 3. Preload API 总览

**文件**：`src/preload/index.ts`

暴露为 `window.ackem.*`，约 100+ 方法。

### 3.1 设置 (settings)

```typescript
window.ackem.settings = {
  get<T>(key: string): Promise<T>,
  set<T>(key: string, value: T): Promise<void>,
  getAll(): Promise<Record<string, any>>,
  reset(key: string): Promise<void>,
  onChanged(cb: (key: string, value: any) => void): () => void,
  // 以下废弃，合并到 get/set
  getSettings: Promise<any>,
  updateSettings: Promise<void>,
}
```

### 3.2 聊天 (chat)

```typescript
window.ackem.chat = {
  send(text: string): Promise<SendResult>,
  sendWithImages(text: string, images: string[]): Promise<SendResult>,
  abort(): Promise<void>,
  getHistory(sessionId?: string): Promise<ChatRow[]>,
  clearHistory(sessionId?: string): Promise<void>,
  getSessionList(): Promise<SessionInfo[]>,
  switchSession(sessionId: string): Promise<void>,
  deleteSession(sessionId: string): Promise<void>,
  renameSession(sessionId: string, name: string): Promise<void>,
  onToken(cb: (token: string) => void): () => void,
  onDone(cb: (result: SendResult) => void): () => void,
  onError(cb: (error: string) => void): () => void,
}
```

### 3.3 记忆 (memory)

```typescript
window.ackem.memory = {
  search(query: string, opts?: SearchOptions): Promise<SearchResult[]>,
  searchFacts(query: string, limit?: number): Promise<MemoryFact[]>,
  searchEpisodes(query: string, limit?: number): Promise<Episode[]>,
  getFact(id: string): Promise<MemoryFact | null>,
  getFactsByDomain(domain: string): Promise<MemoryFact[]>,
  getFactStats(): Promise<FactStats>,
  reembed(): Promise<void>,
  rebuildFtsIndex(): Promise<void>,
  exportFacts(): Promise<string>,
  importFacts(json: string): Promise<number>,  // 返回导入数量
  // 关联
  getAssociations(factId: string): Promise<Association[]>,
  // 知识图谱
  queryKnowledgeGraph(spo: Partial<Triple>): Promise<Triple[]>,
}
```

### 3.4 伴侣 (companion)

```typescript
window.ackem.companion = {
  getState(): Promise<CompanionState>,
  getStateMarkdown(): Promise<string>,
  getSelfMarkdown(): Promise<string>,
  getTemporalContext(): Promise<TemporalContext>,
  getEmotionState(): Promise<EmotionState>,
  getRelationshipState(): Promise<RelationshipState>,
  getPersonality(): Promise<PersonalityProfile>,
  getDesireStack(): Promise<DesireItem[]>,
  getProactivePlans(): Promise<ProactivePlan[]>,
  getRecentRhythms(): Promise<RhythmLog[]>,
  getRhythmPreference(): Promise<string>,
  setRhythmPreference(pref: string): Promise<void>,
  getMemoryDebugInfo(): Promise<MemoryDebugInfo>,
  getTrace(turnIndex: number): Promise<TraceEntry | null>,
  getRecentTraces(): Promise<TraceEntry[]>,
  onCompanionState(cb: (state: CompanionState) => void): () => void,
  onEmotionUpdate(cb: (emotion: EmotionState) => void): () => void,
}
```

### 3.5 扩展系统 (ext)

```typescript
window.ackem.ext = {
  // Skill
  listSkills(): Promise<SkillInfo[]>,
  getSkill(name: string): Promise<SkillInfo | null>,
  toggleSkill(name: string, enabled: boolean): Promise<void>,
  executeSkill(name: string, args: string): Promise<string>,
  // Plugin
  listPlugins(): Promise<PluginInfo[]>,
  getPlugin(name: string): Promise<PluginInfo | null>,
  togglePlugin(name: string, enabled: boolean): Promise<void>,
  // 安装与卸载
  installFromPackage(path: string): Promise<void>,
  uninstall(name: string): Promise<void>,
  // 扩展商店
  browseEcosystem(): Promise<EcosystemListing[]>,
  installFromEcosystem(id: string): Promise<void>,
  // 策略
  getPolicyConfig(): Promise<PolicyConfig>,
  setPolicyConfig(config: Partial<PolicyConfig>): Promise<void>,
  // Surface
  openSurface(name: string): Promise<void>,
  closeSurface(name: string): Promise<void>,
  // 游戏模式
  gamemode: {
    invoke(action: string, payload?: any): Promise<any>,
    onEvent(cb: (event: GamemodeEvent) => void): () => void,
  },
  // 事件
  onExtensionEvent(cb: (ev: ExtensionEvent) => void): () => void,
}
```

### 3.6 OpenForU

```typescript
window.ackem.openforu = {
  listWorkspaces(): Promise<WorkspaceInfo[]>,
  getWorkspace(id: string): Promise<WorkspaceDetail | null>,
  createWorkspace(config: WorkspaceConfig): Promise<string>,
  deleteWorkspace(id: string): Promise<void>,
  listSessions(workspaceId: string): Promise<SessionInfo[]>,
  getSession(id: string): Promise<SessionDetail | null>,
  appendMessage(sessionId: string, text: string): Promise<void>,
  listRuns(workspaceId: string): Promise<RunInfo[]>,
  getRunLog(runId: string): Promise<string>,
}
```

### 3.7 桌面代理 (desktop-agent)

```typescript
window.ackem['desktop-agent'] = {
  getStatus(): Promise<AgentStatus>,
  start(): Promise<void>,
  stop(): Promise<void>,
  onEvent(cb: (event: AgentEvent) => void): () => void,
}
```

### 3.8 语音 (voice)

```typescript
window.ackem.voice = {
  isAvailable(): Promise<boolean>,
  getStatus(): Promise<VoiceStatus>,
  startListening(): Promise<void>,
  stopListening(): Promise<void>,
  speak(text: string): Promise<void>,
  stopSpeaking(): Promise<void>,
  setVoice(voiceId: string): Promise<void>,
  getVoiceList(): Promise<VoiceOption[]>,
  setVolume(volume: number): Promise<void>,
  onTranscript(cb: (text: string) => void): () => void,
  onVoiceState(cb: (state: VoiceStatus) => void): () => void,
}
```

### 3.9 微信桥接 (weixin)

```typescript
window.ackem.weixin = {
  getStatus(): Promise<WeixinStatus>,
  start(): Promise<void>,
  stop(): Promise<void>,
  sendMessage(to: string, text: string): Promise<void>,
  getContactList(): Promise<WeixinContact[]>,
  getChatHistory(contact: string, limit?: number): Promise<WeixinMessage[]>,
  onMessage(cb: (msg: WeixinMessage) => void): () => void,
  onStatusChange(cb: (status: WeixinStatus) => void): () => void,
}
```

### 3.10 UI 与窗口 (ui)

```typescript
window.ackem.ui = {
  minimize(): Promise<void>,
  maximize(): Promise<void>,
  close(): Promise<void>,
  setAlwaysOnTop(on: boolean): Promise<void>,
  showTrayBalloon(title: string, msg: string): Promise<void>,
  openDevTools(): Promise<void>,
  // 日记
  diary: {
    getEntries(year?: number, month?: number): Promise<DiaryEntry[]>,
    getEntry(date: string): Promise<DiaryEntry | null>,
    saveEntry(date: string, content: string): Promise<void>,
  },
  // 天气
  weather: {
    getCurrent(): Promise<WeatherInfo | null>,
    getForecast(): Promise<WeatherInfo[]>,
  },
}
```

### 3.11 文件 (files)

```typescript
window.ackem.files = {
  selectFile(opts?: FileSelectOptions): Promise<string | null>,
  selectDirectory(): Promise<string | null>,
  getFileContent(path: string): Promise<string>,
  writeFile(path: string, content: string): Promise<void>,
  getDataPath(): Promise<string>,
  revealInExplorer(path: string): Promise<void>,
  importDocument(path: string): Promise<ImportResult>,
}
```

### 3.12 其他

```typescript
window.ackem = {
  // ...以上各模块

  // 系统信息
  getAppVersion(): Promise<string>,
  getPlatform(): Promise<string>,
  getSystemInfo(): Promise<SystemInfo>,
  openExternal(url: string): Promise<void>,

  // 日志
  getLogPaths(): Promise<string[]>,
  getLogContent(path: string, maxLines?: number): Promise<string>,

  // 诊断
  runDiagnostics(): Promise<DiagnosticReport>,
  exportDiagnostics(): Promise<string>,

  // 通知注册
  onNotification(cb: (notif: Notification) => void): () => void,
}
```

---

## 4. 推送事件

主进程通过 `webContents.send` 推送事件给渲染进程。渲染进程通过 preload 注册的 `on*` 回调接收。

### 4.1 聊天事件

| 事件 | 载荷 | 说明 |
|------|------|------|
| `chat:token` | `string` | LLM 流式 token |
| `chat:done` | `SendResult` | LLM 回复完成 |
| `chat:error` | `string` | LLM 调用错误 |
| `chat:status` | `ChatStatus` | 聊天状态变更 |

### 4.2 伴侣状态事件

| 事件 | 载荷 | 说明 |
|------|------|------|
| `companion:state-update` | `CompanionState` | 完整状态推送 |
| `companion:emotion-update` | `EmotionState` | 情绪变更 |
| `companion:proactive-message` | `string` | 主动消息 |

### 4.3 扩展事件

| 事件 | 载荷 | 说明 |
|------|------|------|
| `ext:event` | `ExtensionEvent` | 通用扩展事件 |
| `ext:gamemode:event` | `GamemodeEvent` | 游戏模式事件 |
| `ext:surface:open` | `string` | Surface 打开 |
| `ext:surface:close` | `string` | Surface 关闭 |

### 4.4 桌面代理事件

| 事件 | 载荷 | 说明 |
|------|------|------|
| `desktop-agent:event` | `AgentEvent` | 代理状态/事件 |

### 4.5 语音事件

| 事件 | 载荷 | 说明 |
|------|------|------|
| `voice:transcript` | `string` | 语音转文字结果 |
| `voice:state` | `VoiceStatus` | 语音模块状态 |
| `voice:speaking` | `boolean` | 开始/停止朗读 |

### 4.6 微信事件

| 事件 | 载荷 | 说明 |
|------|------|------|
| `weixin:message` | `WeixinMessage` | 收到微信消息 |
| `weixin:status` | `WeixinStatus` | 微信桥接状态 |

### 4.7 其他事件

| 事件 | 载荷 | 说明 |
|------|------|------|
| `notification` | `Notification` | 系统通知 |
| `settings:changed` | `{ key, value }` | 设置变更 |
| `ui:tray-action` | `string` | 托盘操作 |

---

## 5. Surface 扩展窗口 Narrow API

**文件**：`src/preload/surfacePreload.ts`

Surface 扩展窗口通过独立 preload 加载，暴露的 API 子集更小：

```typescript
window.ackem.extension = {
  id: string,
  getSnapshot(): Promise<EngineSnapshot>,
  onStateChange(cb: (snapshot: EngineSnapshot) => void): () => void,
  invoke(action: string, payload?: any): Promise<any>,
  onEvent(cb: (event: ExtensionEvent) => void): () => void,
  // 只读：获取当前语言
  locale: string,
}

// Surface 特有
window.ackem.surface = {
  close(): Promise<void>,
  setSize(width: number, height: number): Promise<void>,
  setAlwaysOnTop(on: boolean): Promise<void>,
  onSurfaceEvent(cb: (event: SurfaceEvent) => void): () => void,
}
```

扩展窗口 **无法** 访问：
- `window.ackem.settings` — 设置读写
- `window.ackem.chat` — 消息发送
- `window.ackem.memory` — 记忆搜索
- `window.ackem.files` — 文件系统
- `window.ackem.ui` — 窗口控制

扩展只能通过 `invoke` + `onEvent` 与主进程通信，确保引擎内核不被破坏。

---

## 6. 注册机制

**文件**：`src/main/ipc.ts` — `registerAllIpcHandlers()`

```typescript
// ipc.ts — 统一注册入口
export function registerAllIpcHandlers(): void {
  registerSettingsIpc()
  registerChatIpc()
  registerMemoryIpc()
  registerCompanionIpc()
  registerExtensionsIpc()
  registerOpenForuIpc()
  registerDesktopAgentIpc()
  registerVoiceIpc()
  registerWeixinIpc()
  registerUiIpc()
  registerFileIpc()
  registerDiaryIpc()
  registerWeatherIpc()
  // ...每个 IPC handler 文件负责自己的 ipcMain.handle/on
}
```

每个 handler 文件（如 `src/main/ipc/chat.ts`）：

```typescript
export function registerChatIpc(): void {
  ipcMain.handle('chat:send', async (_, text: string) => { ... })
  ipcMain.handle('chat:abort', async () => { ... })
  // ...
}
```

---

## 7. 事件通道注册

```typescript
// preload/index.ts
// 每个 on* 方法对应一个 ipcRenderer.on 监听
onToken: (cb) => {
  const handler = (_: any, token: string) => cb(token)
  ipcRenderer.on('chat:token', handler)
  return () => ipcRenderer.removeListener('chat:token', handler)
}
```

返回的取消函数确保组件卸载时清理监听器，防止内存泄漏。

---

## 8. 安全约束

| 约束 | 实现 |
|------|------|
| 渲染进程不得直接读 `data/` | IPC 做路径校验，阻止目录遍历 |
| 扩展窗口不得访问引擎内部 | Surface preload 只暴露 snapshot + invoke |
| 所有文件操作经过路径白名单 | `ipc/files.ts` 验证路径在 `dataRoot` 下 |
| 设置校验 | `settings.ts` 对每个 key 做 schema 校验 |
| 记忆删除确认 | `memory:delete` 要求二次确认参数 |

---

## 9. 废弃 API

| 旧通道 | 替换 | 移除版本 |
|--------|------|----------|
| `mc:*` | `ext:gamemode:invoke` | v1.1.0 |
| `settings:getSettings` | `settings:getAll` | v1.0.0（兼容存留） |
| `settings:updateSettings` | `settings:set` | v1.0.0（兼容存留） |

---

## 10. 相关文档

| 文档 | 内容 |
|------|------|
| [00-overall-system.md](./00-overall-system.md) | 进程架构与 IPC 概览位置 |
| [05-extension-system.md](./05-extension-system.md) | 扩展系统与 Surface 窗口 |

*IPC 接口 · Ackem v1.0.0 · 2026-06*
