import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppSettings, PresetGender } from '../shared/types'
import type { UserTaskFrame } from '../shared/taskFrame'
import type { WavePlan } from '../shared/wavePlan'
import type { AgentEvent } from '../shared/openforuAgentTypes'
import type { PermissionRequestPayload } from '../shared/openforuPermissions'
import type { DesktopAgentConfirmRequest } from '../shared/desktopAgent'

export type BuildContextResult = {
  messages: unknown[]
  skipLlm?: boolean
  redlineReply?: string
  turnId?: string
  tracePreview?: unknown
  enterPlanMode?: boolean
  planTopic?: string
  channelPending?: {
    planId: string
    kind: 'create' | 'update' | 'work_job' | 'use_missing' | 'plugin_ask' | 'plugin_use'
    askMessage: string
    cwd?: string
    candidates?: Array<{ id: string; name: string }>
  }
  knowledgeTopic?: string
  suggestedSearchQuery?: string
  forcedWebSearchQuery?: string
  /** L0.5 计划书主题（Markdown 纸面卡） */
  planDocumentTopic?: string
  /** L0 用户任务框（交付形态 / 合并搜索策略） */
  userTaskFrame?: UserTaskFrame
  /** P0-1：Create/invoke 未路由，禁止扩展类假承诺 */
  dispatchBypassed?: boolean
  /** 本轮已触发的扩展（auto_invoke 或用户确认启用） */
  dispatchTriggered?: {
    extensionId: string
    extensionName: string
    kind: 'skill' | 'plugin' | 'gamemode'
  }
  useWaveChat?: boolean
  wavePlan?: WavePlan
  waveContext?: Record<string, unknown>
  sessionId?: string
  desktopAgentCapability?: import('../shared/desktopAgentCapabilities').DesktopAgentCapabilityMatch
  /** 阶段 1「判决可见」: 本轮路由判决的人话解释（账本读回，缺判决为 null）。 */
  routeExplain?: {
    found: boolean
    finalChannel?: 'chat' | 'plugin' | 'work'
    channelText?: string
    summary?: string
    layers?: Array<{ layer: string; ruleId: string; ms: number; text: string }>
  } | null
}

const GAME_MINECRAFT = 'minecraft'

const openforuNotifyListeners = new Set<(payload: { text: string }) => void>()
let openforuNotifyBridgeReady = false

const openforuAgentEventListeners = new Set<(payload: AgentEvent) => void>()
let openforuAgentEventBridgeReady = false

const openforuPermissionListeners = new Set<(payload: PermissionRequestPayload) => void>()
let openforuPermissionBridgeReady = false

const desktopAgentConfirmListeners = new Set<(payload: DesktopAgentConfirmRequest) => void>()
let desktopAgentConfirmBridgeReady = false

function ensureDesktopAgentConfirmBridge(): void {
  if (desktopAgentConfirmBridgeReady) return
  desktopAgentConfirmBridgeReady = true
  ipcRenderer.on('desktop-agent:confirm:request', (_e, payload: DesktopAgentConfirmRequest) => {
    for (const fn of desktopAgentConfirmListeners) fn(payload)
  })
}

function ensureOpenforuPermissionBridge(): void {
  if (openforuPermissionBridgeReady) return
  openforuPermissionBridgeReady = true
  ipcRenderer.on('openforu:permissions:request', (_e, payload: PermissionRequestPayload) => {
    for (const fn of openforuPermissionListeners) fn(payload)
  })
}

function ensureOpenforuNotifyBridge(): void {
  if (openforuNotifyBridgeReady) return
  openforuNotifyBridgeReady = true
  ipcRenderer.on('openforu:notify', (_e, payload: { text: string }) => {
    for (const fn of openforuNotifyListeners) fn(payload)
  })
}

async function gamemodeInvoke<T = unknown>(
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  const result = await ipcRenderer.invoke('ext:gamemode:invoke', {
    gameId: GAME_MINECRAFT,
    method,
    params
  }) as { ok: boolean; data?: T; error?: string }
  if (!result.ok) {
    throw new Error(result.error ?? `gamemode invoke failed: ${method}`)
  }
  return result.data as T
}

const gamemodeMinecraft = {
  react: (event: { type: string; raw: string; timestamp: string; payload?: Record<string, unknown> }) =>
    gamemodeInvoke('react', { event }),
  parseLog: (line: string) => gamemodeInvoke<{ type: string; raw: string; timestamp: string; payload?: Record<string, unknown> } | null>('parseLog', { line }),
  getWsStatus: () => gamemodeInvoke<{ running: boolean; wsPort: number; wsClients: number; logPath?: string }>('getWsStatus'),
  syncEngineState: () => gamemodeInvoke<{ ok: boolean }>('syncEngineState'),
  botStart: (cfg: { host: string; port?: number; username: string; password?: string }) =>
    gamemodeInvoke<{ ok: boolean }>('botStart', cfg as unknown as Record<string, unknown>),
  botStop: () => gamemodeInvoke<{ ok: boolean }>('botStop'),
  botStatus: () => gamemodeInvoke<{ connected: boolean; username?: string; health?: number; hunger?: number; position?: { x: number; y: number; z: number }; dimension?: string; wsConnected?: boolean }>('botStatus'),
  botDebug: () => gamemodeInvoke<Record<string, unknown> | null>('botDebug'),
  logStart: (logPath: string) => gamemodeInvoke<{ ok: boolean; path: string }>('logStart', { logPath }),
  logStop: () => gamemodeInvoke<{ ok: boolean }>('logStop'),
  logStatus: () => gamemodeInvoke<{ active: boolean }>('logStatus')
}

export type QqLoginStatusPayload = {
  isLogin: boolean
  isOffline: boolean
  phase: string
  qrLoginAccepted: boolean
  coreReady: boolean
  qrcode?: string
  loginError?: string
}

export type QqLoginQrPayload =
  | { ok: true; alreadyLoggedIn: true; status: QqLoginStatusPayload }
  | { ok: true; alreadyLoggedIn: false; restarting?: boolean; qrDataUrl: string; phase: string }
  | { ok: false; need2FA?: boolean; error: string }

export type QqLoginPollPayload =
  | { ok: true; status: QqLoginStatusPayload }
  | { ok: false; need2FA?: boolean; error: string }

