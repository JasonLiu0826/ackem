# IPC API

> **Language:** English · [中文](./08-ipc-api.zh.md)

> **Layer:** Process boundary bridge  
> **Codename:** Preload Bridge  
> **Core question:** How does the renderer process communicate with the main process?

---

## 1. Design Principles

Ackem uses **Electron IPC (contextBridge + ipcRenderer/invoke)** as the sole channel for inter-process communication:

| Principle | Description |
|------|------|
| **Narrow surface** | Preload exposes only a limited API; the renderer must not access Node.js directly |
| **Async calls** | All communication goes through `invoke/listen`; no synchronous blocking |
| **Type safety** | Preload type definitions are centralized in `src/preload/index.ts` |
| **Push/pull separation** | Requests use `invoke` (Promise); push events use `on` (callbacks) |
| **Extension isolation** | Extension windows use a separate preload (`surfacePreload.ts`) with a narrower API subset |

### Architecture Diagram

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

## 2. Channel Naming Convention

All IPC channels use colon-separated namespace prefixes:

```
{domain}:{action}
```

| Namespace | Purpose |
|----------|------|
| `settings:*` | Settings read/write |
| `chat:*` | Message send / streaming receive |
| `memory:*` | Memory search / import / export |
| `companion:*` | Companion state |
| `ext:*` | Extension management |
| `openforu:*` | OpenForU workspaces |
| `desktop-agent:*` | Desktop agent |
| `voice:*` | Voice interface |
| `weixin:*` | WeChat bridge |
| `ui:*` | UI state (window / tray) |
| `files:*` | File operations |
| `mc:*` | Deprecated; migrate to `ext:gamemode:invoke` |

---

## 3. Preload API Overview

**File:** `src/preload/index.ts`

Exposed as `window.ackem.*`, with ~100+ methods.

### 3.1 Settings (settings)

```typescript
window.ackem.settings = {
  get<T>(key: string): Promise<T>,
  set<T>(key: string, value: T): Promise<void>,
  getAll(): Promise<Record<string, any>>,
  reset(key: string): Promise<void>,
  onChanged(cb: (key: string, value: any) => void): () => void,
  // Deprecated below; merged into get/set
  getSettings: Promise<any>,
  updateSettings: Promise<void>,
}
```

### 3.2 Chat (chat)

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

### 3.3 Memory (memory)

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
  importFacts(json: string): Promise<number>,  // returns import count
  // Associations
  getAssociations(factId: string): Promise<Association[]>,
  // Knowledge graph
  queryKnowledgeGraph(spo: Partial<Triple>): Promise<Triple[]>,
}
```

### 3.4 Companion (companion)

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

### 3.5 Extension System (ext)

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
  // Install and uninstall
  installFromPackage(path: string): Promise<void>,
  uninstall(name: string): Promise<void>,
  // Extension store
  browseEcosystem(): Promise<EcosystemListing[]>,
  installFromEcosystem(id: string): Promise<void>,
  // Policy
  getPolicyConfig(): Promise<PolicyConfig>,
  setPolicyConfig(config: Partial<PolicyConfig>): Promise<void>,
  // Surface
  openSurface(name: string): Promise<void>,
  closeSurface(name: string): Promise<void>,
  // Game mode
  gamemode: {
    invoke(action: string, payload?: any): Promise<any>,
    onEvent(cb: (event: GamemodeEvent) => void): () => void,
  },
  // Events
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

### 3.7 Desktop Agent (desktop-agent)

```typescript
window.ackem['desktop-agent'] = {
  getStatus(): Promise<AgentStatus>,
  start(): Promise<void>,
  stop(): Promise<void>,
  onEvent(cb: (event: AgentEvent) => void): () => void,
}
```

### 3.8 Voice (voice)

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

### 3.9 WeChat Bridge (weixin)

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

### 3.10 UI and Window (ui)

```typescript
window.ackem.ui = {
  minimize(): Promise<void>,
  maximize(): Promise<void>,
  close(): Promise<void>,
  setAlwaysOnTop(on: boolean): Promise<void>,
  showTrayBalloon(title: string, msg: string): Promise<void>,
  openDevTools(): Promise<void>,
  // Diary
  diary: {
    getEntries(year?: number, month?: number): Promise<DiaryEntry[]>,
    getEntry(date: string): Promise<DiaryEntry | null>,
    saveEntry(date: string, content: string): Promise<void>,
  },
  // Weather
  weather: {
    getCurrent(): Promise<WeatherInfo | null>,
    getForecast(): Promise<WeatherInfo[]>,
  },
}
```

### 3.11 Files (files)

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

### 3.12 Other

```typescript
window.ackem = {
  // ...all modules above

  // System info
  getAppVersion(): Promise<string>,
  getPlatform(): Promise<string>,
  getSystemInfo(): Promise<SystemInfo>,
  openExternal(url: string): Promise<void>,

  // Logs
  getLogPaths(): Promise<string[]>,
  getLogContent(path: string, maxLines?: number): Promise<string>,

  // Diagnostics
  runDiagnostics(): Promise<DiagnosticReport>,
  exportDiagnostics(): Promise<string>,

  // Notification registration
  onNotification(cb: (notif: Notification) => void): () => void,
}
```

---

## 4. Push Events

The main process pushes events to the renderer via `webContents.send`. The renderer receives them through `on*` callbacks registered in preload.

### 4.1 Chat Events

| Event | Payload | Description |
|------|------|------|
| `chat:token` | `string` | LLM streaming token |
| `chat:done` | `SendResult` | LLM reply complete |
| `chat:error` | `string` | LLM call error |
| `chat:status` | `ChatStatus` | Chat status change |

### 4.2 Companion State Events

| Event | Payload | Description |
|------|------|------|
| `companion:state-update` | `CompanionState` | Full state push |
| `companion:emotion-update` | `EmotionState` | Emotion change |
| `companion:proactive-message` | `string` | Proactive message |

### 4.3 Extension Events

| Event | Payload | Description |
|------|------|------|
| `ext:event` | `ExtensionEvent` | Generic extension event |
| `ext:gamemode:event` | `GamemodeEvent` | Game mode event |
| `ext:surface:open` | `string` | Surface opened |
| `ext:surface:close` | `string` | Surface closed |

### 4.4 Desktop Agent Events

| Event | Payload | Description |
|------|------|------|
| `desktop-agent:event` | `AgentEvent` | Agent status / event |

### 4.5 Voice Events

| Event | Payload | Description |
|------|------|------|
| `voice:transcript` | `string` | Speech-to-text result |
| `voice:state` | `VoiceStatus` | Voice module state |
| `voice:speaking` | `boolean` | Start / stop speaking |

### 4.6 WeChat Events

| Event | Payload | Description |
|------|------|------|
| `weixin:message` | `WeixinMessage` | Incoming WeChat message |
| `weixin:status` | `WeixinStatus` | WeChat bridge status |

### 4.7 Other Events

| Event | Payload | Description |
|------|------|------|
| `notification` | `Notification` | System notification |
| `settings:changed` | `{ key, value }` | Settings change |
| `ui:tray-action` | `string` | Tray action |

---

## 5. Surface Extension Window Narrow API

**File:** `src/preload/surfacePreload.ts`

Surface extension windows load via a separate preload and expose a smaller API subset:

```typescript
window.ackem.extension = {
  id: string,
  getSnapshot(): Promise<EngineSnapshot>,
  onStateChange(cb: (snapshot: EngineSnapshot) => void): () => void,
  invoke(action: string, payload?: any): Promise<any>,
  onEvent(cb: (event: ExtensionEvent) => void): () => void,
  // Read-only: current locale
  locale: string,
}

