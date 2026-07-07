import type { UpdateChannel, UpdateCheckResult, UpdateStartRequest } from '../../shared/updateTypes'
import type { CompanionSkinBinding } from '../../shared/companionSkin'
import type { SearchCardPayload } from '../../shared/searchCard'
import type { MemoryAuditCardPayload } from '../../shared/memoryAudit'
import type { UserTaskFrame } from '../../shared/taskFrame'
import type { AgentEvent, AgentRunMeta } from '../../shared/openforuAgentTypes'
import type { PermissionRequestPayload } from '../../shared/openforuPermissions'

export type { AppSettings, CompanionSuggestion, LlmProvider, PresetGender, UserSixDimensions }
export type { OpenForUExtensionRow } from '../../shared/openforuExtensions'

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
  dispatchPending?: {
    extensionId: string
    extensionName: string
    askMessage: string
  }
  planCreatePending?: {
    askMessage: string
    planTopic?: string
    emotionLabel?: string
  }
  /** L0.5 鐭ヨ瘑鏁寸悊涓婚锛堣Е鍙戠焊闈㈠崱锛屼笉鑱旂綉锛?*/
  knowledgeTopic?: string
  /** @deprecated 鍚?knowledgeTopic */
  suggestedSearchQuery?: string
  /** L0.5 璁″垝涔︿富棰橈紙Markdown 璁″垝绾搁潰鍗★紝涓?OpenForU planTopic 鏃犲叧锛?*/
  planDocumentTopic?: string
  /** L0.5 鏄惧紡鑱旂綉鎼滐細瑙勫垯灞傚己鍒?web_search锛宷uery 宸叉彁鍙?*/
  forcedWebSearchQuery?: string
  /** L0 鐢ㄦ埛浠诲姟妗嗭紙浜や粯褰㈡€?/ 鍚堝苟鎼滅储锛?*/
  userTaskFrame?: UserTaskFrame
  /** P0-1锛欳reate/invoke 鏈矾鐢憋紝绂佹鎵╁睍绫诲亣鎵胯 */
  dispatchBypassed?: boolean
  /** 鏈疆宸茶Е鍙戠殑鎵╁睍锛坅uto_invoke 鎴栫敤鎴风‘璁ゅ惎鐢級 */
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
  i18n: {
    t: (key: string, params?: Record<string, string | number>) => Promise<string>
    getLocale: () => Promise<string>
    setLocale: (locale: string) => Promise<void>
    getAllResources: () => Promise<{ zh: Record<string, string>; en: Record<string, string>; locale: string }>
  }
  getSettings: () => Promise<AppSettings>
  getAppVersion: () => Promise<string>
  checkUpdate: () => Promise<UpdateCheckResult>
  startUpdate: (
    req: UpdateStartRequest & { channel: UpdateChannel }
  ) => Promise<{ ok: true; jobPath: string } | { ok: false; reason: string }>
  openUpdateRelease: (url: string) => Promise<void>
  getUpdateChannelPreference: () => Promise<UpdateChannel>
  setUpdateChannelPreference: (channel: UpdateChannel) => Promise<UpdateChannel>
  getCanon: () => Promise<AckemCanonInfo>
  getCreatorMemory: () => Promise<CreatorMemoryUiBundle>
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  getDataRoot: () => Promise<{ path: string; relativePath: string; mode: string; databasePath: string }>
  ensureLayout: () => Promise<{ path: string }>
  openDataFolder: () => Promise<void>
  selectFiles: () => Promise<{ paths: string[] }>
  getPathForFile: (file: File) => string
  importFiles: (paths: string[]) => Promise<{ copied: string[]; errors: string[] }>
  promoteImport: (rel: string) => Promise<{ ok: boolean; to?: string; error?: string }>
  importParseDocuments: (args: {
    relPaths: string[]
    consentAck: boolean
    consentVersion: number
  }) => Promise<import('../../shared/documentImport').ImportParseResult>
  importGetJob: (jobId: string) => Promise<import('../../shared/documentImport').ImportJob | null>
  importCommitJob: (args: {
    jobId: string
    disabledDraftIds?: string[]
  }) => Promise<import('../../shared/documentImport').ImportCommitResult>
  rebuildIndex: () => Promise<{ chunks: number; builtAt: string }>
  search: (q: string, limit?: number) => Promise<
    Array<{ score: number; id: string; relPath: string; preview: string; mtimeMs: number }>
  >
  buildContext: (args: {
    userText: string
    explicitRel?: string
    recentMessages: { role: 'user' | 'assistant'; content: string }[]
    sessionId?: string
    turnIndex?: number
    systemHint?: string
    dispatchRespond?: { accepted: boolean; extensionId: string; remember?: boolean }
    desktopAgentChatMode?: boolean
  }) => Promise<BuildContextResult>
  readRel: (rel: string, maxBytes?: number) => Promise<{ ok: boolean; text?: string; error?: string }>
  writeAllowed: (
    rel: string,
    content: string,
    mode: 'append' | 'overwrite'
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  startChat: (payload: {
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
  getState: () => Promise<unknown>
  resetState: () => Promise<unknown>
  traceLatest: (n?: number) => Promise<unknown>
  memoryList: () => Promise<unknown[]>
  memoryAuditReport: (opts?: {
    mode?: 'curated_audit' | 'self_report' | 'stats_only' | 'full_dump'
    includeAvoid?: boolean
    page?: number
  }) => Promise<{ report: unknown; card: MemoryAuditCardPayload }>
  memoryUpdate: (
    id: string,
    patch: { summary?: string; weight?: number; confidence?: number; triggers?: string[] }
  ) => Promise<boolean>
  memoryRetire: (id: string) => Promise<boolean>
  memoryFeedback: (id: string, action: 'thumbs_up' | 'thumbs_down') => Promise<boolean>
  memoryClearAll: () => Promise<{ ok: boolean }>
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
  associationList: () => Promise<Array<{
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
  memoryStats: () => Promise<{
    totalFacts: number; activeFacts: number; retiredFacts: number; coreFacts: number
    totalTriples: number; totalAssociations: number; totalEpisodes: number; totalAnchors: number
    byDomain: Array<{ domain: string; c: number }>
    bySubcategory: Array<{ subcategory: string; c: number }>
  } | null>
  onMemoryUpdated: (fn: (payload: { sessionId: string; turnIndex: number; newFactCount: number }) => void) => () => void
  kgList: () => Promise<Array<{
    id: string; subject: string; predicate: string; object: string
    confidence: number; sourceFactIds: string[]; createdAt: string
  }>>
  kgOneHop: (entity: string) => Promise<Array<{
    id: string; subject: string; predicate: string; object: string
    confidence: number; sourceFactIds: string[]; createdAt: string
  }>>
  episodeList: () => Promise<Array<{
    id: string; summary: string; emotionalIntensity: number
    dominantEmotion: string; keywords: string[]
    prevEpisodeId: string | null; sourceSessionId: string
    startTurn: number; endTurn: number; createdAt: string
  }>>
  desireList: () => Promise<{ slots: (null | { id: string; topic: string; category: string; urgency: number; status: string; sourceTurn: number })[] }>
  desireDismiss: (desireId: string) => Promise<{ slots: (null | { id: string; topic: string; category: string; urgency: number; status: string; sourceTurn: number })[] }>
  desireClearActive: () => Promise<{ slots: (null | { id: string; topic: string; category: string; urgency: number; status: string; sourceTurn: number })[] }>
  agnes: {
    generateImage: (prompt: string) => Promise<{
      success: boolean
      imageUrl?: string  // ackem-img:// 鍗忚 URL 鎴?http(s) URL
      revisedPrompt?: string
      error?: string
    }>
    detectIntent: (text: string) => Promise<{
      isImage: boolean
      prompt?: string
    }>
  }
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
  /** 褰撳墠搴斾娇鐢ㄧ殑浼翠荆浜や簰褰㈣薄缁戝畾锛坰kin 鎻掍欢鍙鐩栧唴缃?Canvas锛?*/
  companionSkinActive: () => Promise<CompanionSkinBinding>
  companionSkinList: () => Promise<CompanionSkinBinding[]>
  companionSkinSetActive: (pluginId: string | null) => Promise<{ ok: boolean }>
  onCompanionSkinChanged: (fn: () => void) => void
  /** @deprecated 浣跨敤 ext.gamemode.minecraft */
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
  archiveList: () => Promise<{ files: Array<{ path: string; name: string; isDir: boolean; size: number }>; domains: string[]; lastExportAt: string | null }>
  archiveRead: (relPath: string) => Promise<{ ok: boolean; text?: string; error?: string }>
  archiveExport: () => Promise<{ filesWritten: number; factsExported: number; episodesExported: number; coreCount: number }>
  loadChatHistory: () => Promise<unknown[]>
  saveChatHistory: (rows: unknown[]) => Promise<void>
  // 妗岄潰闄即
  companionTimeContext: () => Promise<{ timeOfDay: string; hour: number; minute: number; weekday: number; isWeekend: boolean; greeting: string; atmosphereHint: string; topicHints: string[] }>
  companionPresence: () => Promise<{ mode: 'active' | 'quiet' | 'sleeping'; lastInteractionMs: number; idleDurationMs: number; timeOfDay: string }>
  companionTouch: () => Promise<{ ok: boolean }>
  companionStatusText: () => Promise<string>
  companionGetConfig: () => Promise<{ idleThresholdMs: number; cooldownMs: number; nightSuppression: boolean; quietMode: boolean }>
  companionSetConfig: (patch: Record<string, unknown>) => Promise<{ ok: boolean }>
  onCompanionProactive: (fn: (payload: { message: string; timeContext: unknown }) => void) => void
  onDiaryAutoGenerated: (fn: (payload: { date: string; type: string }) => void) => void
  onChatChunk: (fn: (s: string) => void) => void
  onChatStreamStart: (fn: () => void) => void
  onChatDone: (
    fn: (meta?: { memoryWrites?: string[]; assistantText?: string; turnId?: string }) => void
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
      piper_voices?: Array<{ id: string; label: string; language: string }>
      gpt_sovits_voices?: Array<{ id: string; label: string; language: string }>
    } | null>
    onTtsAudio: (fn: (audio: ArrayBuffer) => void) => () => void
    onTtsSpeakText: (fn: (payload: { text: string }) => void) => () => void
    onTtsSpeakCancel: (fn: () => void) => () => void
    onTranscript: (fn: (result: { text: string; confidence: number }) => void) => () => void
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
    lastError?: string | null
    tokenExpired: boolean
    embeddingReady?: boolean
  }>
  weixinStartLogin: () => Promise<{ qrcode: string; qrcodeImgContent: string; qrcodeScanUrl?: string }>
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
  weixinDisconnect: () => Promise<{ ok: boolean }>
  weixinSetEnabled: (enabled: boolean) => Promise<{
    connected: boolean
    enabled: boolean
    polling: boolean
    proactiveEnabled: boolean
    accountId?: string
    userId?: string
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
      lastError?: string | null
      tokenExpired: boolean
    }) => void
  ) => () => void
}

export type VoiceEnvReport = {
  ready: boolean
  python: {
    ok: boolean
    source: 'bundled' | 'system' | 'missing'
    path?: string
    version?: string
    message: string
  }
  scriptOk: boolean
  scriptPath: string
  dependenciesOk: boolean
  missingDependencies: string[]
  serviceRunning: boolean
  canAutoInstall: boolean
  summary: string
  detail: string
}

declare global {
  interface Window {
    Ackem: AckemApi
  }
}

export {}