contextBridge.exposeInMainWorld('ackem', {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('update:getAppVersion'),
  checkUpdate: (): Promise<import('../shared/updateTypes').UpdateCheckResult> => ipcRenderer.invoke('update:check'),
  startUpdate: (request: import('../shared/updateTypes').UpdateStartRequest): Promise<{ ok: true; jobPath: string } | { ok: false; reason: string }> => ipcRenderer.invoke('update:start', request),
  getUpdateChannelPreference: (): Promise<import('../shared/updateTypes').UpdateChannel> => ipcRenderer.invoke('update:getChannelPreference'),
  setUpdateChannelPreference: (channel: import('../shared/updateTypes').UpdateChannel): Promise<import('../shared/updateTypes').UpdateChannel> => ipcRenderer.invoke('update:setChannelPreference', channel),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  getCanon: (): Promise<{ name: string; birthDate: string; creator: { name: string; github: string; role: string; bio: string } }> =>
    ipcRenderer.invoke('canon:get'),
  getCreatorMemory: (): Promise<{
    version: string
    documentVersion: string
    entryCount: number
    decayPolicy: string
    seededAt: string | null
    entries: Array<{
      id: string
      category: string
      title: string
      content: string
      narrativeAt: string
    }>
  }> => ipcRenderer.invoke('canon:creator-memory:get'),
  setSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', patch),
  getDataRoot: (): Promise<{ path: string; relativePath: string; mode: string; databasePath: string }> =>
    ipcRenderer.invoke('data:getRoot'),
  ensureLayout: (): Promise<{ path: string }> => ipcRenderer.invoke('data:ensureLayout'),
  openDataFolder: (): Promise<void> => ipcRenderer.invoke('shell:openData'),
  selectChatAttachments: (kind?: 'image'|'file'|'video'): Promise<import('../shared/chatAttachments').ChatAttachment[]> => ipcRenderer.invoke('dialog:selectChatAttachments',kind),
  captureChatAttachments: (entries:Array<{path?:string;name?:string;bytes?:ArrayBuffer}>): Promise<import('../shared/chatAttachments').ChatAttachment[]> => ipcRenderer.invoke('chat:captureAttachments',entries),
  selectChatImages: (): Promise<import('../shared/chatImages').ChatImage[]> => ipcRenderer.invoke('dialog:selectChatImages'),
  selectFiles: (): Promise<{ paths: string[] }> => ipcRenderer.invoke('dialog:selectFiles'),
  selectFolder: (): Promise<{ path: string }> => ipcRenderer.invoke('dialog:selectFolder'),
  defaultCwd: (): Promise<string> => ipcRenderer.invoke('app:default-cwd'),
  revealPath: (path: string): Promise<{ ok: boolean; path?: string }> =>
    ipcRenderer.invoke('shell:revealPath', path) as Promise<{ ok: boolean; path?: string }>,
  previewChatFile: (path: string) => ipcRenderer.invoke('chat:file-preview', path),
  getBootSteps: (): Promise<{ steps: Array<{ label: string; done: boolean }>; allReady: boolean }> =>
    ipcRenderer.invoke('boot:get-steps'),
  onBootStep: (fn: (payload: { steps: Array<{ label: string; done: boolean }>; allReady: boolean }) => void) => {
    ipcRenderer.removeAllListeners('boot:step')
    ipcRenderer.on('boot:step', (_e, payload) => fn(payload))
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  importFiles: (paths: string[]): Promise<{ copied: string[]; errors: string[] }> =>
    ipcRenderer.invoke('import:files', paths),
  promoteImport: (rel: string) => ipcRenderer.invoke('import:promote', rel),
  importParseDocuments: (args: {
    relPaths: string[]
    consentAck: boolean
    consentVersion: number
    ownerAgentId?: string
  }) => ipcRenderer.invoke('import:parseDocuments', args),
  importGetJob: (jobId: string) => ipcRenderer.invoke('import:getJob', jobId),
  importCommitJob: (args: {
    jobId: string
    disabledDraftIds?: string[]
    ownerAgentId?: string
  }) => ipcRenderer.invoke('import:commitJob', args),
  rebuildIndex: (): Promise<{ chunks: number; builtAt: string }> =>
    ipcRenderer.invoke('index:rebuild'),
  search: (q: string, limit?: number) => ipcRenderer.invoke('index:search', q, limit),
  buildContext: (args: {
    userText: string
    filePaths?: string[]
    imagePaths?: string[]
    explicitRel?: string
    recentMessages: { role: 'user' | 'assistant'; content: string }[]
    sessionId?: string
    turnIndex?: number
    systemHint?: string
    targetAgentId?: string
    interactionSurface?: string
    desktopAgentChatMode?: boolean
    turnConfirm?: { planId: string; accepted: boolean; cwd?: string; extensionId?: string }
  }): Promise<BuildContextResult> => ipcRenderer.invoke('context:build', args),
  workbenchFollow: (args: { chatSessionId?: string; text: string }) =>
    ipcRenderer.invoke('workbench:follow', args) as Promise<{ ok: boolean; reason?: string }>,
  webSearch: {
    status: () => ipcRenderer.invoke('web-search:status'),
    pending: () => ipcRenderer.invoke('web-search:pending'),
    configure: (input: import('../shared/webSearch').WebSearchConfiguration) => ipcRenderer.invoke('web-search:configure', input),
    cancel: (requestId: string) => ipcRenderer.invoke('web-search:cancel', requestId),
    onSetup: (fn: (input: import('../shared/webSearch').WebSearchSetupRequest) => void) => {
      const listener = (_event: unknown, input: import('../shared/webSearch').WebSearchSetupRequest) => fn(input)
      ipcRenderer.on('chat:web-search-setup', listener)
      return () => ipcRenderer.removeListener('chat:web-search-setup', listener)
    }
  },
  codePart: {
    ensure: () =>
      ipcRenderer.invoke('codepart:ensure') as Promise<{ ok: boolean; reason?: string }>
  },
    tasks: {
      submit: (request: import('../shared/tasks').TaskSubmitRequest) => ipcRenderer.invoke('tasks:submit', request),
      cancel: (requestId:string) => ipcRenderer.invoke('tasks:cancel',requestId),
      stop: (taskId: string) => ipcRenderer.invoke('tasks:stop', taskId),
      runQueuedNow: (taskId:string) => ipcRenderer.invoke('tasks:run-queued-now',taskId),
      remove: (taskId: string) => ipcRenderer.invoke('tasks:remove', taskId),
      clearManaged: (projectionIds?:string[]) => ipcRenderer.invoke('tasks:clear-managed',projectionIds),
      list: () => ipcRenderer.invoke('tasks:list'),
      snapshot: (taskId: string) => ipcRenderer.invoke('tasks:snapshot', taskId),
      grantGoal: (input:import('../shared/longTerm').GoalGrantInput)=>ipcRenderer.invoke('tasks:goal-grant',input),
      revokeGoal: (id:string)=>ipcRenderer.invoke('tasks:goal-revoke',id),
      changeGoalState:(input:{id:string;state:'paused'|'active'|'cancelled'|'abandoned'})=>ipcRenderer.invoke('tasks:goal-state',input),
      goals: ()=>ipcRenderer.invoke('tasks:goals'),
      decisions: (id:string)=>ipcRenderer.invoke('tasks:decisions',id),
      correctDecision: (input:{id:string;basis:string})=>ipcRenderer.invoke('tasks:decision-correct',input),
      grantRule: (input:import('../shared/longTerm').RuleGrantInput)=>ipcRenderer.invoke('tasks:rule-grant',input),
      revokeRule: (id:string)=>ipcRenderer.invoke('tasks:rule-revoke',id),
      rules: ()=>ipcRenderer.invoke('tasks:rules'),
      worldState: (ids:string[])=>ipcRenderer.invoke('tasks:world-state',ids),
      onEvent: (callback: (event: import('../shared/tasks').TaskEvent) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, event: import('../shared/tasks').TaskEvent): void => callback(event)
        ipcRenderer.on('tasks:event', listener)
        return () => ipcRenderer.removeListener('tasks:event', listener)
      }
    },
    workbench: {
      environment: () => ipcRenderer.invoke('system:manifest'),
      openDefaultDirectory: () => ipcRenderer.invoke('workbench:open-default-directory'),
      modelInfo: (sessionId?: string) => ipcRenderer.invoke('workbench:model-info', sessionId),
      supervisionList: () => ipcRenderer.invoke('workbench:supervision-list'),
      supervisionAnswer: (input:{taskId:string;requestId:string;answers:Record<string,string>})=>ipcRenderer.invoke('workbench:supervision-answer',input),
      supervisionApproval: (input: {taskId:string;requestId:string;allow:boolean}) => ipcRenderer.invoke('workbench:supervision-approval',input),
      supervisionControl: (input: {sessionId:string;resume?:boolean}) => ipcRenderer.invoke('workbench:supervision-control',input),
      onTaskApproval: (fn: (approval: import('../shared/workSupervision').TaskApproval) => void) => {
        const listener=(_e:unknown,approval:import('../shared/workSupervision').TaskApproval)=>fn(approval)
        ipcRenderer.on('chat:task-approval',listener)
        return()=>ipcRenderer.removeListener('chat:task-approval',listener)
      },
      loadCatalog: () => ipcRenderer.invoke('workbench:catalog-load'),
      saveCatalog: (catalog: unknown) => ipcRenderer.invoke('workbench:catalog-save', catalog),
      open: (input: { cwd?: string; sessionId?: string }) => ipcRenderer.invoke('workbench:open', input),
      snapshot: (sessionId: string) => ipcRenderer.invoke('workbench:snapshot', sessionId),
      queue: (sessionId: string) => ipcRenderer.invoke('workbench:queue', sessionId),
      removeQueued: (input: { sessionId: string; itemId: string }) => ipcRenderer.invoke('workbench:queue-remove', input),
      send: (input: import('../shared/tasks').StandaloneWorkInput) => ipcRenderer.invoke('workbench:send', input),
      inputQueue: (taskId:string) => ipcRenderer.invoke('workbench:input-queue',taskId),
      promoteInput: (requestId:string) => ipcRenderer.invoke('workbench:promote-input',requestId),
      cancelTaskQueue: (taskId:string)=>ipcRenderer.invoke('workbench:cancel-task-queue',taskId),
      cancelInput: (requestId:string) => ipcRenderer.invoke('workbench:cancel-input',requestId),
      enqueue: (input: { sessionId: string; text: string }) => ipcRenderer.invoke('workbench:enqueue', input),
      permission: (input: { sessionId: string; requestId: string; decision: 'allow' | 'deny'; toolName?: string }) => ipcRenderer.invoke('workbench:permission', input),
      planDecision: (input: { sessionId: string; requestId: string; decision: 'approve' | 'reject' }) => ipcRenderer.invoke('workbench:plan-decision', input),
      answer: (input: { sessionId: string; requestId: string; answers: Record<string, string>; cancelled?: boolean }) => ipcRenderer.invoke('workbench:answer', input),
      abort: (sessionId: string) => ipcRenderer.invoke('workbench:abort', sessionId),
      mode: (input: { sessionId: string; mode: 'default' | 'acceptEdits' | 'bypassPermissions' }) => ipcRenderer.invoke('workbench:mode', input),
      readFile: (input: { cwd: string; path: string }) => ipcRenderer.invoke('workbench:file-read', input),
      createFile: (input: { cwd: string; name: string }) => ipcRenderer.invoke('workbench:file-create', input),
      cliLaunch: (input: import('../shared/terminal').CliLaunchInput) => ipcRenderer.invoke('workbench:cli-launch', input) as Promise<import('../shared/terminal').ExternalCliSnapshot>,
      cliOpen: (input: import('../shared/terminal').CliOpenInput) => ipcRenderer.invoke('workbench:cli-open', input) as Promise<import('../shared/terminal').CliTerminalSnapshot>,
      cliInput: (input: {terminalId:string;data:string}) => ipcRenderer.invoke('workbench:cli-input',input),
      cliResize: (input: {terminalId:string;cols:number;rows:number}) => ipcRenderer.invoke('workbench:cli-resize',input),
      cliClose: (terminalId:string) => ipcRenderer.invoke('workbench:cli-close',terminalId),
      cliCloseTask: (taskId:string) => ipcRenderer.invoke('workbench:cli-close-task',taskId),
      onCliData: (callback: (event:import('../shared/terminal').CliTerminalEvent)=>void) => {
        const listener=(_event:unknown,payload:import('../shared/terminal').CliTerminalEvent)=>callback(payload)
        ipcRenderer.on('workbench:cli-data',listener)
        return()=>ipcRenderer.removeListener('workbench:cli-data',listener)
      },
      terminal: (input: { cwd: string; command: string }) => ipcRenderer.invoke('workbench:terminal', input),
    terminalExec: (input: { cwd: string; command: string }) => ipcRenderer.invoke('workbench:terminal-exec', input) as Promise<{ output: string }>,
    terminalDispose: (cwd: string) => ipcRenderer.invoke('workbench:terminal-dispose', cwd) as Promise<{ ok: boolean }>,
    fileHistory: (sessionId: string) => ipcRenderer.invoke('workbench:file-history', sessionId) as Promise<unknown>,
    rewind: (input: { sessionId: string; messageId?: string; dryRun: boolean }) => ipcRenderer.invoke('workbench:rewind', input) as Promise<{ ok: boolean; filesChanged?: string[]; messageId?: string }>,
    rerunLast: (input: { taskId: string; turnId: string; sessionId: string; text: string; cwd: string; attachments?: Array<{kind: 'doc'|'folder'|'image'|'video';path:string;name:string}> }) => ipcRenderer.invoke('workbench:rerun-last', input) as Promise<{ runId: string }>,
      onEvent: (cb: (payload: { taskId: string; turnId: string; event: unknown; goalRevision?:number; controlEpoch?:number }) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: { taskId: string; turnId: string; event: unknown; goalRevision?:number; controlEpoch?:number }) => cb(payload)
        ipcRenderer.on('workbench:event', listener)
        return () => ipcRenderer.removeListener('workbench:event', listener)
      }
    },
  readRel: (rel: string, maxBytes?: number) => ipcRenderer.invoke('fs:readRel', rel, maxBytes),
  writeAllowed: (rel: string, content: string, mode: 'append' | 'overwrite') =>
    ipcRenderer.invoke('fs:writeAllowed', rel, content, mode),
  touchChatActivity: () => ipcRenderer.invoke('chat:activity'),
  onTaskReplyProgress: (fn: (event: { sessionId: string; runId: string; text: string; at: number }) => void) => {
    const listener = (_e: unknown, event: { sessionId: string; runId: string; text: string; at: number }) => fn(event)
    ipcRenderer.on('chat:task-progress', listener)
    return () => ipcRenderer.removeListener('chat:task-progress', listener)
  },
  stopChat: () => ipcRenderer.invoke('chat:stop'),
  startChat: (payload: {
    filePaths?: string[]
    imagePaths?: string[]
    imageHistory?: Array<{text:string;paths:string[]}>
    fileHistory?: Array<{text:string;paths:string[]}>
    messages: unknown[]
    settings: AppSettings
    turnId?: string
    knowledgeTopic?: string
    suggestedSearchQuery?: string
    forcedWebSearchQuery?: string
    planDocumentTopic?: string
    userTaskFrame?: UserTaskFrame
    useWaveChat?: boolean
    wavePlan?: WavePlan
    waveContext?: Record<string, unknown>
    sessionId?: string
    targetAgentId?: string
    interactionSurface?: string
    desktopAgentChatMode?: boolean
  }) => ipcRenderer.invoke('chat:start', payload),
  desktopAgent: {
    sessionMode: {
      get: (sessionId?: string) =>
        ipcRenderer.invoke('desktop-agent:sessionMode:get', sessionId) as Promise<{
          enabled: boolean
          settingsReady: boolean
        }>,
      set: (sessionId: string, enabled: boolean) =>
        ipcRenderer.invoke('desktop-agent:sessionMode:set', { sessionId, enabled }) as Promise<{
          ok: boolean
          enabled?: boolean
          error?: string
        }>
    },
    opening: () =>
      ipcRenderer.invoke('desktop-agent:opening') as Promise<
        { ok: true; text: string } | { ok: false; error: string }
      >,
    confirm: {
      onRequest: (fn: (payload: DesktopAgentConfirmRequest) => void) => {
        ensureDesktopAgentConfirmBridge()
        desktopAgentConfirmListeners.add(fn)
        return () => {
          desktopAgentConfirmListeners.delete(fn)
        }
      },
      allow: (requestId: string) =>
        ipcRenderer.invoke('desktop-agent:confirm:allow', { requestId }),
      allowSession: (requestId: string) =>
        ipcRenderer.invoke('desktop-agent:confirm:allowSession', { requestId }),
      allowTaskDeletes: (requestId: string, taskPlanId: string) =>
        ipcRenderer.invoke('desktop-agent:confirm:allowTaskDeletes', { requestId, taskPlanId }),
      deny: (requestId: string) =>
        ipcRenderer.invoke('desktop-agent:confirm:deny', { requestId })
    },
    auditRecent: (limit?: number) => ipcRenderer.invoke('desktop-agent:audit:recent', limit)
  },
  machineMap: {
    status: () =>
      ipcRenderer.invoke('machine-map:status') as Promise<
        import('../shared/machineMap').MachineMapStatus
      >,
    reindex: () => ipcRenderer.invoke('machine-map:reindex') as Promise<{ ok: boolean }>,
    onProgress: (
      fn: (payload: import('../shared/machineMap').MachineMapProgressPayload | null) => void
    ) => {
      ipcRenderer.removeAllListeners('machine-map:progress')
      ipcRenderer.on('machine-map:progress', (_e, payload) => fn(payload))
    }
  },
  getState: (opts?: { targetAgentId?: string }) => ipcRenderer.invoke('state:get', opts),
  resetState: () => ipcRenderer.invoke('state:reset'),
  traceLatest: (n?: number) => ipcRenderer.invoke('trace:latest', n),
  memoryList: (opts?: { ownerAgentId?: string }) => ipcRenderer.invoke('memory:list', opts),
  memoryAuditReport: (opts?: {
    mode?: 'curated_audit' | 'self_report' | 'stats_only' | 'full_dump'
    page?: number
    includeAvoid?: boolean
  }) => ipcRenderer.invoke('memory:auditReport', opts),
  memoryWhyStored: (factId: string) => ipcRenderer.invoke('memory:whyStored', factId),
  memoryActionTimeline: (sessionId: string, limit?: number) =>
    ipcRenderer.invoke('memory:actionTimeline', sessionId, limit),
  memoryAuditMetrics: () => ipcRenderer.invoke('memory:auditMetrics'),
  memoryPermanentDeletePreview: (preview: {
    targetKind: 'fact' | 'episode'
    targetId: string
    scope: 'memory_only' | 'memory_and_source'
    summary: string
  }) => ipcRenderer.invoke('memory:permanentDeletePreview', preview),
  memoryPermanentDelete: (
    preview: {
      targetKind: 'fact' | 'episode'
      targetId: string
      scope: 'memory_only' | 'memory_and_source'
      summary: string
    },
    turnId?: string | null,
    confirmed?: boolean
  ) => ipcRenderer.invoke('memory:permanentDelete', preview, turnId, confirmed),
  memoryLegacyBackfill: (opts?: { apply?: boolean; batchSize?: number; maxRounds?: number }) =>
    ipcRenderer.invoke('memory:legacyBackfill', opts),
  memoryUpdate: (id: string, patch: { summary?: string; weight?: number; confidence?: number; triggers?: string[] }) =>
    ipcRenderer.invoke('memory:update', id, patch),
  memoryRetire: (id: string) => ipcRenderer.invoke('memory:retire', id),
  /** Governance four-type control (mute / correct / forget / delete). */
  memoryControl: (command: import('../main/memory/contracts').MemoryControlCommand) =>
    ipcRenderer.invoke('memory:control', command),
  /** Natural-language control; ambiguous targets return requiresConfirmation (no execute). */
  memoryResolveControl: (
    text: string,
    candidateTargets: import('../main/memory/contracts').MemoryTarget[]
  ) => ipcRenderer.invoke('memory:resolveControl', text, candidateTargets),
  memoryClearAll: () => ipcRenderer.invoke('memory:clearAll'),
  memoryClearOwner: (opts?: { ownerAgentId?: string }) =>
    ipcRenderer.invoke('memory:clearOwner', opts),
  memoryFeedback: (id: string, action: 'thumbs_up' | 'thumbs_down') =>
    ipcRenderer.invoke('memory:feedback', id, action),
  appReload: () => ipcRenderer.invoke('app:reload'),
  uninstallInfo: (): Promise<{
    mode: 'dev' | 'portable' | 'installed'
    installDir: string
    dataRoot: string
    batPath: string | null
    nsisUninstaller: string | null
  }> => ipcRenderer.invoke('app:uninstallInfo'),
  uninstallAckem: (opts?: { deleteData?: boolean; removeApp?: boolean }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('app:uninstall', opts ?? {}),
  embeddingStatus: () => ipcRenderer.invoke('embedding:status'),
  embeddingReadiness: () => ipcRenderer.invoke('embedding:readiness'),
  onEmbeddingReadinessChanged: (fn: (snap: {
    phase: string
    progress: number
    providerReady: boolean
    factEmbeddingsReady: boolean
    preLlmWarmReady: boolean
    error?: string
  }) => void) => {
    const handler = (_e: unknown, snap: Parameters<typeof fn>[0]) => fn(snap)
    ipcRenderer.on('embedding:readiness-changed', handler)
    return () => {
      ipcRenderer.removeListener('embedding:readiness-changed', handler)
    }
  },
  embeddingSwitch: (modelId: string) => ipcRenderer.invoke('embedding:switch', modelId),
  embeddingDownload: (modelId: string) => ipcRenderer.invoke('embedding:download', modelId),
  embeddingDownloadCancel: (modelId: string) => ipcRenderer.invoke('embedding:downloadCancel', modelId),
  policyDecisionLogRecent: (limit?: number) => ipcRenderer.invoke('policy:decisionLogRecent', limit),
  onEmbeddingDownloadProgress: (fn: (p: { modelId: string; bytes: number; total: number; speed: number }) => void) => {
    ipcRenderer.removeAllListeners('embedding:downloadProgress')
    ipcRenderer.on('embedding:downloadProgress', (_e, p) => fn(p))
  },
  personalityList: (gender?: PresetGender) => ipcRenderer.invoke('personality:list', gender),
  personalitySet: (id: string) => ipcRenderer.invoke('personality:set', id),
  profileEstimateScan: (relPaths: string[]) => ipcRenderer.invoke('profile:estimateScan', relPaths),
  profileGet: () => ipcRenderer.invoke('profile:get'),
  profileInferFromFiles: (args: { relPaths: string[]; consentAck: boolean; consentVersion: number }) =>
    ipcRenderer.invoke('profile:inferFromFiles', args),
  profileApplyCompanionSuggestion: () => ipcRenderer.invoke('profile:applyCompanionSuggestion'),
  memoryConsolidate: () => ipcRenderer.invoke('memory:consolidate'),
  associationList: (opts?: { ownerAgentId?: string }) =>
    ipcRenderer.invoke('association:list', opts),
  anchorList: () => ipcRenderer.invoke('anchor:list'),
  memoryStats: (opts?: { ownerAgentId?: string }) =>
    ipcRenderer.invoke('memory:stats', opts),
  onMemoryUpdated: (fn: (payload: { sessionId: string; turnIndex: number; newFactCount: number }) => void) => {
    const handler = (_e: unknown, payload: Parameters<typeof fn>[0]) => fn(payload)
    ipcRenderer.on('memory:updated', handler)
    return () => {
      ipcRenderer.removeListener('memory:updated', handler)
    }
  },
  kgList: (opts?: { ownerAgentId?: string }) => ipcRenderer.invoke('kg:list', opts),
  kgOneHop: (entity: string) => ipcRenderer.invoke('kg:oneHop', entity),
  episodeList: (opts?: { ownerAgentId?: string }) =>
    ipcRenderer.invoke('episode:list', opts),
  desireList: () => ipcRenderer.invoke('desire:list'),
  desireDismiss: (desireId: string) => ipcRenderer.invoke('desire:dismiss', desireId),
  desireClearActive: () => ipcRenderer.invoke('desire:clearActive'),
  mirrorCheck: () => ipcRenderer.invoke('mirror:check'),
  mirrorFindings: () => ipcRenderer.invoke('mirror:findings'),
  diaryGenerate: (opts?: { date?: string; force?: boolean }) => ipcRenderer.invoke('diary:generate', opts),
  diaryList: () => ipcRenderer.invoke('diary:list'),
  diaryRead: (date: string) => ipcRenderer.invoke('diary:read', date),
  thoughtGenerate: () => ipcRenderer.invoke('thought:generate'),
  ext: {
    gamemode: {
      list: () => ipcRenderer.invoke('ext:gamemode:list'),
      activate: (gameId: string, config: unknown) => ipcRenderer.invoke('ext:gamemode:activate', gameId, config),
      deactivate: () => ipcRenderer.invoke('ext:gamemode:deactivate'),
      status: () => ipcRenderer.invoke('ext:gamemode:status'),
      invoke: (gameId: string, method: string, params?: Record<string, unknown>) =>
        ipcRenderer.invoke('ext:gamemode:invoke', { gameId, method, params }),
      minecraft: gamemodeMinecraft,
      onEvent: (gameId: string, fn: (payload: { gameId: string; event: unknown; reaction: unknown }) => void) => {
        ipcRenderer.removeAllListeners('ext:gamemode:event')
        ipcRenderer.on('ext:gamemode:event', (_e, payload: { gameId?: string; event: unknown; reaction: unknown }) => {
          if (!payload?.gameId || payload.gameId === gameId) fn(payload as { gameId: string; event: unknown; reaction: unknown })
        })
      }
    },
    plugins: {
      list: (type?: string) => ipcRenderer.invoke('ext:plugins:list', type),
      activate: (id: string) => ipcRenderer.invoke('ext:plugins:activate', id),
      deactivate: (id: string) => ipcRenderer.invoke('ext:plugins:deactivate', id),
    },
    skills: {
      list: () => ipcRenderer.invoke('ext:skills:list'),
      activate: (id: string) => ipcRenderer.invoke('ext:skills:activate', id),
      deactivate: (id: string) => ipcRenderer.invoke('ext:skills:deactivate', id)
    }
  },
  openforu: {
    workspaces: {
      list: () => ipcRenderer.invoke('openforu:workspaces:list'),
      open: () => ipcRenderer.invoke('openforu:workspaces:open'),
      create: (name?: string) => ipcRenderer.invoke('openforu:workspaces:create', name ? { name } : undefined),
      switch: (workspaceId: string) => ipcRenderer.invoke('openforu:workspaces:switch', workspaceId),
      delete: (workspaceId: string) => ipcRenderer.invoke('openforu:workspaces:delete', workspaceId)
    },
    planStart: () => ipcRenderer.invoke('openforu:plan:start'),
    planSend: (sessionId: string, text: string) =>
      ipcRenderer.invoke('openforu:plan:send', { sessionId, text }),
    planConfirm: (sessionId: string) => ipcRenderer.invoke('openforu:plan:confirm', sessionId),
    planApproveWireframe: (sessionId: string) =>
      ipcRenderer.invoke('openforu:plan:approveWireframe', sessionId),
    planDeploy: (sessionId: string) => ipcRenderer.invoke('openforu:plan:deploy', sessionId),
    planRedeploy: (sessionId: string, userText?: string) =>
      ipcRenderer.invoke('openforu:plan:redeploy', { sessionId, userText }),
    planRefineOpen: (
      extensionId: string,
      opts?: { instruction?: string; displayName?: string }
    ) => ipcRenderer.invoke('openforu:plan:refineOpen', { extensionId, ...opts }),
    onPlanSessionUpdated: (
      fn: (payload: Record<string, unknown>) => void
    ) => {
      const handler = (_e: unknown, payload: Record<string, unknown>) => fn(payload)
      ipcRenderer.on('openforu:plan:session-updated', handler)
      return () => {
        ipcRenderer.removeListener('openforu:plan:session-updated', handler)
      }
    },
    planStatus: (sessionId: string) => ipcRenderer.invoke('openforu:plan:status', sessionId),
    listArtifacts: () => ipcRenderer.invoke('openforu:listArtifacts'),
    previewArtifact: (sessionId: string) =>
      ipcRenderer.invoke('openforu:artifact:preview', sessionId),
    readArtifact: (uskillId: string) => ipcRenderer.invoke('openforu:artifact:read', uskillId),
    listExtensions: () => ipcRenderer.invoke('openforu:extensions:list'),
    openSurfaceWindow: (extensionId: string) =>
      ipcRenderer.invoke('openforu:surface:open', { extensionId }),
    removeExtension: (kind: 'uskill' | 'uplugin', id: string) =>
      ipcRenderer.invoke('openforu:extensions:remove', { kind, id }),
    permissions: {
      onRequest: (fn: (payload: PermissionRequestPayload) => void) => {
        ensureOpenforuPermissionBridge()
        openforuPermissionListeners.add(fn)
        return () => {
          openforuPermissionListeners.delete(fn)
        }
      },
      approve: (requestId: string) =>
        ipcRenderer.invoke('openforu:permissions:approve', { requestId }),
      deny: (requestId: string) => ipcRenderer.invoke('openforu:permissions:deny', { requestId }),
      approveAndActivate: (pluginId: string) =>
        ipcRenderer.invoke('openforu:permissions:approveAndActivate', { pluginId })
    },
    onNotify: (fn: (payload: { text: string }) => void) => {
      ensureOpenforuNotifyBridge()
      openforuNotifyListeners.add(fn)
      return () => {
        openforuNotifyListeners.delete(fn)
      }
    },
    agent: {
      getStatus: (sessionId: string) => ipcRenderer.invoke('openforu:agent:status', sessionId),
      cancel: (sessionId: string) => ipcRenderer.invoke('openforu:agent:cancel', sessionId),
      onEvent: (fn: (payload: AgentEvent) => void) => {
        if (!openforuAgentEventBridgeReady) {
          openforuAgentEventBridgeReady = true
          ipcRenderer.on('openforu:agent:event', (_e, payload: AgentEvent) => {
            for (const listener of openforuAgentEventListeners) listener(payload)
          })
        }
        openforuAgentEventListeners.add(fn)
        return () => {
          openforuAgentEventListeners.delete(fn)
        }
      }
    },
    refine: {
      preview: (extensionId: string, instruction: string) =>
        ipcRenderer.invoke('openforu:refine:preview', { extensionId, instruction }),
      apply: (extensionId: string, instruction: string) =>
        ipcRenderer.invoke('openforu:refine:apply', { extensionId, instruction }),
      history: (extensionId: string) => ipcRenderer.invoke('openforu:refine:history', extensionId),
      rollback: (
        extensionId: string,
        targetVersion: string,
        kind?: 'uskill' | 'uplugin'
      ) => ipcRenderer.invoke('openforu:refine:rollback', { extensionId, targetVersion, kind })
    }
  },
  companionSkinActive: () => ipcRenderer.invoke('ext:companionSkin:active'),
  companionSkinList: () => ipcRenderer.invoke('ext:companionSkin:list'),
  companionSkinSetActive: (pluginId: string | null) =>
    ipcRenderer.invoke('ext:companionSkin:setActive', pluginId),
  onCompanionSkinChanged: (fn: () => void) => {
    ipcRenderer.removeAllListeners('companionSkin:changed')
    ipcRenderer.on('companionSkin:changed', () => fn())
  },
  /** @deprecated 使用 ext.gamemode.minecraft */
  mcReact: gamemodeMinecraft.react,
  /** @deprecated 使用 ext.gamemode.minecraft */
  mcParseLog: gamemodeMinecraft.parseLog,
  /** @deprecated 使用 ext.gamemode.minecraft */
  mcStatus: gamemodeMinecraft.getWsStatus,
  /** @deprecated 使用 ext.gamemode.minecraft */
  mcSetEngineState: gamemodeMinecraft.syncEngineState,
  /** @deprecated 使用 ext.gamemode.minecraft */
  mcBotStart: gamemodeMinecraft.botStart,
  /** @deprecated 使用 ext.gamemode.minecraft */
  mcBotStop: gamemodeMinecraft.botStop,
  /** @deprecated 使用 ext.gamemode.minecraft */
  mcBotStatus: gamemodeMinecraft.botStatus,
  /** @deprecated 使用 ext.gamemode.minecraft */
  mcBotDebug: gamemodeMinecraft.botDebug,
  /** @deprecated 使用 ext.gamemode.minecraft */
  mcLogStart: gamemodeMinecraft.logStart,
  /** @deprecated 使用 ext.gamemode.minecraft */
  mcLogStop: gamemodeMinecraft.logStop,
  /** @deprecated 使用 ext.gamemode.minecraft */
  mcLogStatus: gamemodeMinecraft.logStatus,
  sessionList: () => ipcRenderer.invoke('session:list'),
  sessionCreate: (name: string) => ipcRenderer.invoke('session:create', name),
  sessionSwitch: (sessionId: string) => ipcRenderer.invoke('session:switch', sessionId),
  sessionDelete: (sessionId: string) => ipcRenderer.invoke('session:delete', sessionId),
  archiveList: (opts?: { ownerAgentId?: string }) =>
    ipcRenderer.invoke('archive:list', opts),
  archiveRead: (relPath: string, opts?: { ownerAgentId?: string }) =>
    ipcRenderer.invoke('archive:read', relPath, opts),
  archiveExport: (opts?: { ownerAgentId?: string }) =>
    ipcRenderer.invoke('memory:exportArchive', opts),
  loadChatHistory: (opts?: { targetAgentId?: string }) =>
    ipcRenderer.invoke('chat:loadHistory', opts),
  saveChatHistory: (rows: unknown[], opts?: { targetAgentId?: string }) =>
    ipcRenderer.invoke('chat:saveHistory', rows, opts),
  i18n: {
    t: (key: string, params?: Record<string, string | number>) => ipcRenderer.invoke('i18n:t', key, params),
    getLocale: () => ipcRenderer.invoke('i18n:getLocale') as Promise<string>,
    setLocale: (locale: string) => ipcRenderer.invoke('i18n:setLocale', locale),
    getAllResources: () => ipcRenderer.invoke('i18n:getAllResources') as Promise<{ zh: Record<string, string>; en: Record<string, string>; locale: string }>,
  },
  companionTimeContext: () => ipcRenderer.invoke('companion:timeContext'),
  companionPresence: () => ipcRenderer.invoke('companion:presence'),
  companionTouch: () => ipcRenderer.invoke('companion:touch'),
  companionStatusText: () => ipcRenderer.invoke('companion:statusText'),
  companionGetConfig: () => ipcRenderer.invoke('companion:getConfig'),
  companionSetConfig: (patch: unknown) => ipcRenderer.invoke('companion:setConfig', patch),
  onCompanionProactive: (fn: (payload: { message: string; timeContext: unknown }) => void) => {
    ipcRenderer.removeAllListeners('companion:proactive')
    ipcRenderer.on('companion:proactive', (_e, payload) => fn(payload))
  },
  onDiaryAutoGenerated: (fn: (payload: { date: string; type: string }) => void) => {
    ipcRenderer.removeAllListeners('diary:autoGenerated')
    ipcRenderer.on('diary:autoGenerated', (_e, payload) => fn(payload))
  },
  mediaStatus: (): Promise<{ title: string; artist: string; album: string; isPlaying: boolean; formatted: string }> =>
    ipcRenderer.invoke('ext:media:status'),
  onChatChunk: (fn: (s: string) => void) => {
    ipcRenderer.removeAllListeners('chat:chunk')
    ipcRenderer.on('chat:chunk', (_e, s: string) => fn(s))
  },
  /** 思考模型 reasoning_content 单独通道 (折叠灰度显示, 不进正文气泡)。 */
  onChatReasoning: (fn: (s: string) => void) => {
    ipcRenderer.removeAllListeners('chat:reasoning')
    ipcRenderer.on('chat:reasoning', (_e, s: string) => fn(s))
  },
  onReplyEvent: (fn: (event: import('../shared/response').ReplyEvent) => void) => {
    const listener = (_e: unknown, event: import('../shared/response').ReplyEvent) => fn(event)
    ipcRenderer.on('chat:reply', listener)
    return () => ipcRenderer.removeListener('chat:reply', listener)
  },
  onChatDelivery: (fn: (event: { sessionId: string; row: unknown }) => void) => {
    const listener = (_e: unknown, event: { sessionId: string; row: unknown }) => fn(event)
    ipcRenderer.on('chat:delivery', listener)
    return () => ipcRenderer.removeListener('chat:delivery', listener)
  },
  onChatStreamStart: (fn: () => void) => {
    ipcRenderer.removeAllListeners('chat:stream-start')
    ipcRenderer.on('chat:stream-start', () => fn())
  },
  onChatWaveStart: (fn: (payload: { waveIndex: number; waveCount: number; newBubble: boolean }) => void) => {
    ipcRenderer.removeAllListeners('chat:wave-start')
    ipcRenderer.on('chat:wave-start', (_e, payload) => fn(payload))
  },
  onChatWaveEnd: (fn: (payload: { waveIndex: number; text: string; partial?: boolean }) => void) => {
    ipcRenderer.removeAllListeners('chat:wave-end')
    ipcRenderer.on('chat:wave-end', (_e, payload) => fn(payload))
  },
  probeLocalChat: (patch?: Partial<AppSettings>) =>
    ipcRenderer.invoke('settings:probeLocalChat', patch) as Promise<{
      ok: boolean
      latencyMs?: number
      model?: string
      error?: string
    }>,
  onChatReplace: (fn: (text: string) => void) => {
    ipcRenderer.removeAllListeners('chat:replace')
    ipcRenderer.on('chat:replace', (_e, text: string) => fn(text))
  },
  onChatStatus: (fn: (text: string) => void) => {
    ipcRenderer.removeAllListeners('chat:status')
    ipcRenderer.on('chat:status', (_e, text: string) => fn(text))
  },
  onInvestigationProgress: (
    fn: (payload: import('../shared/investigation').InvestigationProgressPayload | null) => void
  ) => {
    ipcRenderer.removeAllListeners('investigation:progress')
    ipcRenderer.on('investigation:progress', (_e, payload) => fn(payload))
  },
  onTaskPlanProgress: (
    fn: (payload: import('../shared/desktopAgentTaskPlan').TaskPlanProgressPayload | null) => void
  ) => {
    ipcRenderer.removeAllListeners('taskplan:progress')
    ipcRenderer.on('taskplan:progress', (_e, payload) => fn(payload))
  },
  onDesktopAgentAgentBusy: (fn: (payload: { sessionId: string; busy: boolean }) => void) => {
    ipcRenderer.removeAllListeners('desktop-agent:agent-busy')
    ipcRenderer.on('desktop-agent:agent-busy', (_e, payload) => fn(payload))
  },
  onDesktopAgentJobState: (
    fn: (payload: import('../shared/desktopAgentDock').DesktopAgentJobStatePayload) => void
  ) => {
    ipcRenderer.removeAllListeners('desktop-agent:job-state')
    ipcRenderer.on('desktop-agent:job-state', (_e, payload) => fn(payload))
  },
  onDesktopAgentJobStatus: (fn: (payload: { sessionId: string; label: string }) => void) => {
    ipcRenderer.removeAllListeners('desktop-agent:job-status')
    ipcRenderer.on('desktop-agent:job-status', (_e, payload) => fn(payload))
  },
  onDesktopAgentTaskDelivery: (
    fn: (payload: import('../shared/desktopAgentDock').DesktopAgentTaskDeliveryPayload) => void
  ) => {
    ipcRenderer.removeAllListeners('desktop-agent:task-delivery')
    ipcRenderer.on('desktop-agent:task-delivery', (_e, payload) => fn(payload))
  },
  onDesktopAgentTaskDeliveryQueued: (
    fn: (payload: import('../shared/desktopAgentDock').DesktopAgentTaskDeliveryPayload) => void
  ) => {
    ipcRenderer.removeAllListeners('desktop-agent:task-delivery-queued')
    ipcRenderer.on('desktop-agent:task-delivery-queued', (_e, payload) => fn(payload))
  },
  onExtensionTrigger: (
    fn: (payload: {
      extensionId: string
      extensionName: string
      kind: 'skill' | 'plugin' | 'gamemode'
    }) => void
  ) => {
    ipcRenderer.removeAllListeners('chat:extensionTrigger')
    ipcRenderer.on('chat:extensionTrigger', (_e, payload) => fn(payload))
  },
  onChatSearchCard: (fn: (payload: import('../shared/searchCard').SearchCardPayload) => void) => {
    ipcRenderer.removeAllListeners('chat:searchCard')
    ipcRenderer.on('chat:searchCard', (_e, payload) => fn(payload))
  },
  onChatMemoryAudit: (fn: (payload: import('../shared/memoryAudit').MemoryAuditCardPayload) => void) => {
    ipcRenderer.removeAllListeners('chat:memoryAudit')
    ipcRenderer.on('chat:memoryAudit', (_e, payload) => fn(payload))
  },
  onChatDone: (
    fn: (meta?: {
      memoryWrites?: string[]
      assistantText?: string
      turnId?: string
      stateDelta?: { turnId?: string; bubbles: Array<{ key: string; label: string; delta: number; reason: string }> }
    }) => void
  ) => {
    ipcRenderer.removeAllListeners('chat:done')
    ipcRenderer.on('chat:done', (_e, meta) => fn(meta))
  },
  onChatError: (fn: (err: string) => void) => {
    ipcRenderer.removeAllListeners('chat:error')
    ipcRenderer.on('chat:error', (_e, err: string) => fn(err))
  },
  onDispatchProactive: (fn: (payload: { extensionId: string; message: string }) => void) => {
    ipcRenderer.removeAllListeners('dispatch:proactive')
    ipcRenderer.on('dispatch:proactive', (_e, payload) => fn(payload))
  },
  /** @deprecated 使用 ext.gamemode.onEvent('minecraft', ...) */
  onMcEvent: (fn: (payload: { event: unknown; reaction: unknown }) => void) => {
    ipcRenderer.removeAllListeners('mc:event')
    ipcRenderer.on('mc:event', (_e, payload) => fn(payload))
    ipcRenderer.removeAllListeners('ext:gamemode:event')
    ipcRenderer.on('ext:gamemode:event', (_e, payload: { gameId?: string; event: unknown; reaction: unknown }) => {
      if (payload?.gameId === GAME_MINECRAFT) fn({ event: payload.event, reaction: payload.reaction })
    })
  },
  onMcBotDebug: (fn: (snapshot: Record<string, unknown>) => void) => {
    ipcRenderer.removeAllListeners('mc:botDebug')
    ipcRenderer.on('mc:botDebug', (_e, snapshot) => fn(snapshot))
  },
  onWindowFocused: (fn: () => void) => {
    ipcRenderer.removeAllListeners('window-focused')
    ipcRenderer.on('window-focused', () => fn())
  },
  weixinGetStatus: (): Promise<{
    connected: boolean
    enabled: boolean
    polling: boolean
    proactiveEnabled: boolean
    accountId?: string
    userId?: string
    boundAgentId?: string
    lastError?: string | null
    tokenExpired: boolean
    embeddingReady?: boolean
  }> => ipcRenderer.invoke('weixin:getStatus'),
  weixinStartLogin: (args?: {
    agentId?: string
  }): Promise<{ qrcode: string; qrcodeImgContent: string; qrcodeScanUrl?: string }> =>
    ipcRenderer.invoke('weixin:startLogin', args),
  weixinPollLogin: (args: { qrcode: string; verifyCode?: string; baseUrl?: string }) =>
    ipcRenderer.invoke('weixin:pollLogin', args) as Promise<{
      ok: boolean
      status: string
      needVerifyCode?: boolean
      error?: string
    }>,
  weixinSubmitVerifyCode: (args: { qrcode: string; verifyCode: string }) =>
    ipcRenderer.invoke('weixin:submitVerifyCode', args) as Promise<{
      ok: boolean
      status: string
      needVerifyCode?: boolean
      error?: string
    }>,
  weixinSetBoundAgent: (args: { agentId: string }) =>
    ipcRenderer.invoke('weixin:setBoundAgent', args),
  weixinDisconnect: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('weixin:disconnect'),
  weixinSetEnabled: (enabled: boolean) => ipcRenderer.invoke('weixin:setEnabled', enabled),
  weixinSetProactiveEnabled: (enabled: boolean) =>
    ipcRenderer.invoke('weixin:setProactiveEnabled', enabled),
  weixinRestart: () => ipcRenderer.invoke('weixin:restart'),
  onWeixinStatusChanged: (
    fn: (status: {
      connected: boolean
      enabled: boolean
      polling: boolean
      proactiveEnabled: boolean
      accountId?: string
      userId?: string
      boundAgentId?: string
      lastError?: string | null
      tokenExpired: boolean
    }) => void
  ) => {
    ipcRenderer.removeAllListeners('weixin:status-changed')
    ipcRenderer.on('weixin:status-changed', (_e, payload) => fn(payload))
    return () => ipcRenderer.removeAllListeners('weixin:status-changed')
  },
  social: {
    listAgents: () => ipcRenderer.invoke('social:listAgents'),
    getAgent: (agentId: string) => ipcRenderer.invoke('social:getAgent', agentId),
    getAgentCard: (agentId: string) => ipcRenderer.invoke('social:getAgentCard', agentId),
    parseCharacterCard: (args: {
      format: 'md' | 'txt'
      content: string
      displayName?: string
      roleOrTagline?: string
      gender?: 'female' | 'male'
    }) => ipcRenderer.invoke('social:parseCharacterCard', args),
    createAgent: (input: Record<string, unknown>) => ipcRenderer.invoke('social:createAgent', input),
    updateAgent: (input: Record<string, unknown>) => ipcRenderer.invoke('social:updateAgent', input),
    deleteAgent: (agentId: string) => ipcRenderer.invoke('social:deleteAgent', agentId),
    setAgentAvatar: (args: {
      agentId: string
      croppedBytes: Uint8Array
      mime: 'image/webp' | 'image/png'
      sourceBytes?: Uint8Array
      sourceMime?: string
      crop?: { x: number; y: number; width: number; height: number }
    }) => ipcRenderer.invoke('social:setAgentAvatar', args),
    clearAgentAvatar: (agentId: string) => ipcRenderer.invoke('social:clearAgentAvatar', agentId),
    listPresetsForGender: (gender?: 'female' | 'male') =>
      ipcRenderer.invoke('social:listPresetsForGender', gender),
    parsePlatformCard: (zipBytes: Uint8Array) =>
      ipcRenderer.invoke('social:parsePlatformCard', zipBytes),
    getAgentAvatarDataUrl: (agentId: string) =>
      ipcRenderer.invoke('social:getAgentAvatarDataUrl', agentId),
    ensureSeeded: () => ipcRenderer.invoke('social:ensureSeeded'),
    getFeed: (args?: { limit?: number }) => ipcRenderer.invoke('social:getFeed', args),
    getAgentPosts: (args: { agentId: string; limit?: number }) =>
      ipcRenderer.invoke('social:getAgentPosts', args),
    likePost: (args: { postId: string }) => ipcRenderer.invoke('social:likePost', args),
    commentPost: (args: { postId: string; content: string }) =>
      ipcRenderer.invoke('social:commentPost', args),
    requestFriend: (args: { agentId: string }) => ipcRenderer.invoke('social:requestFriend', args),
    listFriends: () => ipcRenderer.invoke('social:listFriends'),
    getFriendship: (args: { agentId: string }) => ipcRenderer.invoke('social:getFriendship', args),
    muteAgent: (args: { agentId: string }) => ipcRenderer.invoke('social:muteAgent', args),
    blockAgent: (args: { agentId: string }) => ipcRenderer.invoke('social:blockAgent', args),
    unmuteAgent: (args: { agentId: string }) => ipcRenderer.invoke('social:unmuteAgent', args),
    unblockAgent: (args: { agentId: string }) => ipcRenderer.invoke('social:unblockAgent', args),
    listBlocks: () => ipcRenderer.invoke('social:listBlocks'),
    getEvents: (args?: { limit?: number }) => ipcRenderer.invoke('social:getEvents', args),
    getNotifications: () => ipcRenderer.invoke('social:getNotifications'),
    toggle: (args: { enabled: boolean }) => ipcRenderer.invoke('social:toggle', args),
    getSocialSettings: () => ipcRenderer.invoke('social:getSocialSettings'),
    setSocialSettings: (patch: Record<string, unknown>) =>
      ipcRenderer.invoke('social:setSocialSettings', patch),
    listGroups: () => ipcRenderer.invoke('social:listGroups'),
    createGroup: (args: { name: string; agentIds: string[] }) =>
      ipcRenderer.invoke('social:createGroup', args),
    requestJoinGroup: (args: { groupId: string }) =>
      ipcRenderer.invoke('social:requestJoinGroup', args),
    leaveGroup: (args: { groupId: string }) => ipcRenderer.invoke('social:leaveGroup', args),
    dissolveGroup: (args: { groupId: string }) => ipcRenderer.invoke('social:dissolveGroup', args),
    getGroupMessages: (args: { groupId: string; limit?: number }) =>
      ipcRenderer.invoke('social:getGroupMessages', args),
    sendGroupMessage: (args: { groupId: string; content: string }) =>
      ipcRenderer.invoke('social:sendGroupMessage', args),
    getAchievements: () => ipcRenderer.invoke('social:getAchievements'),
    runTickNow: () => ipcRenderer.invoke('social:runTickNow'),
    getOfflineReplay: () => ipcRenderer.invoke('social:getOfflineReplay'),
    ackOfflineReplay: () => ipcRenderer.invoke('social:ackOfflineReplay')
  },
  ui: {
    getTheme: (): Promise<'light' | 'dark'> =>
      ipcRenderer.invoke('ui:getTheme').then((r: { mode?: string }) =>
        r?.mode === 'light' ? 'light' : 'dark'
      ),
    setTheme: (mode: 'light' | 'dark') => ipcRenderer.invoke('ui:setTheme', mode),
    onThemeChanged: (fn: (mode: 'light' | 'dark') => void) => {
      ipcRenderer.removeAllListeners('ui:themeChanged')
      ipcRenderer.on('ui:themeChanged', (_e, payload: { mode?: string }) => {
        fn(payload?.mode === 'light' ? 'light' : 'dark')
      })
    },
    getLevel: () => ipcRenderer.invoke('ui:getLevel'),
    showPet: () => ipcRenderer.invoke('ui:showPet'),
    hidePet: () => ipcRenderer.invoke('ui:hidePet'),
    expandToMain: (opts?: { tab?: string }) => ipcRenderer.invoke('ui:expandToMain', opts),
    setAlwaysOnTop: (v: boolean) => ipcRenderer.invoke('ui:setAlwaysOnTop', v),
    setLevel: (level: 0 | 1 | 2 | 3) => ipcRenderer.invoke('ui:setLevel', level),
    onChatBubble: (fn: (payload: { text: string; role?: string; emotionLabel?: string }) => void) => {
      ipcRenderer.removeAllListeners('ui:chatBubble')
      ipcRenderer.on('ui:chatBubble', (_e, payload) => fn(payload))
    },
    onLevel: (fn: (payload: { level: number }) => void) => {
      ipcRenderer.removeAllListeners('ui:level')
      ipcRenderer.on('ui:level', (_e, payload) => fn(payload))
    },
    onExpand: (fn: (payload: { tab?: string }) => void) => {
      ipcRenderer.removeAllListeners('ui:expand')
      ipcRenderer.on('ui:expand', (_e, payload) => fn(payload))
    },
    onExtensionToast: (fn: (payload: { text: string; extensionId?: string }) => void) => {
      ipcRenderer.removeAllListeners('ui:extensionToast')
      ipcRenderer.on('ui:extensionToast', (_e, payload) => fn(payload))
    }
  },
  voice: {
    sendAudioChunk: (buffer: ArrayBuffer) => ipcRenderer.invoke('voice:audio-chunk', buffer),
    cancelTts: () => ipcRenderer.invoke('voice:cancel-tts'),
    setMode: (mode: string) => ipcRenderer.invoke('voice:set-mode', mode),
    setInputChannel: (channel: string) => ipcRenderer.invoke('voice:set-input-channel', channel),
    applySettings: (patch: Record<string, unknown>) =>
      ipcRenderer.invoke('voice:apply-settings', patch),
    restartService: () => ipcRenderer.invoke('voice:restart-service'),
    setPttActive: (active: boolean) => ipcRenderer.invoke('voice:ptt-active', active),
    freshUtterance: () => ipcRenderer.invoke('voice:fresh-utterance'),
    checkEnvironment: () => ipcRenderer.invoke('voice:check-environment'),
    installEnvironment: () => ipcRenderer.invoke('voice:install-environment'),
    setTheaterSession: (active: boolean) => ipcRenderer.invoke('voice:set-theater-session', active),
    health: () => ipcRenderer.invoke('voice:health'),
    onTtsAudio: (fn: (audio: ArrayBuffer) => void) => {
      ipcRenderer.removeAllListeners('voice:tts-audio')
      ipcRenderer.on('voice:tts-audio', (_e, audio: ArrayBuffer | Uint8Array) => {
        const ab =
          audio instanceof ArrayBuffer
            ? audio
            : audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength)
        fn(ab)
      })
      return () => ipcRenderer.removeAllListeners('voice:tts-audio')
    },
    onTtsSpeakText: (fn: (payload: { text: string }) => void) => {
      ipcRenderer.removeAllListeners('voice:tts-speak-text')
      ipcRenderer.on('voice:tts-speak-text', (_e, payload: { text: string }) => fn(payload))
      return () => ipcRenderer.removeAllListeners('voice:tts-speak-text')
    },
    onTtsSpeakCancel: (fn: () => void) => {
      ipcRenderer.removeAllListeners('voice:tts-speak-cancel')
      ipcRenderer.on('voice:tts-speak-cancel', () => fn())
      return () => ipcRenderer.removeAllListeners('voice:tts-speak-cancel')
    },
    onTranscript: (fn: (result: {
      text: string
      confidence: number
      sessionId?: number
      sequence?: number
    }) => void) => {
      const handler = (_e: unknown, result: Parameters<typeof fn>[0]) => fn(result)
      ipcRenderer.on('voice:transcript', handler)
      return () => ipcRenderer.removeListener('voice:transcript', handler)
    },
    onTranscriptPartial: (fn: (result: {
      text: string
      sessionId: number
      sequence: number
      stable: boolean
    }) => void) => {
      const handler = (_e: unknown, result: Parameters<typeof fn>[0]) => fn(result)
      ipcRenderer.on('voice:transcript-partial', handler)
      return () => ipcRenderer.removeListener('voice:transcript-partial', handler)
    },
    onAsrError: (fn: (result: { message: string }) => void) => {
      const handler = (_e: unknown, result: Parameters<typeof fn>[0]) => fn(result)
      ipcRenderer.on('voice:asr-error', handler)
      return () => ipcRenderer.removeListener('voice:asr-error', handler)
    },
    onStateChange: (fn: (state: string) => void) => {
      ipcRenderer.removeAllListeners('voice:state')
      ipcRenderer.on('voice:state', (_e, state: string) => fn(state))
      return () => ipcRenderer.removeAllListeners('voice:state')
    },
    onListening: (fn: (active: boolean) => void) => {
      ipcRenderer.removeAllListeners('voice:listening')
      ipcRenderer.on('voice:listening', (_e, active: boolean) => fn(active))
      return () => ipcRenderer.removeAllListeners('voice:listening')
    },
    onThinking: (fn: (active: boolean) => void) => {
      ipcRenderer.removeAllListeners('voice:thinking')
      ipcRenderer.on('voice:thinking', (_e, active: boolean) => fn(active))
      return () => ipcRenderer.removeAllListeners('voice:thinking')
    },
    onEngineStatus: (fn: (status: { engine: string; modelLoaded: boolean }) => void) => {
      ipcRenderer.removeAllListeners('voice:engine-status')
      ipcRenderer.on('voice:engine-status', (_e, status) => fn(status))
      return () => ipcRenderer.removeAllListeners('voice:engine-status')
    },
    onInstallLog: (fn: (progress: { phase: string; line: string }) => void) => {
      ipcRenderer.removeAllListeners('voice:install-log')
      ipcRenderer.on('voice:install-log', (_e, progress) => fn(progress))
      return () => ipcRenderer.removeAllListeners('voice:install-log')
    }
  },
  qqGetStatus: (): Promise<{
    connected: boolean
    enabled: boolean
    listening: boolean
    selfId?: string
    nickname?: string
    httpBaseUrl?: string
    wsUrl?: string
    lastError?: string | null
    embeddingReady?: boolean
    memesPath?: string
    memeCount?: number
  }> => ipcRenderer.invoke('qq:getStatus'),
  qqProbe: (args: {
    httpBaseUrl?: string
    wsUrl?: string
    accessToken?: string
    selfId?: string
  }): Promise<
    | { ok: true; selfId: string; nickname: string; online: boolean }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('qq:probe', args),
  qqConnect: (args: {
    httpBaseUrl?: string
    wsUrl?: string
    accessToken?: string
    selfId?: string
  }) => ipcRenderer.invoke('qq:connect', args),
  qqDisconnect: () => ipcRenderer.invoke('qq:disconnect'),
  qqSetEnabled: (enabled: boolean) => ipcRenderer.invoke('qq:setEnabled', enabled),
  qqRestart: () => ipcRenderer.invoke('qq:restart'),
  qqListFriends: () =>
    ipcRenderer.invoke('qq:listFriends') as Promise<
      { ok: true; friends: Array<{ userId: string; nickname: string }> } | { ok: false; error: string }
    >,
  qqWebuiGet: () =>
    ipcRenderer.invoke('qq:webui:get') as Promise<{ baseUrl: string; hasToken: boolean }>,
  qqLoginStart: (args?: { baseUrl?: string; token?: string; totpCode?: string }) =>
    ipcRenderer.invoke('qq:login:start', args) as Promise<QqLoginQrPayload>,
  qqLoginPoll: () =>
    ipcRenderer.invoke('qq:login:poll') as Promise<QqLoginPollPayload>,
  qqLoginRefresh: () =>
    ipcRenderer.invoke('qq:login:refresh') as Promise<QqLoginQrPayload>,
  onQqStatusChanged: (
    fn: (status: {
      connected: boolean
      enabled: boolean
      listening: boolean
      selfId?: string
      nickname?: string
      httpBaseUrl?: string
      wsUrl?: string
      lastError?: string | null
    }) => void
  ) => {
    ipcRenderer.removeAllListeners('qq:status-changed')
    ipcRenderer.on('qq:status-changed', (_e, payload) => fn(payload))
    return () => ipcRenderer.removeAllListeners('qq:status-changed')
  },
  // ── QQ 空间（说说）──
  qzoneGetStatus: () => ipcRenderer.invoke('qzone:getStatus'),
  qzoneProbe: () => ipcRenderer.invoke('qzone:probe'),
  qzoneGenerateDraft: (style?: string) => ipcRenderer.invoke('qzone:generateDraft', style),
  qzonePublish: (input: {
    content: string
    visibility?: 'public' | 'friends' | 'private'
    withImage?: boolean
    dryRun?: boolean
  }) => ipcRenderer.invoke('qzone:publish', input),
  qzoneHistory: (limit?: number) => ipcRenderer.invoke('qzone:history', limit),
  qzoneDelete: (id: number) => ipcRenderer.invoke('qzone:delete', id),
  qzoneInteractNow: () => ipcRenderer.invoke('qzone:interactNow'),
  onQzoneStatusChanged: (fn: (status: unknown) => void) => {
    ipcRenderer.removeAllListeners('qzone:status-changed')
    ipcRenderer.on('qzone:status-changed', (_e, payload) => fn(payload))
    return () => ipcRenderer.removeAllListeners('qzone:status-changed')
  },

})