// Surface-specific
window.ackem.surface = {
  close(): Promise<void>,
  setSize(width: number, height: number): Promise<void>,
  setAlwaysOnTop(on: boolean): Promise<void>,
  onSurfaceEvent(cb: (event: SurfaceEvent) => void): () => void,
}
```

Extension windows **cannot** access:
- `window.ackem.settings` — settings read/write
- `window.ackem.chat` — message send
- `window.ackem.memory` — memory search
- `window.ackem.files` — file system
- `window.ackem.ui` — window control

Extensions can only communicate with the main process via `invoke` + `onEvent`, ensuring the engine core is not compromised.

---

## 6. Registration Mechanism

**File:** `src/main/ipc.ts` — `registerAllIpcHandlers()`

```typescript
// ipc.ts — unified registration entry point
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
  // ...each IPC handler file owns its own ipcMain.handle/on
}
```

Each handler file (e.g. `src/main/ipc/chat.ts`):

```typescript
export function registerChatIpc(): void {
  ipcMain.handle('chat:send', async (_, text: string) => { ... })
  ipcMain.handle('chat:abort', async () => { ... })
  // ...
}
```

---

## 7. Event Channel Registration

```typescript
// preload/index.ts
// Each on* method maps to an ipcRenderer.on listener
onToken: (cb) => {
  const handler = (_: any, token: string) => cb(token)
  ipcRenderer.on('chat:token', handler)
  return () => ipcRenderer.removeListener('chat:token', handler)
}
```

The returned unsubscribe function ensures listeners are cleaned up on component unmount, preventing memory leaks.

---

## 8. Security Constraints

| Constraint | Implementation |
|------|------|
| Renderer must not read `data/` directly | IPC validates paths and blocks directory traversal |
| Extension windows must not access engine internals | Surface preload exposes only snapshot + invoke |
| All file operations go through path whitelist | `ipc/files.ts` verifies paths are under `dataRoot` |
| Settings validation | `settings.ts` validates each key against schema |
| Memory delete confirmation | `memory:delete` requires a secondary confirmation parameter |

---

## 9. Deprecated API

| Old channel | Replacement | Removal version |
|--------|------|----------|
| `mc:*` | `ext:gamemode:invoke` | v1.1.0 |
| `settings:getSettings` | `settings:getAll` | v1.0.0 (kept for compatibility) |
| `settings:updateSettings` | `settings:set` | v1.0.0 (kept for compatibility) |

---

## 10. Related Documentation

| Document | Content |
|------|------|
| [00-overall-system.md](./00-overall-system.md) | Process architecture and IPC overview |
| [05-extension-system.md](./05-extension-system.md) | Extension system and Surface windows |

*IPC API · Ackem v1.0.0 · 2026-06*
