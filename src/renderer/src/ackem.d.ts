import type { AppSettings, CompanionSuggestion, LlmProvider, PresetGender, UserSixDimensions } from '../../shared/types'
import type { CompanionSkinBinding } from '../../shared/companionSkin'
import type { SearchCardPayload } from '../../shared/searchCard'
import type { MemoryAuditCardPayload } from '../../shared/memoryAudit'
import type { UserTaskFrame } from '../../shared/taskFrame'
import type { AgentEvent, AgentRunMeta } from '../../shared/openforuAgentTypes'
import type { PermissionRequestPayload } from '../../shared/openforuPermissions'

export type { AppSettings, CompanionSuggestion, LlmProvider, PresetGender, UserSixDimensions }
export type { OpenForUExtensionRow } from '../../shared/openforuExtensions'

export type SocialAgentSummary = {
  id: string
  name: string
  kind: 'primary' | 'social_member'
  origin: 'builtin' | 'user'
  deletable: boolean
  presetId: string
  gender: 'female' | 'male'
  sessionId: string
  se: number
  sp: number
  so: number
  personaSource: string | null
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export type SocialPresetOption = {
  id: string
  label: string
  gender: PresetGender
  requiresAdult18?: boolean
  social3D: { se: number; sp: number; so: number }
}

export type SocialApi = {
  listAgents: () => Promise<SocialAgentSummary[]>
  getAgent: (agentId: string) => Promise<SocialAgentSummary | null>
  getAgentCard: (agentId: string) => Promise<
    | { ok: true; card: Record<string, unknown> }
    | { ok: false; code: string; message: string }
  >
  parseCharacterCard: (args: {
    format: 'md' | 'txt'
    content: string
    displayName?: string
    roleOrTagline?: string
    gender?: 'female' | 'male'
  }) => Promise<
    | {
        ok: true
        parsed: {
          displayName: string
          gender: 'female' | 'male'
          roleOrTagline: string
          personaMarkdown: string
        }
        top3Presets: Array<{ presetId: string; label: string; score: number }>
      }
    | { ok: false; code: string; message: string }
  >
  createAgent: (input: Record<string, unknown>) => Promise<
    | { ok: true; agentId: string; warnings: Array<{ code: string; message: string }> }
    | { ok: false; code: string; message: string }
  >
  updateAgent: (input: Record<string, unknown>) => Promise<
    { ok: true } | { ok: false; code: string; message: string }
  >
  deleteAgent: (agentId: string) => Promise<
    { ok: true } | { ok: false; code: string; message: string }
  >
  setAgentAvatar: (args: {
    agentId: string
    croppedBytes: Uint8Array
    mime: 'image/webp' | 'image/png'
    sourceBytes?: Uint8Array
    sourceMime?: string
    crop?: { x: number; y: number; width: number; height: number }
  }) => Promise<
    | { ok: true; avatarUrl: string | null }
    | { ok: false; code: string; message: string }
  >
  clearAgentAvatar: (agentId: string) => Promise<
    { ok: true } | { ok: false; code: string; message: string }
  >
  listPresetsForGender: (gender?: PresetGender) => Promise<SocialPresetOption[]>
  parsePlatformCard: (zipBytes: Uint8Array) => Promise<
    | { ok: true; agentId: string }
    | { ok: false; code: string; message?: string }
  >
  getAgentAvatarDataUrl: (agentId: string) => Promise<
    | { ok: true; dataUrl: string | null }
    | { ok: false; code: string; message: string }
  >
  ensureSeeded: () => Promise<{ ok: true; seeded: number }>
  getFeed: (args?: { limit?: number }) => Promise<{
    posts: Array<{
      id: string
      authorId: string
      authorName: string
      avatarUrl: string | null
      content: string
      emotionLabel: string | null
      createdAt: string
      likes: number
      comments: Array<{
        id: string
        actorKind: string
        actorId: string
        actorName: string
        content: string
        createdAt: string
      }>
      likedByMe: boolean
    }>
    hasMore: boolean
    mode?: 'friends' | 'plaza'
  }>
  getAgentPosts: (args: { agentId: string; limit?: number }) => Promise<{ posts: unknown[] }>
  likePost: (args: { postId: string }) => Promise<{ ok: boolean; likesCount?: number; code?: string }>
  commentPost: (args: {
    postId: string
    content: string
  }) => Promise<{ ok: boolean; commentId?: string; code?: string }>
  requestFriend: (args: {
    agentId: string
  }) => Promise<{ success: boolean; status: string; message?: string }>
  listFriends: () => Promise<{
    friends: Array<{ agentId: string; agentName: string; since: string }>
    total: number
  }>
  getFriendship: (args: { agentId: string }) => Promise<{ status: string | null }>
  muteAgent: (args: { agentId: string }) => Promise<{ ok: boolean }>
  blockAgent: (args: { agentId: string }) => Promise<{ ok: boolean }>
  unmuteAgent: (args: { agentId: string }) => Promise<{ ok: boolean }>
  unblockAgent: (args: { agentId: string }) => Promise<{ ok: boolean }>
  listBlocks: () => Promise<{ blocks: unknown[] }>
  getEvents: (args?: { limit?: number }) => Promise<{ events: unknown[] }>
  getNotifications: () => Promise<{ count: number; items: unknown[] }>
  toggle: (args: { enabled: boolean }) => Promise<{ success: boolean }>
  getSocialSettings: () => Promise<{ enabled: boolean; contentMode: string; tickMs: number }>
  setSocialSettings: (patch: Record<string, unknown>) => Promise<{
    enabled: boolean
    contentMode: string
    tickMs: number
  }>
  listGroups: () => Promise<{ groups: unknown[] }>
  createGroup: (args: { name: string; agentIds: string[] }) => Promise<{ ok: boolean; group?: unknown }>
  requestJoinGroup: (args: {
    groupId: string
  }) => Promise<{ ok: boolean; status?: string }>
  leaveGroup: (args: { groupId: string }) => Promise<{ ok: boolean }>
  dissolveGroup: (args: { groupId: string }) => Promise<{ ok: boolean }>
  getGroupMessages: (args: {
    groupId: string
    limit?: number
  }) => Promise<{ messages: unknown[] }>
  sendGroupMessage: (args: {
    groupId: string
    content: string
  }) => Promise<{ ok: boolean; messageId?: string; replies?: string[] }>
  getAchievements: () => Promise<{ defs: unknown[]; unlocked: unknown[] }>
  runTickNow: () => Promise<{ ok: boolean; result?: unknown }>
  getOfflineReplay: () => Promise<{
    show: boolean
    hours: number
    narrative: string
    eventCount?: number
    postsCreated?: number
    alreadyApplied?: boolean
  }>
  ackOfflineReplay: () => Promise<{ ok: boolean }>
}

export type McBotDebugSnapshot = {
  timestamp: string
  opState: string
  decisionType: string | null
  decisionPriority: number | null
  actionSummary: string
  attackTargetId: number | string | null
  attackTargetName: string | null
  attackRemainingMs: number
  followEntityId: number | string | null
  followRange: number
  pathStatus: string
  distToPlayer: number
  stuckForMs: number
  stuckReason: string
  dimension: string
  playerInDanger: boolean
  nearestThreatToPlayer: string | null
  playerAttacking: string | null
  botHealth: number
  botInLava: boolean
  botInWater: boolean
  playerNotFound: boolean
  hasPathGoal: boolean
}

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
  /** 自主派工 (2026-10-04): work 任务已进工作台固定 Ackem 任务, 聊天只回 ack。 */
  channelDispatch?: {
    taskId: string
    turnId: string
    cwd: string
    sessionId: string
    queued: boolean
    runId: string
  }
  /** 与主进程落账一致的固定 ack 文本。 */
  assistantAck?: string
  /** L0.5 知识整理主题（触发纸面卡，不联网） */
  knowledgeTopic?: string
  /** @deprecated 同 knowledgeTopic */
  suggestedSearchQuery?: string
  /** L0.5 计划书主题（Markdown 计划纸面卡，与 OpenForU planTopic 无关） */
  planDocumentTopic?: string
  /** L0.5 显式联网搜：规则层强制 web_search，query 已提取 */
  forcedWebSearchQuery?: string
  /** L0 用户任务框（交付形态 / 合并搜索） */
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
  wavePlan?: import('../../shared/wavePlan').WavePlan
  waveContext?: Record<string, unknown>
  sessionId?: string
  desktopAgentCapability?: import('../../shared/desktopAgentCapabilities').DesktopAgentCapabilityMatch
  /** 阶段 1「判决可见」: 本轮路由判决的人话解释（账本读回，缺判决为 null）。 */
  routeExplain?: {
    found: boolean
    finalChannel?: 'chat' | 'plugin' | 'work'
    channelText?: string
    summary?: string
    layers?: Array<{ layer: string; ruleId: string; ms: number; text: string }>
  } | null
}

export type OpenForUWorkspace = {
  id: string
  name: string
  sessionId: string
  createdAt: string
  updatedAt: string
  userCreated?: boolean
}

export type OpenForUWorkspaceList = {
  workspaces: OpenForUWorkspace[]
  activeWorkspaceId: string | null
  max: number
}

export type PlanDispatchDraft = {
  artifactType?: string
  mode?: string
  summary?: string
  habits?: string[]
  scenarios?: string[]
  keywords?: string[]
  permissions?: string[]
  updatedAt?: string
}

export type PlanSummary = {
  artifactType?: string
  trigger?: string
  output?: string
  permissions?: string
  extras?: string
  rawLines: string[]
}

export type PlanSessionMeta = {
  dispatchDraft?: PlanDispatchDraft
  planSummary?: PlanSummary | null
  planConfirmed?: boolean
  planConfirmedAt?: string
  deployedUskillId?: string
  deployedAt?: string
  designSpec?: import('../../shared/planDesignSpec').PlanDesignSpec | null
  linkedExtensionId?: string
  refineMode?: boolean
  designSpecGate?: import('../../shared/planDesignSpec').DesignSpecGateResult
}

export type PlanMsg = { role: 'user' | 'assistant'; content: string }

export type OpenForUWorkspaceOpenResult = OpenForUWorkspaceList &
  PlanSessionMeta & {
    workspace: OpenForUWorkspace | null
    sessionId: string
    messages: PlanMsg[]
  }

export type OpenForUWorkspaceCreateResult = OpenForUWorkspaceOpenResult & {
  evicted: OpenForUWorkspace | null
}

export type OpenForUWorkspaceSwitchResult = OpenForUWorkspaceOpenResult

export type AckemCanonInfo = {
  name: string
  birthDate: string
  creator: {
    name: string
    github: string
    role: string
    bio: string
  }
}

export type CreatorMemoryUiEntry = {
  id: string
  category: string
  title: string
  content: string
  narrativeAt: string
}

export type CreatorMemoryUiBundle = {
  version: string
  documentVersion: string
  entryCount: number
  decayPolicy: string
  seededAt: string | null
  entries: CreatorMemoryUiEntry[]
}

export type AckemApi = {
  webSearch: {
    status: () => Promise<import('../../shared/webSearch').WebSearchStatus>
    pending: () => Promise<import('../../shared/webSearch').WebSearchSetupRequest[]>
    configure: (input: import('../../shared/webSearch').WebSearchConfiguration) => Promise<import('../../shared/webSearch').WebSearchStatus>
    cancel: (requestId: string) => Promise<{ ok: boolean }>
    onSetup: (fn: (input: import('../../shared/webSearch').WebSearchSetupRequest) => void) => () => void
  }

  getAppVersion: () => Promise<string>
  checkUpdate: () => Promise<import('../../shared/updateTypes').UpdateCheckResult>
  startUpdate: (request: import('../../shared/updateTypes').UpdateStartRequest) => Promise<{ ok: true; jobPath: string } | { ok: false; reason: string }>
  getUpdateChannelPreference: () => Promise<import('../../shared/updateTypes').UpdateChannel>
  setUpdateChannelPreference: (channel: import('../../shared/updateTypes').UpdateChannel) => Promise<import('../../shared/updateTypes').UpdateChannel>
  i18n: {
    t: (key: string, params?: Record<string, string | number>) => Promise<string>
    getLocale: () => Promise<string>
    setLocale: (locale: string) => Promise<void>
    getAllResources: () => Promise<{ zh: Record<string, string>; en: Record<string, string>; locale: string }>
  }
  getSettings: () => Promise<AppSettings>
  getCanon: () => Promise<AckemCanonInfo>
  getCreatorMemory: () => Promise<CreatorMemoryUiBundle>
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  getDataRoot: () => Promise<{ path: string; relativePath: string; mode: string; databasePath: string }>
  ensureLayout: () => Promise<{ path: string }>
  openDataFolder: () => Promise<void>
  selectChatAttachments: (kind?: 'image'|'file'|'video') => Promise<import('../../shared/chatAttachments').ChatAttachment[]>
  captureChatAttachments: (entries:Array<{path?:string;name?:string;bytes?:ArrayBuffer}>) => Promise<import('../../shared/chatAttachments').ChatAttachment[]>
  selectChatImages: () => Promise<import('../../shared/chatImages').ChatImage[]>
  selectFiles: () => Promise<{ paths: string[] }>
  defaultCwd: () => Promise<string>
  revealPath: (path: string) => Promise<{ ok: boolean; path?: string }>
  previewChatFile: (path: string) => Promise<import('../../main/chat/filePreview').FilePreviewResult>
  getBootSteps: () => Promise<{ steps: Array<{ label: string; done: boolean }>; allReady: boolean }>
  onBootStep: (fn: (payload: { steps: Array<{ label: string; done: boolean }>; allReady: boolean }) => void) => () => void
  selectFolder: () => Promise<{ path: string }>
  getPathForFile: (file: File) => string
  importFiles: (paths: string[]) => Promise<{ copied: string[]; errors: string[] }>
  promoteImport: (rel: string) => Promise<{ ok: boolean; to?: string; error?: string }>
  importParseDocuments: (args: {
    relPaths: string[]
    consentAck: boolean
    consentVersion: number
    ownerAgentId?: string
  }) => Promise<import('../../shared/documentImport').ImportParseResult>
  importGetJob: (jobId: string) => Promise<import('../../shared/documentImport').ImportJob | null>
  importCommitJob: (args: {
    jobId: string
    disabledDraftIds?: string[]
    ownerAgentId?: string
  }) => Promise<import('../../shared/documentImport').ImportCommitResult>
  rebuildIndex: () => Promise<{ chunks: number; builtAt: string }>
  search: (q: string, limit?: number) => Promise<
    Array<{ score: number; id: string; relPath: string; preview: string; mtimeMs: number }>
  >
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
  }) => Promise<BuildContextResult>
  workbenchFollow: (args: {
    chatSessionId?: string
    text: string
  }) => Promise<{ ok: boolean; reason?: string }>
  codePart: {
    ensure: () => Promise<{ ok: boolean; reason?: string }>
  }
  tasks: {
    runQueuedNow: (taskId:string)=>Promise<{ok:boolean}>
    submit(request: import('../../shared/tasks').TaskSubmitRequest): Promise<import('../../shared/tasks').TaskSubmitResult>
    cancel(requestId:string): Promise<import('../../shared/tasks').TaskSubmitResult>
    stop(taskId: string): Promise<import('../../shared/tasks').TaskSnapshot>
    remove(taskId: string): Promise<{ok:boolean;missing?:boolean}>
    clearManaged(projectionIds?:string[]):Promise<{ok:true;taskIds:string[];staleTaskIds?:string[]}>
    list(): Promise<import('../../shared/tasks').TaskSnapshot[]>
    snapshot(taskId: string): Promise<import('../../shared/tasks').TaskSnapshot | null>
    grantGoal(input:import('../../shared/longTerm').GoalGrantInput):Promise<import('../../shared/longTerm').Goal>
    revokeGoal(id:string):Promise<void>
    changeGoalState(input:{id:string;state:'paused'|'active'|'cancelled'|'abandoned'}):Promise<import('../../shared/longTerm').Goal>
    goals():Promise<import('../../shared/longTerm').Goal[]>
    decisions(id:string):Promise<import('../../shared/longTerm').DecisionRecord[]>
    correctDecision(input:{id:string;basis:string}):Promise<import('../../shared/longTerm').DecisionRecord>
    grantRule(input:import('../../shared/longTerm').RuleGrantInput):Promise<import('../../shared/longTerm').StandingRule>
    revokeRule(id:string):Promise<void>
    rules():Promise<import('../../shared/longTerm').StandingRule[]>
    worldState(ids:string[]):Promise<{tasks:import('../../shared/tasks').TaskSnapshot[];observations:import('../../shared/longTerm').Observation[]}>
    onEvent(callback: (event: import('../../shared/tasks').TaskEvent) => void): () => void
  }
  workbench: {
    environment: () => Promise<{kernelHealth:'connected'|'disconnected'|'unknown'}>
    openDefaultDirectory: () => Promise<{ok:boolean}>
    modelInfo: (sessionId?: string) => Promise<{ model: string; effort: import('./store/workbenchStore').EffortLevel; effortLevels: import('./store/workbenchStore').EffortLevel[] }>
    supervisionList: () => Promise<import('../../shared/workSupervision').SupervisedTask[]>
    supervisionAnswer: (input:{taskId:string;requestId:string;answers:Record<string,string>}) => Promise<{ok:boolean}>
    supervisionApproval: (input:{taskId:string;requestId:string;allow:boolean}) => Promise<{ok:boolean}>
    supervisionControl: (input:{sessionId:string;resume?:boolean}) => Promise<{ok:boolean}>
    onTaskApproval: (fn:(approval:import('../../shared/workSupervision').TaskApproval)=>void) => (()=>void)
    loadCatalog: () => Promise<unknown>
    saveCatalog: (catalog: unknown) => Promise<{ ok: boolean }>
    open: (input: { cwd?: string; sessionId?: string }) => Promise<{ cwd: string; sessionId: string; mode?: string;permissionMode?:string;policyRevision?:number; hostTurnReceipt?: { state: string } }>
    snapshot: (sessionId: string) => Promise<{ missing?:boolean;executionQuiescent?:boolean;hostTask?:unknown; supervisionState?: import('../../shared/workSupervision').SupervisedTask['state']; sessionId: string; mode?: string;permissionMode?:string;policyRevision?:number;standaloneReceipt?:{requestId:string;state:string}; hostTurnReceipt?: { hostRunId: string; state: string }; history?: Array<{ role?: string; content?: unknown }> }>
    queue: (sessionId: string) => Promise<{ items: Array<{ id: string; text: string }> }>
    removeQueued: (input: { sessionId: string; itemId: string }) => Promise<{ ok: boolean }>
    send: (input: import('../../shared/tasks').StandaloneWorkInput) => Promise<{requestId:string;sessionId?:string;cancelled?:boolean;queued?:boolean}>
    inputQueue: (taskId:string)=>Promise<{items:Array<{id:string;text:string}>}>
    promoteInput: (requestId:string)=>Promise<{ok:boolean}>
    cancelTaskQueue: (taskId:string)=>Promise<{ok:boolean}>
    cancelInput: (requestId:string)=>Promise<{ok:boolean}>
    enqueue: (input: { sessionId: string; text: string }) => Promise<{ ok: boolean; queued: boolean; id?: string; queueLength?: number }>
    permission: (input: { sessionId: string; requestId: string; decision: 'allow' | 'deny'; toolName?: string }) => Promise<{ ok: boolean }>
    planDecision: (input: { sessionId: string; requestId: string; decision: 'approve' | 'reject' }) => Promise<{ ok: boolean }>
    answer: (input: { sessionId: string; requestId: string; answers: Record<string, string>; cancelled?: boolean }) => Promise<{ ok: boolean }>
    abort: (sessionId: string) => Promise<unknown>
    mode: (input: { sessionId: string; mode: 'default' | 'acceptEdits' | 'bypassPermissions';mutationId?:string;expectedPolicyRevision?:number }) => Promise<{ ok: boolean; mode: string;permissionMode?:string;policyRevision?:number;mutationId?:string }>
    readFile: (input: { cwd: string; path: string }) => Promise<string>
    createFile: (input: { cwd: string; name: string }) => Promise<string>
    terminal: (input: { cwd: string; command: string }) => Promise<{ stdout: string; stderr: string }>
    cliLaunch: (input: import('../../shared/terminal').CliLaunchInput) => Promise<import('../../shared/terminal').ExternalCliSnapshot>
    cliOpen: (input: import('../../shared/terminal').CliOpenInput) => Promise<import('../../shared/terminal').CliTerminalSnapshot>
    cliInput: (input: {terminalId:string;data:string}) => Promise<void>
    cliResize: (input: {terminalId:string;cols:number;rows:number}) => Promise<void>
    cliClose: (terminalId:string) => Promise<{ok:boolean}>
    cliCloseTask: (taskId:string) => Promise<{ok:boolean}>
    onCliData: (callback:(event:import('../../shared/terminal').CliTerminalEvent)=>void) => ()=>void
    /** 持续终端: 同 cwd 复用常驻 PowerShell, cd/环境变量跨命令保留。 */
    terminalExec: (input: { cwd: string; command: string }) => Promise<{ output: string }>
    terminalDispose: (cwd: string) => Promise<{ ok: boolean }>
    /** 内核文件历史快照 (准确单轮变更的权威来源)。 */
    fileHistory: (sessionId: string) => Promise<{ snapshots: unknown; latestMessageId: string | null }>
    /** 回滚 (dryRun=true 时只返回将回滚的文件清单, 不动磁盘)。 */
    rewind: (input: { sessionId: string; messageId?: string; dryRun: boolean }) => Promise<{ ok: boolean; filesChanged?: string[]; messageId?: string }>
    /** 编辑上一轮并重跑: 内核先回滚该轮文件再以新文本重跑 (SSE 事件走 onEvent)。 */
    rerunLast: (input: { taskId: string; turnId: string; sessionId: string; text: string; cwd: string; attachments?: Array<{kind: 'doc'|'folder'|'image'|'video';path:string;name:string}> }) => Promise<{ runId: string }>
    onEvent: (cb: (payload: { taskId: string; turnId: string; event: unknown; goalRevision?:number; controlEpoch?:number }) => void) => () => void
  }
  readRel: (rel: string, maxBytes?: number) => Promise<{ ok: boolean; text?: string; error?: string }>
  writeAllowed: (
    rel: string,
    content: string,
    mode: 'append' | 'overwrite'
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  stopChat: () => Promise<{ stopped: boolean }>
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
    wavePlan?: import('../../shared/wavePlan').WavePlan
    waveContext?: Record<string, unknown>
    sessionId?: string
    targetAgentId?: string
    interactionSurface?: string
    desktopAgentChatMode?: boolean
    desktopAgentCapability?: import('../../shared/desktopAgentCapabilities').DesktopAgentCapabilityMatch
  }) => Promise<void>
  onChatWaveStart: (fn: (payload: { waveIndex: number; waveCount: number; newBubble: boolean }) => void) => void
  onChatWaveEnd: (fn: (payload: { waveIndex: number; text: string; partial?: boolean }) => void) => void
  probeLocalChat: (patch?: Partial<AppSettings>) => Promise<{
    ok: boolean
    latencyMs?: number
    model?: string
    error?: string
  }>
  onChatReplace: (fn: (text: string) => void) => void
  onChatStatus: (fn: (text: string) => void) => void
  onInvestigationProgress: (
    fn: (payload: import('../shared/investigation').InvestigationProgressPayload | null) => void
  ) => void
  onTaskPlanProgress: (
    fn: (payload: import('../../shared/desktopAgentTaskPlan').TaskPlanProgressPayload | null) => void
  ) => void
  onDesktopAgentAgentBusy: (fn: (payload: { sessionId: string; busy: boolean }) => void) => void
  onDesktopAgentJobState: (
    fn: (payload: import('../../shared/desktopAgentDock').DesktopAgentJobStatePayload) => void
  ) => void
  onDesktopAgentJobStatus: (fn: (payload: { sessionId: string; label: string }) => void) => void
  onDesktopAgentTaskDelivery: (
    fn: (payload: import('../../shared/desktopAgentDock').DesktopAgentTaskDeliveryPayload) => void
  ) => void
  onDesktopAgentTaskDeliveryQueued: (
    fn: (payload: import('../../shared/desktopAgentDock').DesktopAgentTaskDeliveryPayload) => void
  ) => void
  onExtensionTrigger: (fn: (payload: {
    extensionId: string
    extensionName: string
    kind: 'skill' | 'plugin' | 'gamemode'
  }) => void) => void
  onChatSearchCard: (fn: (payload: SearchCardPayload) => void) => void
  onChatMemoryAudit: (fn: (payload: MemoryAuditCardPayload) => void) => void
  onDispatchProactive: (fn: (payload: { extensionId: string; message: string }) => void) => void
  getState: (opts?: { targetAgentId?: string }) => Promise<unknown>
  resetState: () => Promise<unknown>
  traceLatest: (n?: number) => Promise<unknown>
  memoryList: (opts?: { ownerAgentId?: string }) => Promise<unknown[]>
  memoryAuditReport: (opts?: {
    mode?: 'curated_audit' | 'self_report' | 'stats_only' | 'full_dump'
    includeAvoid?: boolean
    page?: number
  }) => Promise<{ report: unknown; card: MemoryAuditCardPayload }>
  memoryWhyStored: (factId: string) => Promise<unknown>
  memoryActionTimeline: (
    sessionId: string,
    limit?: number
  ) => Promise<Array<{ eventId: string; eventType: string; status: string | null; observedAt: string; turnId: string | null }>>
  memoryAuditMetrics: () => Promise<{
    jobBacklog: number
    deadJobs: number
    projectionRepairCount: number
    governanceDeleteCount: number
    recallP95Ms?: number
    transactionP95Ms?: number
    reconcileCount: number
  }>
  memoryPermanentDeletePreview: (preview: {
    targetKind: 'fact' | 'episode'
    targetId: string
    scope: 'memory_only' | 'memory_and_source'
    summary: string
  }) => Promise<{
    ok: boolean
    error?: string
    verifiedSummary?: string
    impactHint?: string
    tombstoneExists?: boolean
  }>
  memoryPermanentDelete: (
    preview: {
      targetKind: 'fact' | 'episode'
      targetId: string
      scope: 'memory_only' | 'memory_and_source'
      summary: string
    },
    turnId?: string | null,
    confirmed?: boolean
  ) => Promise<{
    ok: boolean
    errorCode?: string
    impactHint?: string
    invalidated: { facts: number; episodes: number; embeddings: number; associations: number }
  }>
  memoryLegacyBackfill: (opts?: { apply?: boolean; batchSize?: number; maxRounds?: number }) => Promise<{
    dryRunReport: {
      legacyFactCount: number
      skippedWithModernEvidence: number
      skippedAlreadyLegacyTagged: number
      potentialConflicts: Array<{ subject: string; factIds: string[] }>
      timeAmbiguity: Array<{ factId: string; createdAt: string; note: string }>
    }
    applied: { remaining: number } | null
  }>
  memoryControl: (
    command: import('../../main/memory/contracts').MemoryControlCommand
  ) => Promise<import('../../main/memory/contracts').MemoryControlResult>
  memoryResolveControl: (
    text: string,
    candidateTargets: import('../../main/memory/contracts').MemoryTarget[]
  ) => Promise<unknown>
  memoryUpdate: (
    id: string,
    patch: { summary?: string; weight?: number; confidence?: number; triggers?: string[] }
  ) => Promise<boolean>
  memoryRetire: (id: string) => Promise<boolean>
  memoryFeedback: (id: string, action: 'thumbs_up' | 'thumbs_down') => Promise<boolean>
  memoryClearAll: () => Promise<{ ok: boolean; error?: string }>
  memoryClearOwner: (opts?: { ownerAgentId?: string }) =>
    Promise<{ ok: boolean; error?: string }>
  appReload: () => Promise<{ ok: boolean }>
  uninstallInfo: () => Promise<{
    mode: 'dev' | 'portable' | 'installed'
    installDir: string
    dataRoot: string
    batPath: string | null
    nsisUninstaller: string | null
  }>
  uninstallAckem: (opts?: { deleteData?: boolean; removeApp?: boolean }) => Promise<{ ok: boolean }>
  embeddingStatus: () => Promise<{
    activeModel: string
    providerReady: boolean
    providerName: string
    providerDimension: number
    models: Array<{ id: string; extracted: boolean; active: boolean; bundled?: boolean; zipPresent?: boolean }>
    state: { activeModel: string; version: string; activatedAt: string; dimension: number; provider: string }
    bundledReady?: string[]
    bundledMissing?: string[]
    bundledZipPresent?: string[]
    readiness?: {
      phase: string
      progress: number
      providerReady: boolean
      factEmbeddingsReady: boolean
      preLlmWarmReady: boolean
      error?: string
    }
    chatReady?: boolean
  }>
  embeddingReadiness: () => Promise<{
    phase: 'idle' | 'loading_provider' | 'syncing_facts' | 'warming_prellm' | 'ready' | 'degraded'
    progress: number
    providerReady: boolean
    factEmbeddingsReady: boolean
    preLlmWarmReady: boolean
    error?: string
  }>
  onEmbeddingReadinessChanged: (fn: (snap: {
    phase: string
    progress: number
    providerReady: boolean
    factEmbeddingsReady: boolean
    preLlmWarmReady: boolean
    error?: string
  }) => void) => () => void
  embeddingSwitch: (modelId: string) => Promise<{ ok: boolean; modelId?: string; error?: string }>
  embeddingDownload: (modelId: string) => Promise<{ ok: boolean; error?: string }>
  embeddingDownloadCancel: (modelId: string) => Promise<{ ok: boolean }>
  policyDecisionLogRecent: (limit?: number) => Promise<{
    logs: unknown[]
    summary: { total: number; byLevel: Record<string, number>; topReason: string | null }
    embeddingRoutingPlanned: boolean
  }>
  onEmbeddingDownloadProgress: (fn: (p: { modelId: string; bytes: number; total: number; speed: number }) => void) => void
  personalityList: (gender?: PresetGender) => Promise<
    Array<{ id: string; label: string; gender: PresetGender; requiresAdult18?: boolean }>
  >
  personalitySet: (id: string) => Promise<AppSettings>
  profileEstimateScan: (relPaths: string[]) => Promise<{
    charCount: number
    fileCount: number
    tokenMin: number
    tokenMax: number
    isLocal: boolean
    consentVersion: number
  }>
  profileGet: () => Promise<{
    mode: 'manual' | 'inferred'
    userSixDimensions: UserSixDimensions | null
    companionSuggestion: CompanionSuggestion | null
  }>
  profileInferFromFiles: (args: {
    relPaths: string[]
    consentAck: boolean
    consentVersion: number
  }) => Promise<
    | { ok: true; userSixDimensions: UserSixDimensions; companionSuggestion: CompanionSuggestion }
    | { ok: false; error: string }
  >
  profileApplyCompanionSuggestion: () => Promise<
    { ok: true; personality: { presetId: string; T: number; I: number; S: number; O: number; R: number } }
    | { ok: false; error: string }
  >
  memoryConsolidate: () => Promise<{ added: number }>
  associationList: (opts?: { ownerAgentId?: string }) => Promise<Array<{
    id: string; fact_id_a: string; fact_id_b: string
    association_type: string; strength: number
    created_at: string; last_activated_at: string | null
  }>>
  anchorList: () => Promise<Array<{
    id: string; anchor_date: string; anchor_type: string
    recurrence_rule: string | null; linked_fact_ids: string
    emotional_valence: number | null; emotional_intensity: number | null
    domain: string | null; summary: string | null
    created_at: string; last_triggered_at: string | null
  }>>
  memoryStats: (opts?: { ownerAgentId?: string }) => Promise<{
    totalFacts: number; activeFacts: number; retiredFacts: number; coreFacts: number
    totalTriples: number; totalAssociations: number; totalEpisodes: number; totalAnchors: number
    byDomain: Array<{ domain: string; c: number }>
    bySubcategory: Array<{ subcategory: string; c: number }>
  } | null>
  onMemoryUpdated: (fn: (payload: { sessionId: string; turnIndex: number; newFactCount: number }) => void) => () => void
  kgList: (opts?: { ownerAgentId?: string }) => Promise<Array<{
    id: string; subject: string; predicate: string; object: string
    confidence: number; sourceFactIds: string[]; createdAt: string
  }>>
  kgOneHop: (entity: string) => Promise<Array<{
    id: string; subject: string; predicate: string; object: string
    confidence: number; sourceFactIds: string[]; createdAt: string
  }>>
  episodeList: (opts?: { ownerAgentId?: string }) => Promise<Array<{
    id: string; summary: string; emotionalIntensity: number
    dominantEmotion: string; keywords: string[]
    prevEpisodeId: string | null; sourceSessionId: string
    startTurn: number; endTurn: number; createdAt: string
  }>>
  desireList: () => Promise<{ slots: (null | { id: string; topic: string; category: string; urgency: number; status: string; sourceTurn: number })[] }>
  desireDismiss: (desireId: string) => Promise<{ slots: (null | { id: string; topic: string; category: string; urgency: number; status: string; sourceTurn: number })[] }>
  desireClearActive: () => Promise<{ slots: (null | { id: string; topic: string; category: string; urgency: number; status: string; sourceTurn: number })[] }>
  mirrorCheck: () => Promise<{
    contradictions: Array<{ old: { text: string; valence: number }; new: { text: string; valence: number }; topic: string; description: string }>
    findings: { version: 1; mirror: unknown[]; factFlags: unknown[] }
  }>
  mirrorFindings: () => Promise<{ version: 1; mirror: unknown[]; factFlags: unknown[] }>
  diaryGenerate: (opts?: { date?: string; force?: boolean }) => Promise<{ ok: boolean; path?: string; reason?: string }>
  diaryList: () => Promise<{ entries: Array<{ date: string; path: string; size: number; type: string; tier?: string; gapHours?: number }>; pendingSnapshots: string[] }>
  diaryRead: (date: string) => Promise<{ ok: boolean; date: string; content: string } | { ok: false; error: string }>
  mediaStatus: () => Promise<{ title: string; artist: string; album: string; isPlaying: boolean; formatted: string }>
  thoughtGenerate: () => Promise<{ thoughts: Array<{ id: string; content: string; createdAt: string; delivered: boolean }> }>
  ext: {
    gamemode: {
      list: () => Promise<unknown[]>
      activate: (gameId: string, config: unknown) => Promise<{ ok: boolean }>
      deactivate: () => Promise<{ ok: boolean }>
      status: () => Promise<{ gameId: string | null; status: unknown }>
      invoke: (gameId: string, method: string, params?: Record<string, unknown>) => Promise<{ ok: boolean; data?: unknown; error?: string }>
      minecraft: {
        react: (event: { type: string; raw: string; timestamp: string; payload?: Record<string, unknown> }) => Promise<{ text: string; isEasterEgg: boolean; emotionGroup: string }>
        parseLog: (line: string) => Promise<{ type: string; raw: string; timestamp: string; payload?: Record<string, unknown> } | null>
        getWsStatus: () => Promise<{ running: boolean; wsPort: number; wsClients: number; logPath?: string }>
        syncEngineState: () => Promise<{ ok: boolean }>
        botStart: (cfg: { host: string; port?: number; username: string; password?: string }) => Promise<{ ok: boolean }>
        botStop: () => Promise<{ ok: boolean }>
        botStatus: () => Promise<{ connected: boolean; username?: string; health?: number; hunger?: number; position?: { x: number; y: number; z: number }; dimension?: string; wsConnected?: boolean }>
        botDebug: () => Promise<McBotDebugSnapshot | null>
        logStart: (logPath: string) => Promise<{ ok: boolean; path: string }>
        logStop: () => Promise<{ ok: boolean }>
        logStatus: () => Promise<{ active: boolean }>
      }
      onEvent: (gameId: string, fn: (payload: { gameId: string; event: unknown; reaction: unknown }) => void) => void
    }
    plugins: {
      list: (type?: string) => Promise<unknown[]>
      activate: (id: string) => Promise<{ ok: boolean; error?: string }>
      deactivate: (id: string) => Promise<{ ok: boolean; error?: string }>
    }
    skills: {
      list: () => Promise<unknown[]>
      activate: (id: string) => Promise<{ ok: boolean }>
      deactivate: (id: string) => Promise<{ ok: boolean }>
    }
  }
  openforu: {
    workspaces: {
      list: () => Promise<
        { ok: true } & OpenForUWorkspaceList & { error?: never } | { ok: false; error: string }
      >
      open: () => Promise<
        | ({ ok: true } & OpenForUWorkspaceOpenResult)
        | ({ ok: false; error: string } & Partial<OpenForUWorkspaceOpenResult>)
      >
      create: (name?: string) => Promise<
        | ({ ok: true } & OpenForUWorkspaceCreateResult)
        | ({ ok: false; error: string; workspace: null; evicted: null })
      >
      switch: (workspaceId: string) => Promise<
        | ({ ok: true } & OpenForUWorkspaceSwitchResult)
        | ({ ok: false; error: string; workspace: null; sessionId: string; messages: [] })
      >
      delete: (workspaceId: string) => Promise<
        | ({ ok: true; activeWorkspaceId: string | null } & OpenForUWorkspaceList)
        | ({ ok: false; error: string })
      >
    }
    planStart: () => Promise<{
      ok: boolean
      sessionId: string
      messages: PlanMsg[]
      error?: string
    }>
    planSend: (
      sessionId: string,
      text: string
    ) => Promise<
      {
        ok: boolean
        messages: PlanMsg[]
        workspaces?: OpenForUWorkspace[]
        error?: string
      } & Partial<PlanSessionMeta>
    >
    planConfirm: (
      sessionId: string
    ) => Promise<
      {
        ok: boolean
        messages?: PlanMsg[]
        workspaces?: OpenForUWorkspace[]
        error?: string
      } & Partial<PlanSessionMeta>
    >
    planApproveWireframe: (
      sessionId: string
    ) => Promise<
      {
        ok: boolean
        messages?: PlanMsg[]
        workspaces?: OpenForUWorkspace[]
        error?: string
      } & Partial<PlanSessionMeta>
    >
    planDeploy: (
      sessionId: string
    ) => Promise<
      {
        ok: boolean
        uskillId?: string
        messages?: PlanMsg[]
        workspaces?: OpenForUWorkspace[]
        error?: string
      } & Partial<PlanSessionMeta>
    >
    planRedeploy: (
      sessionId: string,
      userText?: string
    ) => Promise<
      {
        ok: boolean
        uskillId?: string
        messages?: PlanMsg[]
        workspaces?: OpenForUWorkspace[]
        error?: string
      } & Partial<PlanSessionMeta>
    >
    planRefineOpen: (
      extensionId: string,
      opts?: { instruction?: string; displayName?: string }
    ) => Promise<
      | ({
          ok: true
          sessionId: string
          messages: PlanMsg[]
          workspace: OpenForUWorkspace | null
          composerPrefill?: string
          workspaces: OpenForUWorkspace[]
          activeWorkspaceId: string | null
          max: number
        } & Partial<PlanSessionMeta>)
      | {
          ok: false
          error: string
          sessionId: string
          messages: []
          workspace: null
        }
    >
    onPlanSessionUpdated: (fn: (payload: Record<string, unknown>) => void) => () => void
    planStatus: (
      sessionId: string
    ) => Promise<{ ok: boolean; messages?: PlanMsg[] } & Partial<PlanSessionMeta>>
    listArtifacts: () => Promise<{ paths: string[] }>
    previewArtifact: (sessionId: string) => Promise<{
      ok: boolean
      extensionId?: string
      uskillId?: string
      artifactKind?: 'uskill' | 'uplugin'
      dirRel?: string
      files?: Record<string, string>
      source?: 'preview' | 'staging'
      error?: string
    }>
    readArtifact: (extensionId: string) => Promise<{
      ok: boolean
      extensionId?: string
      uskillId?: string
      artifactKind?: 'uskill' | 'uplugin'
      dirRel?: string
      files?: Record<string, string>
      source?: 'deployed'
      error?: string
    }>
    listExtensions: () => Promise<{
      uskills: OpenForUExtensionRow[]
      uplugins: OpenForUExtensionRow[]
    }>
    openSurfaceWindow: (extensionId: string) => Promise<{ ok: boolean; message: string }>
    removeExtension: (kind: 'uskill' | 'uplugin', id: string) => Promise<{ ok: boolean; error?: string }>
    permissions: {
      onRequest: (fn: (payload: PermissionRequestPayload) => void) => () => void
      approve: (requestId: string) => Promise<{ ok: boolean }>
      deny: (requestId: string) => Promise<{ ok: boolean }>
      approveAndActivate: (pluginId: string) => Promise<{ ok: boolean; error?: string }>
    }
    onNotify: (fn: (payload: { text: string }) => void) => () => void
    agent: {
      getStatus: (
        sessionId: string
      ) => Promise<
        | { ok: true; run: AgentRunMeta | null; error?: never }
        | { ok: false; error: string; run?: never }
      >
      cancel: (
        sessionId: string
      ) => Promise<
        | {
            ok: true
            cancelled: boolean
            agentRun?: AgentRunMeta | null
            messages?: PlanMsg[]
            workspaces?: OpenForUWorkspace[]
            error?: never
          } & Partial<PlanSessionMeta>
        | { ok: false; error: string; cancelled?: never }
      >
      onEvent: (fn: (payload: AgentEvent) => void) => () => void
    }
    refine: {
      preview: (
        extensionId: string,
        instruction: string
      ) => Promise<{
        ok: boolean
        preview?: {
          ok: boolean
          extensionId: string
          diffPreview: string
          summary: string
          error?: string
        }
        error?: string
      }>
      apply: (
        extensionId: string,
        instruction: string
      ) => Promise<{
        ok: boolean
        result?: {
          ok: boolean
          extensionId: string
          newExtensionId?: string
          message: string
          diffPreview?: string
        }
        error?: string
      }>
      history: (
        extensionId: string
      ) => Promise<{
        ok: boolean
        entries: Array<{
          version: string
          savedAt: string
          instruction?: string
          summary?: string
        }>
        error?: string
      }>
      rollback: (
        extensionId: string,
        targetVersion: string,
        kind?: 'uskill' | 'uplugin'
      ) => Promise<{ ok: boolean; error?: string }>
    }
  }
  desktopAgent: {
    sessionMode: {
      get: (sessionId?: string) => Promise<{ enabled: boolean; settingsReady: boolean }>
      set: (
        sessionId: string,
        enabled: boolean
      ) => Promise<{ ok: boolean; enabled?: boolean; error?: string }>
    }
    opening: () => Promise<{ ok: true; text: string } | { ok: false; error: string }>
    confirm: {
      onRequest: (fn: (payload: import('../../shared/desktopAgent').DesktopAgentConfirmRequest) => void) => () => void
      allow: (requestId: string) => Promise<boolean>
      allowSession: (requestId: string) => Promise<boolean>
      allowTaskDeletes: (requestId: string, taskPlanId: string) => Promise<boolean>
      deny: (requestId: string) => Promise<boolean>
    }
    auditRecent: (limit?: number) => Promise<unknown[]>
  }
  machineMap: {
    status: () => Promise<import('../../shared/machineMap').MachineMapStatus>
    reindex: () => Promise<{ ok: boolean }>
    onProgress: (
      fn: (payload: import('../../shared/machineMap').MachineMapProgressPayload | null) => void
    ) => void
  }
  /** 当前应使用的伴侣交互形象绑定（skin 插件可覆盖内置 Canvas） */
  companionSkinActive: () => Promise<CompanionSkinBinding>
  companionSkinList: () => Promise<CompanionSkinBinding[]>
  companionSkinSetActive: (pluginId: string | null) => Promise<{ ok: boolean }>
  onCompanionSkinChanged: (fn: () => void) => void
  /** @deprecated 使用 ext.gamemode.minecraft */
  mcReact: (event: { type: string; raw: string; timestamp: string; payload?: Record<string, unknown> }) => Promise<{ text: string; isEasterEgg: boolean; emotionGroup: string }>
  mcParseLog: (line: string) => Promise<{ type: string; raw: string; timestamp: string; payload?: Record<string, unknown> } | null>
  mcStatus: () => Promise<{ running: boolean; wsPort: number; wsClients: number; logPath?: string }>
  mcSetEngineState: () => Promise<{ ok: boolean }>
  mcBotStart: (cfg: { host: string; port?: number; username: string; password?: string }) => Promise<{ ok: boolean }>
  mcBotStop: () => Promise<{ ok: boolean }>
  mcBotStatus: () => Promise<{ connected: boolean; username?: string; health?: number; hunger?: number; position?: { x: number; y: number; z: number }; dimension?: string; wsConnected?: boolean }>
  mcBotDebug: () => Promise<McBotDebugSnapshot | null>
  mcLogStart: (logPath: string) => Promise<{ ok: boolean; path: string }>
  mcLogStop: () => Promise<{ ok: boolean }>
  mcLogStatus: () => Promise<{ active: boolean }>
  sessionList: () => Promise<Array<{ id: string; name: string; createdAt: string; lastActive: string }>>
  sessionCreate: (name: string) => Promise<{ id: string; sessions: Array<{ id: string; name: string; createdAt: string; lastActive: string }> }>
  sessionSwitch: (sessionId: string) => Promise<{ ok: boolean; sessionId?: string; settings?: AppSettings; error?: string }>
  sessionDelete: (sessionId: string) => Promise<{ ok: boolean; sessions?: Array<{ id: string; name: string; createdAt: string; lastActive: string }>; error?: string }>
  archiveList: (opts?: { ownerAgentId?: string }) => Promise<{ files: Array<{ path: string; name: string; isDir: boolean; size: number }>; domains: string[]; lastExportAt: string | null }>
  archiveRead: (relPath: string, opts?: { ownerAgentId?: string }) => Promise<{ ok: boolean; text?: string; error?: string }>
  archiveExport: (opts?: { ownerAgentId?: string }) => Promise<{ filesWritten: number; factsExported: number; episodesExported: number; coreCount: number }>
  loadChatHistory: (opts?: { targetAgentId?: string }) => Promise<unknown[]>
  saveChatHistory: (rows: unknown[], opts?: { targetAgentId?: string }) => Promise<void>
  social: SocialApi
  // 桌面陪伴
  companionTimeContext: () => Promise<{ timeOfDay: string; hour: number; minute: number; weekday: number; isWeekend: boolean; greeting: string; atmosphereHint: string; topicHints: string[] }>
  companionPresence: () => Promise<{ mode: 'active' | 'quiet' | 'sleeping'; lastInteractionMs: number; idleDurationMs: number; timeOfDay: string }>
  companionTouch: () => Promise<{ ok: boolean }>
  companionStatusText: () => Promise<string>
  companionGetConfig: () => Promise<{ idleThresholdMs: number; cooldownMs: number; nightSuppression: boolean; quietMode: boolean }>
  companionSetConfig: (patch: Record<string, unknown>) => Promise<{ ok: boolean }>
  onCompanionProactive: (fn: (payload: { message: string; timeContext: unknown }) => void) => void
  onDiaryAutoGenerated: (fn: (payload: { date: string; type: string }) => void) => void
  onChatChunk: (fn: (s: string) => void) => void
  onChatReasoning: (fn: (s: string) => void) => void
  touchChatActivity?: () => Promise<unknown>
  onTaskReplyProgress?: (fn: (event: { sessionId: string; runId: string; text: string; at: number }) => void) => () => void
  onReplyEvent?: (fn: (event: import('../../shared/response').ReplyEvent) => void) => () => void
  onChatDelivery?: (fn: (event: { sessionId: string; row: unknown }) => void) => () => void
  onChatStreamStart: (fn: () => void) => void
  onChatDone: (
    fn: (meta?: {
      memoryWrites?: string[]
      assistantText?: string
      turnId?: string
      sessionId?: string
      stateDelta?: { turnId?: string; bubbles: Array<{ key: string; label: string; delta: number; reason: string }> }
    }) => void
  ) => void
  onChatError: (fn: (err: string) => void) => void
  onMcEvent: (fn: (payload: { event: unknown; reaction: unknown }) => void) => void
  onMcBotDebug: (fn: (snapshot: McBotDebugSnapshot) => void) => void
  onWindowFocused: (fn: () => void) => void
  ui: {
    getTheme: () => Promise<'light' | 'dark'>
    setTheme: (mode: 'light' | 'dark') => Promise<{ ok: boolean; mode: 'light' | 'dark' }>
    onThemeChanged: (fn: (mode: 'light' | 'dark') => void) => void
    getLevel: () => Promise<{ level: number; petVisible: boolean }>
    showPet: () => Promise<{ ok: boolean; level: number }>
    hidePet: () => Promise<{ ok: boolean }>
    expandToMain: (opts?: { tab?: string }) => Promise<{ ok: boolean; level: number }>
    setAlwaysOnTop: (v: boolean) => Promise<{ ok: boolean }>
    setLevel: (level: 0 | 1 | 2 | 3) => Promise<{ ok: boolean; level: number }>
    onChatBubble: (fn: (payload: { text: string; role?: string; emotionLabel?: string }) => void) => void
    onLevel: (fn: (payload: { level: number }) => void) => void
    onExpand: (fn: (payload: { tab?: string }) => void) => void
    onExtensionToast?: (fn: (payload: { text: string; extensionId?: string }) => void) => void
  }
  voice: {
    sendAudioChunk: (buffer: ArrayBuffer) => Promise<{ ok: boolean }>
    cancelTts: () => Promise<{ ok: boolean }>
    setMode: (mode: string) => Promise<{ ok: boolean }>
    setInputChannel: (channel: string) => Promise<{ ok: boolean }>
    applySettings: (patch: Record<string, unknown>) => Promise<{ ok: boolean }>
    restartService: () => Promise<{ ok: boolean }>
    setPttActive: (active: boolean) => Promise<{ ok: boolean }>
    freshUtterance: () => Promise<{ ok: boolean }>
    checkEnvironment: () => Promise<VoiceEnvReport>
    installEnvironment: () => Promise<{ ok: boolean; error?: string }>
    setTheaterSession: (active: boolean) => Promise<{ ok: boolean }>
    health: () => Promise<{
      asr_ready: boolean
      tts_ready: boolean
      tts_engine: string
      tts_model_loaded: boolean
      gpu_available: boolean
      gpu_name: string
      port: number
      asr_engine?: 'sherpa-onnx' | 'python'
      workerStatus?: string
      piper_voices?: Array<{ id: string; label: string; language: string }>
      gpt_sovits_voices?: Array<{ id: string; label: string; language: string }>
    } | null>
    onTtsAudio: (fn: (audio: ArrayBuffer) => void) => () => void
    onTtsSpeakText: (fn: (payload: { text: string }) => void) => () => void
    onTtsSpeakCancel: (fn: () => void) => () => void
    onTranscript: (fn: (result: {
      text: string
      confidence: number
      sessionId?: number
      sequence?: number
    }) => void) => () => void
    onTranscriptPartial: (fn: (result: {
      text: string
      sessionId: number
      sequence: number
      stable: boolean
    }) => void) => () => void
    onAsrError: (fn: (result: { message: string }) => void) => () => void
    onStateChange: (fn: (state: string) => void) => () => void
    onListening: (fn: (active: boolean) => void) => () => void
    onThinking: (fn: (active: boolean) => void) => () => void
    onEngineStatus: (fn: (status: { engine: string; modelLoaded: boolean }) => void) => () => void
    onInstallLog: (fn: (progress: { phase: string; line: string }) => void) => () => void
  }
  weixinGetStatus: () => Promise<{
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
  }>
  weixinStartLogin: (args?: {
    agentId?: string
  }) => Promise<{ qrcode: string; qrcodeImgContent: string; qrcodeScanUrl?: string }>
  weixinPollLogin: (args: { qrcode: string; verifyCode?: string; baseUrl?: string }) => Promise<{
    ok: boolean
    status: string
    needVerifyCode?: boolean
    error?: string
  }>
  weixinSubmitVerifyCode: (args: { qrcode: string; verifyCode: string }) => Promise<{
    ok: boolean
    status: string
    needVerifyCode?: boolean
    error?: string
  }>
  weixinSetBoundAgent: (args: { agentId: string }) => Promise<{
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
  }>
  weixinDisconnect: () => Promise<{ ok: boolean }>
  weixinSetEnabled: (enabled: boolean) => Promise<{
    connected: boolean
    enabled: boolean
    polling: boolean
    proactiveEnabled: boolean
    accountId?: string
    userId?: string
    boundAgentId?: string
    lastError?: string | null
    tokenExpired: boolean
  }>
  weixinSetProactiveEnabled: (enabled: boolean) => Promise<{
    connected: boolean
    enabled: boolean
    polling: boolean
    proactiveEnabled: boolean
    accountId?: string
    userId?: string
    boundAgentId?: string
    lastError?: string | null
    tokenExpired: boolean
  }>
  weixinRestart: () => Promise<{
    connected: boolean
    enabled: boolean
    polling: boolean
    proactiveEnabled: boolean
    accountId?: string
    userId?: string
    boundAgentId?: string
    lastError?: string | null
    tokenExpired: boolean
  }>
  onWeixinStatusChanged?: (
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
  ) => () => void
}

export type VoiceEnvReport = {
  ready: boolean
  canAutoInstall: boolean
  summary: string
  detail: string
  sherpaReady: boolean
  sherpaModelId: string | null
  sherpaMessage: string
}

declare global {
  interface Window {
    ackem: AckemApi
  }
}

export {}
