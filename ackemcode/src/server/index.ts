import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nanoid } from 'nanoid'
import type {
  AgentEvent,
  AgentTier,
  ChatMessage,
  EffortLevel,
  PermissionDecisionKind,
  PermissionMode
} from '../shared/types.js'
import { ALWAYS_ALLOW_REGULAR_TOOLS_RULE } from './agent/permissions.js'
import {
  loadSettings,
  loadStandaloneSettings,
  publicSettingsView,
  saveSettings,
  saveStandaloneSettings,
  standaloneConfigured
} from './settingsStore.js'
import { loadLlmVendors, testLlmConnection } from './llm/vendors.js'
import {
  findRegisteredModel,
  listRegisteredModelsPublic
} from './llm/modelRegistry.js'
import { manageMcp, parseMcpSlashArg } from './agent/mcpManage.js'
import { respondBrowserOnboarding } from './mcp/browserOnboardingBroker.js'
import { PLAYWRIGHT_MCP_BRIDGE_STORE_URL } from './mcp/browserOnboarding.js'
import { openUrlTool } from './tools/openExternalTool.js'
import {
  deleteMemoryFile,
  listMemoryFiles,
  readMemoryFile,
  writeMemoryFile
} from './memdir/memoryApi.js'
import { formatPluginListing, loadLocalPlugins, pluginSkillDirs } from './plugins/loadPlugins.js'
import {
  findPluginSlashCommand,
  formatPluginCommandFollowUp,
  getCachedPluginAugmentation,
  getEffectiveHooks,
  getEffectiveMcpServers,
  refreshPluginAugmentation
} from './plugins/pluginAugment.js'
import { resolveEffectivePermissionRules } from './agent/permissionsLoader.js'
import { findDangerousAllowRules } from './agent/dangerousAllowRules.js'
import { detectUnreachableRules } from './agent/shadowedRuleDetection.js'
import {
  checkSandboxDependencies,
  getSandboxOnboardingInfo,
  getSandboxStatus,
  getSandboxUnavailableReason,
  initializeSandbox,
  isSupportedPlatform,
  normalizeSandboxSettings,
  resetSandbox
} from './sandbox/index.js'
import { installWindowsSandbox } from '@anthropic-ai/sandbox-runtime'
import { runAgentTurn } from './agent/loop.js'
import { PermissionBroker } from './agent/permissions.js'
import { InteractionBroker } from './agent/interactions.js'
import {
  createPlanBridge,
  newPlanSessionFields
} from './plans/sessionPlanBridge.js'
import type { TodoItem } from './agent/todos.js'
import {
  loadSkillsDetailed,
  defaultSkillRoots,
  toCatalogRows,
  findSkill
} from './skills/loadSkills.js'
import {
  ackemSkillsHome,
  installSkillFromSpec,
  parseInstallSpec,
  uninstallSkill,
  SKILL_CATALOG
} from './skills/installSkill.js'
import { discoverSkillInstallSpecs } from './tools/webFetch/index.js'
import {
  deleteSession,
  isValidSessionId,
  listSessions,
  loadSession,
  saveSession
} from './sessionStore.js'
import { mergeCollapseCommits } from './agent/compact/contextCollapseCommits.js'
import { mcpManager, mcpElicitationBroker } from './mcp/index.js'
import {
  createReadFileState,
  type ReadFileState,
  type WorktreeSession
} from './tools/index.js'
import {
  SessionCronStore,
  SessionCronScheduler,
  deliverDueCronJobs
} from './tools/cron/index.js'
import { buildW3Summary, type W3Summary } from './host/w3.js'
import type { VerifyEvidence } from './agent/verification.js'
import { lspManager } from './lsp/manager.js'
import { FileHistory, clearFileHistoryPersistence } from './fileHistory/index.js'
import {
  formatQueueBatchUserText,
  handleSlashCommand,
  isMainSessionQueueItem,
  SessionMessageQueue,
  type QueueMode,
  type QueuePriority,
  type SlashContext
} from './agent/messageQueue.js'
import { countConfiguredLspServers } from './lsp/types.js'
import { AgentRegistry, clearAgentPersistence } from './agent/agentRegistry.js'
import { TaskStore, clearTaskPersistence } from './agent/tasks.js'
import { BackgroundAgentHub } from './agent/backgroundAgents.js'
import {
  runHooks,
  initializeFileChangedWatcher,
  updateHooksConfigForWatcher,
  type HooksConfig
} from './hooks/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.ACKEMCODE_PORT || 8787)
mcpManager.setOAuthPort(PORT)

// GM-HOOK: Elicitation / ElicitationResult use the shared runHooks engine
mcpElicitationBroker.setHooksRunner(runHooks as never)

function effectiveHooks(s: { hooks?: unknown; cwd?: string }): HooksConfig {
  return getEffectiveHooks((s.hooks ?? {}) as HooksConfig, s.cwd || process.cwd())
}

async function resyncPluginsAndMcp(s: { cwd?: string; mcpServers?: unknown }) {
  const cwd = s.cwd || process.cwd()
  await refreshPluginAugmentation(cwd)
  const settings = await loadSettings()
  await mcpManager.syncFromSettings(
    getEffectiveMcpServers(settings.mcpServers ?? {}, cwd)
  )
}

function syncElicitationHooksFromSettings(s: {
  hooks?: unknown
  disableAllHooks?: boolean
  cwd?: string
  permissionMode?: string
}, sessionId?: string): void {
  mcpElicitationBroker.setHooksContext({
    config: effectiveHooks(s),
    disabled: s.disableAllHooks === true,
    cwd: s.cwd || process.cwd(),
    sessionId: sessionId || 'session',
    permissionMode: s.permissionMode
  })
}

type Session = {
  id: string
  history: ChatMessage[]
  permissions: PermissionBroker
  interactions: InteractionBroker
  mode: PermissionMode
  todos: TodoItem[]
  /** In-memory read-before-write tracking (not persisted). */
  readFileState: ReadFileState
  /** Runtime cwd (switches on enter_worktree). */
  runtimeCwd?: string
  worktree: WorktreeSession | null
  /** M21 host persona short summary */
  personaSlot: string
  /** Last W3 companion summary */
  lastW3: W3Summary | null
  /** S08: last verify_delivery / verification agent evidence */
  lastVerifyEvidence: VerifyEvidence | null
  /** R10: last verify_plan_execution evidence (plan delivery gate) */
  lastPlanVerifyEvidence: VerifyEvidence | null
  cron: SessionCronStore
  /** GM-CRON: 1s ticker → deliverDue → idle pump */
  cronScheduler: SessionCronScheduler
  /** S06: per-session file checkpoints (CC fileHistory). */
  fileHistory: FileHistory
  /** S07: mid-turn user prompts (CC messageQueueManager). */
  messageQueue: SessionMessageQueue
  /** S09: sidechain transcripts for agent resume (CC resumeAgent spirit). */
  agentRegistry: AgentRegistry
  /** S10: durable Task v2 list (CC Task* spirit). */
  taskStore: TaskStore
  /** §5.3 #11: async background agents + task-notification. */
  backgroundAgents: BackgroundAgentHub
  /** S10 PlanV2: Explore agents launched since last enter_plan_mode. */
  planExploreCount: number
  /** §5.3 #12: distinct Explore focus strings this plan session. */
  planExploreFoci: string[]
  /** CC plan mode: mode before entering plan (restore on approve). */
  prePlanMode: PermissionMode | null
  hasExitedPlanMode: boolean
  needsPlanModeExitAttachment: boolean
  planEnterAttachmentFullSent: boolean
  planFileExists: boolean
  /** True while runAgentTurn is in flight (enqueue instead of second SSE). */
  turnRunning: boolean
  /** B-06: user text of the in-flight turn (for abort restoreInput). */
  currentTurnUserText?: string
  /** B-06: fileHistory snapshot id at turn start (for abort rewind). */
  turnStartMessageId?: string
  /** Session-only model override (`/model` + `s` in CLI). */
  sessionModel?: string
  /** Coalesce idle queue pumps after background notifications. */
  idlePumpScheduled?: boolean
  /** History snip records for resume (Batch 8). */
  snipRecords: import('./agent/contextSnip.js').SnipRecord[]
  /** L3: context collapse commits for resume. */
  collapseCommits: import('./sessionStore.js').ContextCollapseCommit[]
  abort?: AbortController
  /** Live SSE writer while a chat stream is open (abort_ack / mode_changed). */
  sseEmit?: (event: AgentEvent) => void
}

const sessions = new Map<string, Session>()

function planBridgeFor(
  session: Session,
  settings: Awaited<ReturnType<typeof loadSettings>>,
  emit?: (event: AgentEvent) => void
) {
  return createPlanBridge(
    session,
    settings,
    session.permissions,
    emit ?? ((ev) => session.sseEmit?.(ev))
  )
}

function planRunAgentOpts(
  session: Session,
  settings: Awaited<ReturnType<typeof loadSettings>>,
  emit: (event: AgentEvent) => void
) {
  const bridge = planBridgeFor(session, settings, emit)
  return {
    getPlanFilePath: bridge.getPlanFilePath,
    getPrePlanMode: bridge.getPrePlanMode,
    planModeInterviewPhase: bridge.planModeInterviewPhase,
    plansDirectory: bridge.plansDirectory,
    onEnterPlanMode: bridge.onEnterPlanMode,
    onExitPlanModeApproved: bridge.onExitPlanModeApproved,
    onExitPlanModeRejected: bridge.onExitPlanModeRejected,
    onPlanFileUpdated: bridge.onPlanFileUpdated,
    getPlanRuntime: bridge.getPlanRuntime,
    setPlanEnterAttachmentFullSent: bridge.setPlanEnterAttachmentFullSent,
    consumePlanModeExitAttachment: bridge.consumePlanModeExitAttachment
  }
}

function bindCronScheduler(session: Session): void {
  session.cronScheduler.bind({
    getStore: () => session.cron,
    getQueue: () => session.messageQueue,
    isTurnRunning: () => session.turnRunning,
    scheduleIdlePump: () => scheduleIdleQueuePump(session),
    onDeliver: (result) => {
      session.sseEmit?.({ type: 'cron_due', jobs: result.due })
      for (const item of result.queued) {
        session.sseEmit?.({
          type: 'message_queued',
          id: item.id,
          text: item.text,
          queueLength: session.messageQueue.length,
          priority: item.priority,
          mode: item.mode
        })
      }
    }
  })
  session.cronScheduler.start()
}

function bindBackgroundHub(session: Session): void {
  session.backgroundAgents.bind({
    messageQueue: session.messageQueue,
    isTurnRunning: () => session.turnRunning,
    emit: (ev) => session.sseEmit?.(ev),
    scheduleIdlePump: () => scheduleIdleQueuePump(session),
    fireNotification: (message, notificationType) => {
      void loadSettings()
        .then((settings) =>
          runHooks({
            event: 'Notification',
            config: effectiveHooks(settings),
            disabled: settings.disableAllHooks === true,
            cwd: session.runtimeCwd || settings.cwd || process.cwd(),
            input: {
              session_id: session.id,
              cwd: session.runtimeCwd || settings.cwd || process.cwd(),
              permission_mode: session.mode,
              hook_event_name: 'Notification',
              message,
              notification_type: notificationType
            }
          })
        )
        .catch(() => {})
    }
  })
}

function scheduleIdleQueuePump(session: Session): void {
  if (session.idlePumpScheduled) return
  session.idlePumpScheduled = true
  setImmediate(() => {
    session.idlePumpScheduled = false
    void pumpIdleSessionQueue(session).catch((e) => {
      console.error('idle queue pump failed', session.id, e)
    })
  })
}

/** GM-SLASH: session-bound context for builtin slash commands. */
function buildSlashContext(
  session: Session,
  settings: Awaited<ReturnType<typeof loadSettings>>
): SlashContext {
  const cwd = () => session.runtimeCwd || settings.cwd || process.cwd()
  return {
    clearHistory: () => {
      session.history = []
      session.todos = []
      session.readFileState = createReadFileState()
      planBridgeFor(session, settings).clearPlanSession()
    },
    setMode: (m) => {
      if (PERMISSION_MODES.includes(m as PermissionMode)) {
        const prev = session.mode
        const next = m as PermissionMode
        void planBridgeFor(session, settings).transitionModeManual(prev, next)
        session.mode = next
        session.sseEmit?.({ type: 'mode_changed', mode: session.mode })
      }
    },
    getMode: () => session.mode,
    getCwd: cwd,
    getSessionId: () => session.id,
    getHistory: () => session.history,
    setHistory: (h) => {
      session.history = h
    },
    getHooksConfig: () => effectiveHooks({ hooks: settings.hooks, cwd: cwd() }),
    hooksDisabled: () => settings.disableAllHooks === true,
    getPermissionRuleCounts: () => {
      const r = settings.permissionRules ?? { allow: [], deny: [], ask: [] }
      return {
        allow: r.allow?.length ?? 0,
        deny: r.deny?.length ?? 0,
        ask: r.ask?.length ?? 0
      }
    },
    getMcpStatus: () =>
      mcpManager.status().map((s) => ({ name: s.name, state: s.state })),
    getLspSummary: () => ({
      toolEnabled: lspManager.isEnabled(),
      configuredServers: countConfiguredLspServers(settings.lspServers)
    }),
    getVerifySummary: () =>
      session.lastVerifyEvidence
        ? {
            verdict: session.lastVerifyEvidence.verdict,
            verified: session.lastVerifyEvidence.verified
          }
        : null,
    readPlan: () => planBridgeFor(session, settings).readPlanForSlash(),
    getAgentTier: () => settings.agentTier ?? 'auto',
    setAgentTier: async (tier: AgentTier) => {
      const next = await saveSettings({ agentTier: tier })
      Object.assign(settings, next)
      session.sseEmit?.({
        type: 'status',
        message: `agents tier → ${tier}`
      })
    },
    getEffort: () => settings.effort,
    setEffort: async (effort: EffortLevel) => {
      const next = await saveSettings({ effort })
      Object.assign(settings, next)
      session.sseEmit?.({
        type: 'settings_changed',
        changed: ['effort'],
        hasApiKey: Boolean(next.apiKey),
        settings: { effort: next.effort }
      })
    },
    getModel: () => session.sessionModel || settings.model,
    getRegisteredModels: async () => {
      const s = await loadStandaloneSettings()
      return listRegisteredModelsPublic(s.registeredModels)
    },
    setModel: async (model: string, persist: boolean) => {
      const standalone = await loadStandaloneSettings()
      const entry = findRegisteredModel(standalone.registeredModels, model)
      if (!entry) {
        throw new Error(`模型「${model}」未注册。请先用 /setup 测试通过后再切换。`)
      }
      session.sessionModel = model
      if (persist) {
        const next = await saveSettings({
          model: entry.model,
          apiBaseUrl: entry.apiBaseUrl,
          apiKey: entry.apiKey,
          contextWindow: entry.contextWindow
        })
        Object.assign(settings, next)
        await saveStandaloneSettings({
          model: entry.model,
          apiBaseUrl: entry.apiBaseUrl,
          apiKey: entry.apiKey,
          contextWindow: entry.contextWindow
        })
        session.sseEmit?.({
          type: 'settings_changed',
          changed: ['model', 'contextWindow'],
          hasApiKey: Boolean(next.apiKey),
          settings: {
            model: next.model,
            contextWindow: next.contextWindow
          }
        })
      }
    },
    getContextWindow: () => settings.contextWindow,
    getStandaloneConfigured: () => standaloneConfigured(),
    manageMcp: async (arg: string) => manageMcp(parseMcpSlashArg(arg)),
    getSandboxEnabled: () => Boolean(settings.sandbox?.enabled),
    setSandboxEnabled: async (enabled: boolean) => {
      const next = await saveSettings({
        sandbox: { ...settings.sandbox, enabled }
      })
      Object.assign(settings, next)
    },
    listMemory: async () => {
      const { dir, files } = await listMemoryFiles(cwd())
      if (!files.length) return `=== /memory ===\n(dir ${dir})\n(empty)`
      return [
        '=== /memory ===',
        dir,
        ...files.map((f) => `${f.rel}  ${f.bytes}B  ${f.updatedAt}`)
      ].join('\n')
    },
    listPlugins: async () => {
      const plugins = await loadLocalPlugins(cwd())
      const aug = getCachedPluginAugmentation(cwd())
      return formatPluginListing(plugins, aug)
    },
    invokePluginCommand: async (name, args) => {
      const cmd = findPluginSlashCommand(cwd(), name)
      if (!cmd) return null
      return formatPluginCommandFollowUp(cmd, args)
    },
    invokeSkillFollowUp: async (name, args) => {
      const cmd = findPluginSlashCommand(cwd(), name)
      if (cmd) return formatPluginCommandFollowUp(cmd, args)
      const plugins = await loadLocalPlugins(cwd())
      const meta = await loadSkillsDetailed({
        cwd: cwd(),
        extraSkillDirs: pluginSkillDirs(plugins)
      })
      const skill = findSkill(meta.skills, name)
      if (!skill || skill.userInvocable === false) return null
      return [
        `[SYSTEM SKILL INVOCATION — slash /${skill.name}]`,
        'You MUST follow this skill now. Do not ask whether to run it.',
        args ? `Arguments: ${args}` : '',
        '',
        skill.body
      ]
        .filter(Boolean)
        .join('\n')
    },
    doctorExtras: async () => {
      const lines: string[] = []
      try {
        const { execFile } = await import('node:child_process')
        const { promisify } = await import('node:util')
        const execFileAsync = promisify(execFile)
        const r = await execFileAsync('gh', ['--version'], { timeout: 4000 })
        lines.push(`gh: ${(r.stdout || '').split('\n')[0] || 'ok'}`)
      } catch {
        lines.push('gh: not found (install GitHub CLI for /pr)')
      }
      const plugins = await loadLocalPlugins(cwd())
      lines.push(`plugins: ${plugins.length}`)
      return lines
    }
  }
}

/**
 * When the main turn is idle but task-notifications (or prompts) sit in the
 * queue, run a silent chain so the model sees background completions (CC
 * between-turn drain spirit).
 */
async function pumpIdleSessionQueue(session: Session): Promise<void> {
  if (session.turnRunning) return
  if (!session.messageQueue.length) return

  const settings = await loadSettings()
  session.turnRunning = true
  if (!session.abort || session.abort.signal.aborted) {
    session.abort = new AbortController()
  }

  const send = (event: AgentEvent) => {
    session.sseEmit?.(event)
  }

  try {
    if (session.mode === 'default') session.mode = settings.permissionMode
    if (!session.runtimeCwd) session.runtimeCwd = settings.cwd

    let nextUserText: string | null = null
    let guard = 0
    const MAX_CHAIN = 8
    while (guard < MAX_CHAIN) {
      guard += 1
      if (!nextUserText) {
        const batch = session.messageQueue.takeBetweenTurnBatch(
          isMainSessionQueueItem
        )
        if (!batch.length) break
        if (batch[0]!.mode === 'slash') {
          const cmd = batch[0]!
          const slash = await handleSlashCommand(
            cmd.text,
            buildSlashContext(session, settings)
          )
          send({ type: 'status', message: slash.message })
          if (slash.followUpUserText) {
            nextUserText = slash.followUpUserText
            continue
          }
          nextUserText = null
          continue
        }
        for (const item of batch) {
          send({
            type: 'message_dequeued',
            id: item.id,
            text: item.text,
            remaining: session.messageQueue.length,
            mode: item.mode
          })
        }
        // GM-NOTIFY: collapse consecutive completed task-notifications
        nextUserText = formatQueueBatchUserText(batch)
      }

      if (!session.abort || session.abort.signal.aborted) {
        session.abort = new AbortController()
      }
      const controller = session.abort
      send({ type: 'session_state', state: 'running' })
      session.currentTurnUserText = nextUserText ?? session.currentTurnUserText
      const history = await runAgentTurn({
        settings: {
          ...settings,
          cwd: session.runtimeCwd || settings.cwd,
          model: session.sessionModel || settings.model
        },
        history: session.history,
        userText: nextUserText,
        permissions: session.permissions,
        interactions: session.interactions,
        readFileState: session.readFileState,
        getMode: () => session.mode,
        setMode: (m) => {
          session.mode = m
        },
        getTodos: () => session.todos,
        setTodos: (todos) => {
          session.todos = todos
        },
        getCwd: () => session.runtimeCwd || settings.cwd,
        setCwd: (cwd) => {
          session.runtimeCwd = cwd
        },
        getWorktree: () => session.worktree,
        setWorktree: (w) => {
          session.worktree = w
        },
        getCron: () => session.cron,
        personaSlot: session.personaSlot,
        sessionId: session.id,
        fileHistory: session.fileHistory,
        messageQueue: session.messageQueue,
        agentRegistry: session.agentRegistry,
        backgroundAgents: session.backgroundAgents,
        taskStore: session.taskStore,
        getPlanExploreCount: () => session.planExploreCount,
        notePlanExplore: (focus?: string) => {
          session.planExploreCount += 1
          const f = focus?.trim()
          if (f) {
            const key = f.toLowerCase()
            if (
              !session.planExploreFoci.some((x) => x.toLowerCase() === key)
            ) {
              session.planExploreFoci.push(f)
            }
          }
        },
        resetPlanExplore: () => {
          session.planExploreCount = 0
          session.planExploreFoci = []
        },
        getPlanExploreFoci: () => [...session.planExploreFoci],
        noteVerifyEvidence: (ev) => {
          session.lastVerifyEvidence = ev
        },
        notePlanVerifyEvidence: (ev) => {
          session.lastPlanVerifyEvidence = ev
        },
        ...planRunAgentOpts(session, settings, send),
        emit: send,
        signal: controller.signal,
        abortController: controller,
        recordSnip: (record) => {
          session.snipRecords.push(record)
        },
        recordCollapseCommits: (commits) => {
          session.collapseCommits = mergeCollapseCommits(
            session.collapseCommits,
            commits
          )
        }
      })
      session.history = history
      await persist(session)
      nextUserText = null
    }
    send({ type: 'session_state', state: 'idle' })
  } finally {
    session.turnRunning = false
    if (session.messageQueue.length) scheduleIdleQueuePump(session)
  }
}

function newSessionSkeleton(id: string): Session {
  const session: Session = {
    id,
    history: [],
    permissions: new PermissionBroker(),
    interactions: new InteractionBroker(),
    mode: 'default',
    todos: [],
    readFileState: createReadFileState(),
    worktree: null,
    personaSlot: '',
    lastW3: null,
    lastVerifyEvidence: null,
    lastPlanVerifyEvidence: null,
    cron: new SessionCronStore(),
    cronScheduler: new SessionCronScheduler(),
    fileHistory: new FileHistory(id),
    messageQueue: new SessionMessageQueue(),
    agentRegistry: new AgentRegistry(id),
    taskStore: new TaskStore(id),
    backgroundAgents: new BackgroundAgentHub(),
    planExploreCount: 0,
    planExploreFoci: [],
    ...newPlanSessionFields(),
    turnRunning: false,
    snipRecords: [],
    collapseCommits: []
  }
  bindBackgroundHub(session)
  bindCronScheduler(session)
  // R9: rehydrate durable cron jobs (fire-and-forget; fail-soft)
  void session.cron.hydrateDurable().catch(() => {})
  return session
}

async function persist(session: Session): Promise<void> {
  try {
    await Promise.all([
      session.agentRegistry.flush(),
      session.taskStore.flush()
    ])
    await saveSession({
      version: 1,
      id: session.id,
      updatedAt: new Date().toISOString(),
      mode: session.mode,
      todos: session.todos,
      history: session.history,
      sessionAllows: session.permissions.exportSessionMemory(),
      snipRecords: session.snipRecords.length ? session.snipRecords : undefined,
      collapseCommits: session.collapseCommits.length
        ? session.collapseCommits
        : undefined
    })
  } catch (e) {
    console.error('session persist failed', session.id, e)
  }
}

async function hydrateFromDisk(id: string): Promise<Session | null> {
  if (!isValidSessionId(id)) return null
  const disk = await loadSession(id)
  if (!disk) return null
  const permissions = new PermissionBroker()
  permissions.hydrateSessionMemory(disk.sessionAllows)
  const { applyPersistedSnipRecords } = await import('./agent/contextSnip.js')
  const { applyContextCollapseCommits } = await import(
    './agent/compact/contextCollapseCommits.js'
  )
  const snipRecords = disk.snipRecords ?? []
  const collapseCommits = disk.collapseCommits ?? []
  let history = applyPersistedSnipRecords(disk.history, snipRecords)
  history = applyContextCollapseCommits(history, collapseCommits)
  const session: Session = {
    id: disk.id,
    history,
    permissions,
    interactions: new InteractionBroker(),
    mode: disk.mode || 'default',
    todos: disk.todos || [],
    readFileState: createReadFileState(),
    worktree: null,
    personaSlot: '',
    lastW3: null,
    lastVerifyEvidence: null,
    lastPlanVerifyEvidence: null,
    cron: new SessionCronStore(),
    cronScheduler: new SessionCronScheduler(),
    fileHistory: await FileHistory.open(disk.id),
    messageQueue: new SessionMessageQueue(),
    agentRegistry: await AgentRegistry.open(disk.id),
    taskStore: await TaskStore.open(disk.id),
    backgroundAgents: new BackgroundAgentHub(),
    planExploreCount: 0,
    planExploreFoci: [],
    ...newPlanSessionFields(),
    turnRunning: false,
    snipRecords: [...snipRecords],
    collapseCommits: [...collapseCommits]
  }
  // R9: restore durable cron jobs across process / session resume
  await session.cron.hydrateDurable().catch(() => 0)
  bindBackgroundHub(session)
  bindCronScheduler(session)
  sessions.set(session.id, session)
  return session
}

async function getSession(id: string): Promise<Session | null> {
  if (sessions.has(id)) return sessions.get(id)!
  return hydrateFromDisk(id)
}

async function fireSetupHook(sessionId: string): Promise<void> {
  try {
    const settings = await loadSettings()
    await runHooks({
      event: 'Setup',
      config: effectiveHooks(settings),
      disabled: settings.disableAllHooks === true,
      cwd: settings.cwd || process.cwd(),
      input: {
        session_id: sessionId,
        cwd: settings.cwd || process.cwd(),
        permission_mode: settings.permissionMode,
        hook_event_name: 'Setup',
        trigger: 'init'
      }
    })
  } catch {
    /* never block session create */
  }
}

async function getOrCreateSession(id?: string): Promise<Session> {
  if (id) {
    const existing = await getSession(id)
    if (existing) return existing
    if (isValidSessionId(id)) {
      const session = newSessionSkeleton(id)
      sessions.set(session.id, session)
      void fireSetupHook(session.id)
      return session
    }
  }

  const session = newSessionSkeleton(nanoid())
  sessions.set(session.id, session)
  void fireSetupHook(session.id)
  return session
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '4mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'AckemCode', version: '0.1.0' })
})

app.get('/api/llm/vendors', async (_req, res) => {
  res.json({ vendors: await loadLlmVendors() })
})

app.get('/api/llm/registry', async (_req, res) => {
  const s = await loadStandaloneSettings()
  res.json({
    models: listRegisteredModelsPublic(s.registeredModels),
    activeModel: s.model
  })
})

app.post('/api/llm/test', async (req, res) => {
  const body = (req.body || {}) as {
    apiBaseUrl?: string
    apiKey?: string
    model?: string
  }
  const standalone = await loadStandaloneSettings()
  const result = await testLlmConnection({
    apiBaseUrl: body.apiBaseUrl || standalone.apiBaseUrl,
    apiKey: body.apiKey || standalone.apiKey,
    model: body.model || standalone.model
  })
  res.status(result.ok ? 200 : 400).json(result)
})

app.get('/api/settings/standalone', async (_req, res) => {
  const s = await loadStandaloneSettings()
  res.json({
    ...s,
    apiKey: s.apiKey ? '••••' + s.apiKey.slice(-4) : '',
    hasApiKey: Boolean(s.apiKey),
    registeredModels: listRegisteredModelsPublic(s.registeredModels)
  })
})

app.put('/api/settings/standalone', async (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>
  const patch: Record<string, unknown> = { ...body }
  if (typeof patch.apiKey === 'string' && patch.apiKey.includes('••••')) {
    delete patch.apiKey
  }
  const next = await saveStandaloneSettings(patch)
  res.json({
    ...next,
    apiKey: next.apiKey ? '••••' + next.apiKey.slice(-4) : '',
    hasApiKey: Boolean(next.apiKey)
  })
})

function memoryCwd(req: express.Request): string {
  const q = typeof req.query.cwd === 'string' ? req.query.cwd : ''
  const b = typeof (req.body as { cwd?: string } | undefined)?.cwd === 'string'
    ? (req.body as { cwd: string }).cwd
    : ''
  return path.resolve(q || b || process.cwd())
}

app.get('/api/memory', async (req, res) => {
  try {
    res.json(await listMemoryFiles(memoryCwd(req)))
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.get('/api/memory/file', async (req, res) => {
  const rel = typeof req.query.path === 'string' ? req.query.path : ''
  if (!rel) {
    res.status(400).json({ error: 'path required' })
    return
  }
  try {
    res.json(await readMemoryFile(memoryCwd(req), rel))
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.put('/api/memory/file', async (req, res) => {
  const body = (req.body || {}) as { path?: string; content?: string }
  if (!body.path || typeof body.content !== 'string') {
    res.status(400).json({ error: 'path and content required' })
    return
  }
  try {
    res.json(await writeMemoryFile(memoryCwd(req), body.path, body.content))
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.delete('/api/memory/file', async (req, res) => {
  const rel =
    typeof req.query.path === 'string'
      ? req.query.path
      : typeof (req.body as { path?: string })?.path === 'string'
        ? (req.body as { path: string }).path
        : ''
  if (!rel) {
    res.status(400).json({ error: 'path required' })
    return
  }
  try {
    const ok = await deleteMemoryFile(memoryCwd(req), rel)
    res.json({ ok })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.get('/api/slash/commands', async (req, res) => {
  try {
    const cwd =
      typeof req.query.cwd === 'string' && req.query.cwd.trim()
        ? path.resolve(req.query.cwd)
        : (await loadSettings()).cwd || process.cwd()
    await refreshPluginAugmentation(cwd)
    const pluginNames = getCachedPluginAugmentation(cwd).slashCommands.map((c) => c.name)
    res.json({
      commands: [
        'help',
        'effort',
        'model',
        'mode',
        'agents',
        'plan',
        'setup',
        'clear',
        'context',
        'compact',
        'status',
        'mcp',
        'diff',
        'doctor',
        'skills',
        'hooks',
        'memory',
        'sandbox',
        'plugins',
        'cost',
        'pr',
        'commit',
        ...pluginNames
      ]
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.get('/api/settings', async (_req, res) => {
  const s = await loadSettings()
  res.json(publicSettingsView(s))
})

/** Effective merged permission rules (user/project/local/host + optional strip). */
app.get('/api/permissions/effective', async (req, res) => {
  const settings = await loadSettings()
  const mode =
    typeof req.query.mode === 'string' && req.query.mode.trim()
      ? req.query.mode.trim()
      : settings.permissionMode
  const eff = await resolveEffectivePermissionRules({
    cwd: settings.cwd,
    hostRules: settings.permissionRules,
    permissionMode: mode
  })
  const unreachable = detectUnreachableRules(eff.rules)
  res.json({
    mode,
    rules: eff.rules,
    stripMode: eff.stripMode,
    strippedApplied: eff.strippedApplied,
    stripped: eff.stripped,
    managedOnly: eff.managedOnly,
    policy: eff.policy,
    wouldStripIfApplied: findDangerousAllowRules(
      eff.layers
        .filter((l) => l.source !== 'policy')
        .flatMap((l) => l.rules.allow)
    ),
    unreachableRules: unreachable.map((u) => ({
      rule: u.rule.raw,
      reason: u.reason,
      shadowedBy: u.shadowedBy.raw,
      shadowType: u.shadowType,
      fix: u.fix
    })),
    layers: eff.layers.map((l) => ({
      source: l.source,
      path: l.path,
      present: l.present,
      counts: {
        allow: l.rules.allow.length,
        deny: l.rules.deny.length,
        ask: l.rules.ask.length
      },
      strippedFromLayer: l.strippedFromLayer?.length ?? 0
    }))
  })
})

app.put('/api/settings', async (req, res) => {
  const body = req.body as Record<string, unknown>
  const patch: Record<string, unknown> = { ...body }
  if (typeof patch.apiKey === 'string' && patch.apiKey.includes('••••')) {
    delete patch.apiKey
  }
  if (typeof patch.apiKey === 'string' && patch.apiKey.trim() === '') {
    delete patch.apiKey
  }
  const ws = patch.webSearch
  if (ws && typeof ws === 'object' && !Array.isArray(ws)) {
    const key = (ws as { apiKey?: unknown }).apiKey
    if (typeof key === 'string' && (key.includes('••••') || key.trim() === '')) {
      delete (ws as { apiKey?: string }).apiKey
    }
  }
  const next = await saveSettings(patch as Partial<Awaited<ReturnType<typeof loadSettings>>>)
  // ConfigChange — may block applying hooks/settings to session (CC spirit)
  try {
    const cc = await runHooks({
      event: 'ConfigChange',
      config: effectiveHooks(next),
      disabled: next.disableAllHooks === true,
      cwd: next.cwd || process.cwd(),
      input: {
        session_id: 'host',
        cwd: next.cwd || process.cwd(),
        permission_mode: next.permissionMode,
        hook_event_name: 'ConfigChange',
        source: 'host_settings',
        file_path: undefined
      }
    })
    if (cc.blocking) {
      console.warn(
        'ConfigChange hook blocked session apply:',
        cc.blockMessage || 'blocked'
      )
    } else {
      updateHooksConfigForWatcher(
        effectiveHooks(next),
        next.disableAllHooks === true
      )
      initializeFileChangedWatcher({
        cwd: next.cwd || process.cwd(),
        config: effectiveHooks(next),
        disabled: next.disableAllHooks === true,
        permissionMode: next.permissionMode
      })
    }
  } catch (e) {
    console.warn('ConfigChange hook error', e)
    updateHooksConfigForWatcher(
      effectiveHooks(next),
      next.disableAllHooks === true
    )
  }
  // Resync plugins + MCP when settings saved (failures recorded per-server)
  try {
    await resyncPluginsAndMcp(next)
  } catch (e) {
    console.error('plugin/mcp sync failed', e)
  }
  syncElicitationHooksFromSettings(next)
  void lspManager
    .syncFromSettings(next.cwd, next.lspServers, next.lspEnabled)
    .catch((e) => {
      console.error('lsp sync failed', e)
    })
  void initializeSandbox({
    cwd: next.cwd,
    sandbox: next.sandbox,
    permissionRules: next.permissionRules
  }).then((r) => {
    if (!r.ok && next.sandbox?.enabled) {
      console.warn('sandbox:', r.reason)
    }
  })
  res.json(publicSettingsView(next))
})

app.post('/api/sandbox/windows-install', async (_req, res) => {
  if (process.platform !== 'win32') {
    res.status(400).json({ ok: false, error: 'Windows only' })
    return
  }
  try {
    const result = await installWindowsSandbox()
    await resetSandbox()
    const settings = await loadSettings()
    await initializeSandbox({
      cwd: settings.cwd,
      sandbox: settings.sandbox,
      permissionRules: settings.permissionRules
    })
    res.json({ ok: true, result, status: getSandboxStatus() })
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    })
  }
})

app.get('/api/sandbox/onboarding', async (_req, res) => {
  const settings = await loadSettings()
  res.json(getSandboxOnboardingInfo(settings.sandbox))
})

app.post('/api/sandbox/onboarding', async (req, res) => {
  const decision = String(req.body?.decision || '') as
    | 'install'
    | 'never'
    | 'continue'
    | 'exit'
  if (!['install', 'never', 'continue', 'exit'].includes(decision)) {
    res.status(400).json({
      ok: false,
      error: 'decision must be install | never | continue | exit'
    })
    return
  }

  const settings = await loadSettings()

  if (decision === 'continue' || decision === 'exit') {
    res.json({
      ok: true,
      decision,
      onboarding: getSandboxOnboardingInfo(settings.sandbox),
      status: getSandboxStatus()
    })
    return
  }

  if (decision === 'never') {
    const next = await saveSettings({
      sandbox: {
        ...normalizeSandboxSettings(settings.sandbox),
        skipInstallPrompt: true
      }
    })
    res.json({
      ok: true,
      decision,
      onboarding: getSandboxOnboardingInfo(next.sandbox),
      status: getSandboxStatus()
    })
    return
  }

  // install / enable (explicit opt-in)
  try {
    let installResult: unknown
    const depsBefore = getSandboxStatus().dependencies
    if (process.platform === 'win32' && depsBefore.errors.length > 0) {
      installResult = await installWindowsSandbox()
      await resetSandbox()
    }
    const next = await saveSettings({
      sandbox: {
        ...normalizeSandboxSettings(settings.sandbox),
        enabled: true,
        skipInstallPrompt: false
      }
    })
    await initializeSandbox({
      cwd: next.cwd,
      sandbox: next.sandbox,
      permissionRules: next.permissionRules
    })
    const status = getSandboxStatus()
    const onboarding = getSandboxOnboardingInfo(next.sandbox)
    res.json({
      ok: true,
      decision,
      installResult,
      stillNeedsSetup: Boolean(status.enabledInSettings && !status.active),
      onboarding,
      status
    })
  } catch (e) {
    res.status(500).json({
      ok: false,
      decision,
      error: e instanceof Error ? e.message : String(e),
      onboarding: getSandboxOnboardingInfo(settings.sandbox),
      status: getSandboxStatus()
    })
  }
})

app.get('/api/mcp/status', (_req, res) => {
  res.json({
    servers: mcpManager.status(),
    tools: mcpManager.toolDefinitions().map((t) => t.function.name),
    elicitationPending: mcpElicitationBroker.pending()
  })
})

/** S11: start OAuth for a remote MCP server (CC McpAuthTool spirit). */
app.post('/api/mcp/:name/auth/start', async (req, res) => {
  try {
    const result = await mcpManager.startAuth(req.params.name)
    res.status(result.ok ? 200 : 400).json(result)
  } catch (e) {
    res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : String(e)
    })
  }
})

/** S11: OAuth browser callback — state = server name. */
app.get('/api/mcp/oauth/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const err = typeof req.query.error === 'string' ? req.query.error : ''
  if (err) {
    const safe = String(err)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .slice(0, 200)
    res.status(400).type('html').send(
      `<html><body><h1>MCP OAuth failed</h1><p>${safe}</p></body></html>`
    )
    return
  }
  if (!code || !state) {
    res
      .status(400)
      .type('html')
      .send(
        '<html><body><h1>MCP OAuth</h1><p>Missing code or state.</p></body></html>'
      )
    return
  }
  const result = await mcpManager.completeAuth(state, code)
  const title = result.ok ? 'MCP authorized' : 'MCP OAuth incomplete'
  res.type('html').send(
    `<html><body><h1>${title}</h1><p>${result.message}</p><p>You can close this window and return to AckemCode.</p></body></html>`
  )
})

/** S11: reconnect one server (tool merge; does not wipe others). */
app.post('/api/mcp/:name/reconnect', async (req, res) => {
  try {
    const settings = await loadSettings()
    await mcpManager.syncFromSettings(settings.mcpServers)
    const status = await mcpManager.reconnectServer(req.params.name)
    res.json({
      ok: Boolean(status),
      status,
      servers: mcpManager.status(),
      tools: mcpManager.toolDefinitions().map((t) => t.function.name)
    })
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      servers: mcpManager.status()
    })
  }
})

/** S11: respond to MCP elicitation. */
app.post('/api/mcp/elicitation/:id/respond', (req, res) => {
  const action = String(req.body?.action || 'cancel')
  if (action !== 'accept' && action !== 'decline' && action !== 'cancel') {
    res.status(400).json({ ok: false, error: 'action must be accept|decline|cancel' })
    return
  }
  const content =
    req.body?.content && typeof req.body.content === 'object'
      ? req.body.content
      : undefined
  const ok = mcpElicitationBroker.respond(req.params.id, {
    action,
    content
  })
  res.status(ok ? 200 : 404).json({
    ok,
    error: ok ? undefined : 'elicitation not found'
  })
})

app.get('/api/mcp/elicitation/pending', (_req, res) => {
  res.json({ pending: mcpElicitationBroker.pending() })
})

app.post('/api/browser-onboarding/open-store', async (_req, res) => {
  try {
    const r = await openUrlTool({ url: PLAYWRIGHT_MCP_BRIDGE_STORE_URL })
    res.json({ ok: r.ok, output: r.output, url: PLAYWRIGHT_MCP_BRIDGE_STORE_URL })
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      url: PLAYWRIGHT_MCP_BRIDGE_STORE_URL
    })
  }
})

app.post('/api/browser-onboarding/respond', async (req, res) => {
  const requestId = String(req.body?.requestId || '')
  const choice = String(req.body?.choice || '')
  const allowed = new Set([
    'open_store',
    'installed',
    'isolated',
    'later',
    'never'
  ])
  if (!requestId || !allowed.has(choice)) {
    res.status(400).json({ ok: false, error: 'requestId and valid choice required' })
    return
  }
  if (choice === 'open_store') {
    try {
      const r = await openUrlTool({ url: PLAYWRIGHT_MCP_BRIDGE_STORE_URL })
      res.json({ ok: r.ok, keptOpen: true, url: PLAYWRIGHT_MCP_BRIDGE_STORE_URL })
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      })
    }
    return
  }
  const delivered = respondBrowserOnboarding(
    requestId,
    choice as 'installed' | 'isolated' | 'later' | 'never'
  )
  res.json({ ok: delivered, error: delivered ? undefined : 'onboarding not pending' })
})

app.get('/api/lsp/status', (_req, res) => {
  res.json({
    enabled: lspManager.isEnabled(),
    connected: lspManager.isConnected(),
    servers: lspManager.status()
  })
})

app.post('/api/mcp/reconnect', async (_req, res) => {
  try {
    const settings = await loadSettings()
    const servers = await mcpManager.syncFromSettings(settings.mcpServers)
    res.json({
      ok: true,
      servers,
      tools: mcpManager.toolDefinitions().map((t) => t.function.name)
    })
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      servers: mcpManager.status()
    })
  }
})

/** List persisted sessions (newest first). */
app.get('/api/sessions', async (_req, res) => {
  const items = await listSessions()
  res.json({ sessions: items })
})

/** Create new session, or resume `{ sessionId }` from memory/disk. */
app.post('/api/session', async (req, res) => {
  const body = (req.body || {}) as {
    sessionId?: string
    cwd?: string
    permissionMode?: PermissionMode
  }
  const want = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const session = await getOrCreateSession(want || undefined)
  if (typeof body.cwd === 'string' && body.cwd.trim()) {
    session.runtimeCwd = path.resolve(body.cwd.trim())
  } else if (!session.runtimeCwd) {
    session.runtimeCwd = process.cwd()
  }
  if (
    body.permissionMode === 'default' ||
    body.permissionMode === 'plan' ||
    body.permissionMode === 'acceptEdits' ||
    body.permissionMode === 'auto' ||
    body.permissionMode === 'bypassPermissions' ||
    body.permissionMode === 'dontAsk'
  ) {
    session.mode = body.permissionMode
  }
  const restored = Boolean(want && session.id === want && session.history.length > 0)
  res.json({
    sessionId: session.id,
    restored,
    mode: session.mode,
    todos: session.todos,
    historyLength: session.history.length,
    cwd: session.runtimeCwd || null
  })
})

/** Full snapshot for UI hydrate / debug (loads disk if needed). */
app.get('/api/session/:id', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  res.json({
    sessionId: session.id,
    mode: session.mode,
    todos: session.todos,
    tasks: session.taskStore.listForTool(),
    history: session.history,
    personaSlot: session.personaSlot,
    lastW3: session.lastW3,
    cronJobs: session.cron.list().map((j) => ({
      id: j.id,
      cron: j.cron,
      prompt: j.prompt,
      recurring: j.recurring,
      durable: Boolean(j.durable),
      humanSchedule: j.humanSchedule,
      nextRunAt: j.nextRunAt,
      lastFiredAt: j.lastFiredAt ?? null,
      fireCount: j.fireCount
    })),
    cronNextFireAt: session.cron.getNextFireTime(),
    cronSchedulerRunning: session.cronScheduler.isRunning(),
    runtimeCwd: session.runtimeCwd || null
  })
})

/** M21: inject companion persona short summary (does not override grounding). */
app.put('/api/session/:id/persona', async (req, res) => {
  const session = await getOrCreateSession(req.params.id)
  const text = typeof req.body?.text === 'string' ? req.body.text : ''
  session.personaSlot = text.trim().slice(0, 4000)
  res.json({ ok: true, personaSlot: session.personaSlot })
})

app.get('/api/session/:id/persona', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  res.json({ personaSlot: session.personaSlot })
})

/** M21: build + store W3 companion summary (session end / deliver). */
app.post('/api/session/:id/w3-summary', async (req, res) => {
  const session = await getOrCreateSession(req.params.id)
  const settings = await loadSettings()
  const statusHint = req.body?.status as W3Summary['status'] | undefined
  const summary = buildW3Summary({
    sessionId: session.id,
    cwd: session.runtimeCwd || settings.cwd,
    history: session.history,
    todos: session.todos,
    verifyEvidence: session.lastVerifyEvidence,
    planItemCount: session.taskStore.list().length,
    planVerifyEvidence: session.lastPlanVerifyEvidence,
    statusHint:
      statusHint === '进行中' || statusHint === '已交付' || statusHint === '卡住'
        ? statusHint
        : undefined
  })
  session.lastW3 = summary
  session.sseEmit?.({ type: 'w3_summary', summary })
  res.json({ ok: true, summary })
})

app.get('/api/session/:id/w3', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  res.json({ summary: session.lastW3 })
})

/** Session cron list + poll due (host may re-chat with prompts). */
app.get('/api/session/:id/cron', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  res.json({
    jobs: session.cron.list(),
    nextFireAt: session.cron.getNextFireTime(),
    schedulerRunning: session.cronScheduler.isRunning()
  })
})

app.post('/api/session/:id/cron/poll', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  // GM-CRON: unified deliver path (same as scheduler / turn-end)
  const { due, queued } = deliverDueCronJobs({
    store: session.cron,
    messageQueue: session.messageQueue
  })
  if (due.length) {
    session.sseEmit?.({ type: 'cron_due', jobs: due })
    for (const item of queued) {
      session.sseEmit?.({
        type: 'message_queued',
        id: item.id,
        text: item.text,
        queueLength: session.messageQueue.length,
        priority: item.priority,
        mode: item.mode
      })
    }
    if (queued.length && !session.turnRunning) {
      scheduleIdleQueuePump(session)
    }
  }
  res.json({
    due,
    queued: queued.map((q) => q.id),
    nextFireAt: session.cron.getNextFireTime()
  })
})

app.post('/api/session/:id/clear', async (req, res) => {
  const id = req.params.id
  const session = await getSession(id)
  if (session) {
    try {
      const settings = await loadSettings()
      await runHooks({
        event: 'SessionEnd',
        config: effectiveHooks(settings),
        disabled: settings.disableAllHooks === true,
        cwd: settings.cwd || process.cwd(),
        input: {
          session_id: id,
          cwd: settings.cwd || process.cwd(),
          permission_mode: session.mode,
          hook_event_name: 'SessionEnd',
          reason: 'clear'
        }
      })
    } catch {
      /* never block clear */
    }
    session.history = []
    session.permissions = new PermissionBroker()
    session.interactions = new InteractionBroker()
    session.mode = 'default'
    session.todos = []
    session.readFileState = createReadFileState()
    session.worktree = null
    session.runtimeCwd = undefined
    session.personaSlot = ''
    session.lastW3 = null
    session.lastVerifyEvidence = null
    session.lastPlanVerifyEvidence = null
    session.cronScheduler.stop()
    // R9: clear only session jobs; durable jobs stay on disk and rehydrate
    session.cron = new SessionCronStore()
    await session.cron.hydrateDurable().catch(() => 0)
    session.cronScheduler = new SessionCronScheduler()
    await clearFileHistoryPersistence(id)
    session.fileHistory = new FileHistory(id)
    session.messageQueue = new SessionMessageQueue()
    await clearAgentPersistence(id)
    await clearTaskPersistence(id)
    session.agentRegistry = new AgentRegistry(id)
    session.taskStore = new TaskStore(id)
    session.backgroundAgents = new BackgroundAgentHub()
    bindBackgroundHub(session)
    bindCronScheduler(session)
    session.planExploreCount = 0
    session.planExploreFoci = []
    planBridgeFor(session, await loadSettings()).clearPlanSession()
    Object.assign(session, newPlanSessionFields())
    session.turnRunning = false
    session.abort?.abort()
    session.abort = undefined
  }
  await deleteSession(id)
  res.json({ ok: true })
})

app.get('/api/session/:id/file-history', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  res.json({
    snapshots: session.fileHistory.listSnapshots(),
    latestMessageId: session.fileHistory.latestMessageId() ?? null
  })
})

app.post('/api/session/:id/rewind', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  const body = (req.body ?? {}) as { messageId?: string; dryRun?: boolean }
  const messageId =
    body.messageId?.trim() || session.fileHistory.latestMessageId()
  if (!messageId) {
    res.status(400).json({ error: 'no_snapshot', message: 'No file checkpoint yet' })
    return
  }
  try {
    const result = await session.fileHistory.rewind(messageId, {
      dryRun: body.dryRun === true
    })
    if (!result.ok) {
      res.status(400).json(result)
      return
    }
    // Disk mtimes changed — drop stale read-before-write entries so the next
    // Write/Edit is not blocked by "modified since read".
    if (!result.dryRun) {
      for (const p of result.filesChanged) {
        session.readFileState.clear(p)
      }
    }
    const event: AgentEvent = {
      type: 'files_rewound',
      messageId: result.messageId,
      filesChanged: result.filesChanged,
      dryRun: result.dryRun
    }
    session.sseEmit?.(event)
    res.json(result)
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    })
  }
})

app.post('/api/session/:id/permission', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  const { requestId, decision, toolName, message } = req.body as {
    requestId?: string
    decision?: PermissionDecisionKind
    toolName?: string
    message?: string
  }
  if (!requestId || !decision) {
    res.status(400).json({ error: 'requestId and decision required' })
    return
  }
  let persistedRule: string | undefined
  let persistError: string | undefined
  if (decision === 'allow_always') {
    // This CLI process only — do not persist to settings.
    session.permissions.rememberSession(ALWAYS_ALLOW_REGULAR_TOOLS_RULE)
  } else if (decision === 'allow_session' && typeof toolName === 'string' && toolName.trim()) {
    session.permissions.rememberSession(toolName.trim())
  }
  const ok = session.permissions.resolve(requestId, {
    decision,
    message: typeof message === 'string' ? message : undefined
  })
  if (ok && decision === 'allow_session' && typeof toolName === 'string' && toolName.trim()) {
    session.permissions.resolveCoveredPending(requestId, 'type', toolName.trim())
  } else if (ok && decision === 'allow_always') {
    session.permissions.resolveCoveredPending(
      requestId,
      'window',
      typeof toolName === 'string' ? toolName : '*'
    )
  }
  res.json({ ok, persistedRule, persistError })
})

app.post('/api/session/:id/ask-answer', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  const { requestId, answers, annotations, cancelled } = req.body as {
    requestId?: string
    answers?: Record<string, string>
    annotations?: Record<string, { preview?: string; notes?: string }>
    cancelled?: boolean
  }
  if (!requestId) {
    res.status(400).json({ error: 'requestId required' })
    return
  }
  if (cancelled) {
    const ok = session.interactions.resolve(requestId, { answers: {}, cancelled: true })
    res.json({ ok })
    return
  }
  if (!answers || typeof answers !== 'object') {
    res.status(400).json({ error: 'requestId and answers required' })
    return
  }
  const ok = session.interactions.resolve(requestId, {
    answers,
    annotations:
      annotations && typeof annotations === 'object' ? annotations : undefined,
    cancelled: false
  })
  res.json({ ok })
})

app.post('/api/session/:id/plan-decision', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  const { requestId, decision, mode, message, plan, planWasEdited, rejectAction } =
    req.body as {
      requestId?: string
      decision?: 'approve' | 'reject'
      mode?: PermissionMode
      message?: string
      plan?: string
      planWasEdited?: boolean
      rejectAction?: 'keep_planning' | 'exit_to_default'
    }
  if (!requestId || (decision !== 'approve' && decision !== 'reject')) {
    res.status(400).json({ error: 'requestId and decision (approve|reject) required' })
    return
  }
  const ok = session.interactions.resolve(requestId, {
    decision,
    mode,
    message: typeof message === 'string' ? message : undefined,
    plan: typeof plan === 'string' ? plan : undefined,
    planWasEdited: planWasEdited === true,
    rejectAction:
      rejectAction === 'exit_to_default' || rejectAction === 'keep_planning'
        ? rejectAction
        : undefined
  })
  res.json({ ok })
})

/** D-01 — CLI /plan preview: read plan file for session. */
app.get('/api/session/:id/plan', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  const settings = await loadSettings()
  const cwd = session.runtimeCwd || settings.cwd || process.cwd()
  const { readPlan, getPlanFilePath } = await import('./plans/plans.js')
  const content = await readPlan(session.id, settings, cwd)
  const planPath = getPlanFilePath(session.id, settings, cwd)
  res.json({ path: planPath, content, empty: !content.trim() })
})

/** D-01 — save plan body from CLI in-box editor. */
app.put('/api/session/:id/plan', async (req, res) => {
  const session = await getOrCreateSession(req.params.id)
  const settings = await loadSettings()
  const cwd = session.runtimeCwd || settings.cwd || process.cwd()
  const content = typeof req.body?.content === 'string' ? req.body.content : ''
  const { writePlan } = await import('./plans/plans.js')
  const fp = await writePlan(session.id, settings, cwd, content)
  session.planFileExists = content.trim().length > 0
  session.sseEmit?.({
    type: 'plan_file_updated',
    planFilePath: fp,
    chars: content.length
  })
  await persist(session)
  res.json({ ok: true, path: fp, chars: content.length })
})

app.post('/api/session/:id/model', async (req, res) => {
  const session = await getOrCreateSession(req.params.id)
  const { model, persist: writeSettings } = req.body as {
    model?: string
    persist?: boolean
  }
  if (!model || typeof model !== 'string') {
    res.status(400).json({ error: 'model required' })
    return
  }
  const standalone = await loadStandaloneSettings()
  const entry = findRegisteredModel(standalone.registeredModels, model)
  if (!entry) {
    res.status(400).json({
      error: 'model_not_registered',
      message: `模型「${model}」未注册。请先用 /setup 测试通过后再切换。`
    })
    return
  }
  session.sessionModel = model
  if (writeSettings) {
    const next = await saveSettings({
      model: entry.model,
      apiBaseUrl: entry.apiBaseUrl,
      apiKey: entry.apiKey,
      contextWindow: entry.contextWindow
    })
    await saveStandaloneSettings({
      model: entry.model,
      apiBaseUrl: entry.apiBaseUrl,
      apiKey: entry.apiKey,
      contextWindow: entry.contextWindow
    })
    session.sseEmit?.({
      type: 'settings_changed',
      changed: ['model', 'contextWindow'],
      hasApiKey: Boolean(next.apiKey),
      settings: {
        model: next.model,
        contextWindow: next.contextWindow
      }
    })
  }
  await persist(session)
  res.json({ ok: true, model, persist: Boolean(writeSettings) })
})

/** Runtime mode cycle (CC Shift+Tab spirit) — does not persist settings. */
app.post('/api/session/:id/mode', async (req, res) => {
  const session = await getOrCreateSession(req.params.id)
  const settings = await loadSettings()
  const prev = session.mode
  const { mode, cycle } = req.body as { mode?: PermissionMode; cycle?: boolean }
  let next: PermissionMode = session.mode
  if (cycle) {
    const { getNextPermissionMode } = await import('../shared/types.js')
    next = getNextPermissionMode(session.mode)
  } else if (
    mode === 'default' ||
    mode === 'plan' ||
    mode === 'acceptEdits' ||
    mode === 'auto' ||
    mode === 'bypassPermissions' ||
    mode === 'dontAsk'
  ) {
    next = mode
  } else {
    res.status(400).json({ error: 'mode or cycle required' })
    return
  }
  await planBridgeFor(session, settings).transitionModeManual(prev, next)
  await persist(session)
  session.sseEmit?.({ type: 'mode_changed', mode: session.mode })
  res.json({ ok: true, mode: session.mode })
})

app.post('/api/session/:id/abort', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.json({ ok: true })
    return
  }
  const body = (req.body || {}) as { restoreInput?: boolean; rewind?: boolean }
  const cancelledPermissions = session.permissions.cancelAll('aborted')
  const cancelledInteractions = session.interactions.cancelAll('aborted')
  let restoredUserText: string | undefined
  let rewound = false
  let filesChanged: string[] | undefined
  if (body.restoreInput && session.currentTurnUserText) {
    restoredUserText = session.currentTurnUserText
  }
  if (body.rewind && session.turnStartMessageId) {
    try {
      const result = await session.fileHistory.rewind(session.turnStartMessageId)
      if (result.ok) {
        rewound = true
        filesChanged = result.filesChanged
        session.sseEmit?.({
          type: 'files_rewound',
          messageId: session.turnStartMessageId,
          filesChanged: result.filesChanged,
          dryRun: false
        })
      }
    } catch {
      /* rewind best-effort */
    }
  }
  const ack = {
    type: 'abort_ack' as const,
    cancelledPermissions,
    cancelledInteractions,
    restoredUserText,
    rewound,
    filesChanged
  }
  session.sseEmit?.(ack)
  session.abort?.abort()
  res.json({ ok: true, abort_ack: ack })
})

app.get('/api/session/:id/todos', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  res.json({ todos: session.todos })
})

function emitQueueUpdated(session: Session): void {
  const items = session.messageQueue.peekAll()
  session.sseEmit?.({
    type: 'queue_updated',
    items: items.map((i) => ({
      id: i.id,
      text: i.text,
      priority: i.priority,
      mode: i.mode
    }))
  })
}

const PERMISSION_MODES: PermissionMode[] = [
  'default',
  'plan',
  'acceptEdits',
  'auto',
  'bypassPermissions',
  'dontAsk'
]

app.get('/api/session/:id/queue', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  res.json({
    turnRunning: session.turnRunning,
    items: session.messageQueue.peekAll()
  })
})

/** Clear entire queue (CC clearCommandQueue). */
app.post('/api/session/:id/queue/clear', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  const removed = session.messageQueue.clear()
  emitQueueUpdated(session)
  res.json({ ok: true, removed: removed.length })
})

/** Reorder queue by id list. */
app.post('/api/session/:id/queue/reorder', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  const ids = (req.body as { ids?: string[] })?.ids
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: 'ids array required' })
    return
  }
  const items = session.messageQueue.reorder(ids.map(String))
  emitQueueUpdated(session)
  res.json({ ok: true, items })
})

/** Remove one queued item. */
app.delete('/api/session/:id/queue/:itemId', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  const removed = session.messageQueue.removeByIds([req.params.itemId])
  if (!removed.length) {
    res.status(404).json({ error: 'item not found' })
    return
  }
  emitQueueUpdated(session)
  res.json({ ok: true, removed: removed[0] })
})

/** Change priority (setting to now while running → interrupt). */
app.patch('/api/session/:id/queue/:itemId', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  const priority = (req.body as { priority?: QueuePriority })?.priority
  if (priority !== 'now' && priority !== 'next' && priority !== 'later') {
    res.status(400).json({ error: 'priority must be now|next|later' })
    return
  }
  const item = session.messageQueue.setPriority(req.params.itemId, priority)
  if (!item) {
    res.status(404).json({ error: 'item not found' })
    return
  }
  let interrupted = false
  if (priority === 'now' && session.turnRunning && session.abort) {
    session.abort.abort('interrupt')
    interrupted = true
  }
  emitQueueUpdated(session)
  res.json({ ok: true, item, interrupted })
})

app.post('/api/session/:id/retry-last-turn', async (req, res) => {
  const session = await getOrCreateSession(req.params.id)
  const body = req.body as {
    text?: string
    attachments?: Array<{
      path: string
      kind: 'file' | 'dir' | 'image'
      source?: 'workbench_chip' | 'workbench_open'
    }>
  }
  if (!body.text?.trim()) {
    res.status(400).json({ error: 'text required' })
    return
  }
  if (session.turnRunning) {
    res.status(409).json({ error: 'busy', message: 'Session is running' })
    return
  }
  const { prepareRetryLastTurnHistory } = await import('./agent/retryLastTurn.js')
  const prep = prepareRetryLastTurnHistory(session.history)
  if (!prep.ok) {
    res.status(400).json({ error: prep.code, message: prep.error })
    return
  }
  const snapId = session.turnStartMessageId
  if (!snapId) {
    res.status(400).json({
      error: 'no_snapshot',
      message: 'No file checkpoint for the last turn'
    })
    return
  }
  try {
    const rewind = await session.fileHistory.rewind(snapId)
    if (!rewind.ok) {
      res.status(400).json(rewind)
      return
    }
    if (!rewind.dryRun && rewind.filesChanged.length) {
      for (const p of rewind.filesChanged) session.readFileState.clear(p)
    }
    session.history = prep.history
    await persist(session)
    ;(req as express.Request & { retryRewound?: { messageId: string; filesChanged: string[] } }).retryRewound = {
      messageId: rewind.messageId,
      filesChanged: rewind.filesChanged
    }
    req.body = { text: body.text.trim(), attachments: body.attachments }
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : String(e)
    })
    return
  }
  return handleSessionChat(req, res)
})

const handleSessionChat = async (req: express.Request, res: express.Response) => {
  const session = await getOrCreateSession(req.params.id)
  const retryRewound = (
    req as express.Request & {
      retryRewound?: { messageId: string; filesChanged: string[] }
    }
  ).retryRewound
  const body = req.body as {
    text?: string
    priority?: QueuePriority
    mode?: QueueMode
    attachments?: Array<{
      path: string
      kind: 'file' | 'dir' | 'image'
      source?: 'workbench_chip' | 'workbench_open'
    }>
  }
  if (!body.text?.trim()) {
    res.status(400).json({ error: 'text required' })
    return
  }

  const trimmed = body.text.trim()
  const priority: QueuePriority =
    body.priority === 'now' || body.priority === 'later' ? body.priority : 'next'
  const mode = body.mode

  // S07: mid-turn enqueue (CC message queue). priority=now → interrupt.
  if (session.turnRunning && !retryRewound) {
    try {
      const item = session.messageQueue.enqueue(trimmed, { priority, mode })
      let interrupted = false
      if (item.priority === 'now' && session.abort) {
        session.abort.abort('interrupt')
        interrupted = true
      }
      const event: AgentEvent = {
        type: 'message_queued',
        id: item.id,
        text: item.text,
        queueLength: session.messageQueue.length,
        priority: item.priority,
        mode: item.mode,
        interrupted
      }
      session.sseEmit?.(event)
      res.json({
        ok: true,
        queued: true,
        id: item.id,
        text: item.text,
        queueLength: session.messageQueue.length,
        priority: item.priority,
        mode: item.mode,
        interrupted
      })
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : String(e)
      })
    }
    return
  }

  // Claim turn before any await — prevents concurrent /chat double-start.
  session.turnRunning = true

  if (!(await standaloneConfigured())) {
    session.turnRunning = false
    res.status(400).json({
      error: 'llm_not_configured',
      message: 'No standalone API key. Run /setup or PUT /api/settings/standalone.'
    })
    return
  }

  const settings = await loadSettings()
  session.abort?.abort()
  session.abort = new AbortController()

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const send = (event: AgentEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  session.sseEmit = send
  if (retryRewound) {
    send({
      type: 'files_rewound',
      messageId: retryRewound.messageId,
      filesChanged: retryRewound.filesChanged,
      dryRun: false
    })
  }
  // S11: elicitations from any MCP server reach the active chat stream
  mcpElicitationBroker.setEmit((ev) => {
    send(ev)
  })
  {
    const s = await loadSettings()
    syncElicitationHooksFromSettings(
      {
        hooks: s.hooks,
        disableAllHooks: s.disableAllHooks,
        cwd: session.runtimeCwd || s.cwd || process.cwd(),
        permissionMode: session.mode
      },
      session.id
    )
  }
  let clientClosed = false

  req.on('close', () => {
    clientClosed = true
    session.abort?.abort()
    session.permissions.cancelAll('client_closed')
    session.interactions.cancelAll('client_closed')
    if (session.sseEmit === send) session.sseEmit = undefined
    mcpElicitationBroker.setEmit(null)
  })

  const emitDequeued = (
    items: Array<{ id: string; text: string; mode: QueueMode }>
  ) => {
    for (const item of items) {
      send({
        type: 'message_dequeued',
        id: item.id,
        text: item.text,
        remaining: session.messageQueue.length,
        mode: item.mode
      })
    }
  }

  try {
    if (session.mode === 'default') {
      session.mode = settings.permissionMode
    }
    if (!session.runtimeCwd) session.runtimeCwd = settings.cwd

    // If leftover queue exists (or forced slash/task mode), enqueue opening text
    // and let between-turn processor order by priority (CC useQueueProcessor).
    let nextUserText: string | null = trimmed
    let pendingHostAttachments = body.attachments?.length
      ? body.attachments
      : undefined
    if (
      !retryRewound &&
      (session.messageQueue.length > 0 ||
        mode === 'task-notification' ||
        mode === 'slash')
    ) {
      session.messageQueue.enqueue(trimmed, { priority, mode })
      nextUserText = null
      pendingHostAttachments = undefined
    }

    // CC useQueueProcessor: chain turns while queue has work
    let guard = 0
    let agentTurnRan = false
    const MAX_CHAIN = 32
    // S07: keep draining interrupt queue even if SSE client disconnects early.
    while (guard < MAX_CHAIN) {
      guard += 1

      if (!nextUserText) {
        const batch = session.messageQueue.takeBetweenTurnBatch(
          isMainSessionQueueItem
        )
        if (!batch.length) break

        if (batch[0]!.mode === 'slash') {
          const cmd = batch[0]!
          emitDequeued([cmd])
          const slash = await handleSlashCommand(
            cmd.text,
            buildSlashContext(session, settings)
          )
          send({ type: 'status', message: slash.message })
          if (slash.followUpUserText) {
            nextUserText = slash.followUpUserText
            continue
          }
          nextUserText = null
          continue
        }

        emitDequeued(batch)
        nextUserText = formatQueueBatchUserText(batch)
      }

      // Fresh controller after interrupt abort so chained turns can run
      if (!session.abort || session.abort.signal.aborted) {
        session.abort = new AbortController()
      }
      const controller = session.abort

      send({ type: 'session_state', state: 'running' })
      session.currentTurnUserText = nextUserText
      const snapId = nanoid()
      try {
        await session.fileHistory.makeSnapshot(snapId)
        session.turnStartMessageId = snapId
      } catch {
        session.turnStartMessageId = session.fileHistory.latestMessageId()
      }
      agentTurnRan = true
      const hostAttachments = pendingHostAttachments
      pendingHostAttachments = undefined
      const history = await runAgentTurn({
        settings: {
          ...settings,
          cwd: session.runtimeCwd || settings.cwd,
          model: session.sessionModel || settings.model
        },
        history: session.history,
        userText: nextUserText,
        hostAttachments,
        permissions: session.permissions,
        interactions: session.interactions,
        readFileState: session.readFileState,
        getMode: () => session.mode,
        setMode: (m) => {
          session.mode = m
        },
        getTodos: () => session.todos,
        setTodos: (todos) => {
          session.todos = todos
        },
        getCwd: () => session.runtimeCwd || settings.cwd,
        setCwd: (cwd) => {
          session.runtimeCwd = cwd
        },
        getWorktree: () => session.worktree,
        setWorktree: (w) => {
          session.worktree = w
        },
        getCron: () => session.cron,
        personaSlot: session.personaSlot,
        sessionId: session.id,
        fileHistory: session.fileHistory,
        messageQueue: session.messageQueue,
        agentRegistry: session.agentRegistry,
        backgroundAgents: session.backgroundAgents,
        taskStore: session.taskStore,
        getPlanExploreCount: () => session.planExploreCount,
        notePlanExplore: (focus?: string) => {
          session.planExploreCount += 1
          const f = focus?.trim()
          if (f) {
            const key = f.toLowerCase()
            if (
              !session.planExploreFoci.some((x) => x.toLowerCase() === key)
            ) {
              session.planExploreFoci.push(f)
            }
          }
        },
        resetPlanExplore: () => {
          session.planExploreCount = 0
          session.planExploreFoci = []
        },
        getPlanExploreFoci: () => [...session.planExploreFoci],
        noteVerifyEvidence: (ev) => {
          session.lastVerifyEvidence = ev
        },
        notePlanVerifyEvidence: (ev) => {
          session.lastPlanVerifyEvidence = ev
        },
        ...planRunAgentOpts(session, settings, send),
        emit: send,
        signal: controller.signal,
        abortController: controller,
        recordSnip: (record) => {
          session.snipRecords.push(record)
        },
        recordCollapseCommits: (commits) => {
          session.collapseCommits = mergeCollapseCommits(
            session.collapseCommits,
            commits
          )
        }
      })
      session.history = history
      await persist(session)
      nextUserText = null

      if (clientClosed && !session.messageQueue.length) break
      // Continue loop to drain between-turn queue (incl. after interrupt)
    }

    if (!clientClosed && !agentTurnRan) {
      send({ type: 'session_state', state: 'idle' })
      send({ type: 'done', ok: true })
    }
  } catch (e) {
    send({
      type: 'error',
      message: e instanceof Error ? e.message : String(e)
    })
    send({ type: 'done', ok: false })
  } finally {
    session.turnRunning = false
    if (session.sseEmit === send) session.sseEmit = undefined
    res.end()
    // S07: await idle drain so turnRunning settles before clients poll (no setImmediate race).
    if (session.messageQueue.length) {
      await pumpIdleSessionQueue(session)
    }
  }
}

app.post('/api/session/:id/chat', handleSessionChat)

app.get('/api/session/:id/background', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  res.json({ agents: session.backgroundAgents.list() })
})

app.post('/api/session/:id/background/:agentId/kill', async (req, res) => {
  const session = await getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }
  const ok = session.backgroundAgents.kill(req.params.agentId)
  res.json({
    ok,
    agent: session.backgroundAgents.get(req.params.agentId) ?? null
  })
})

app.get('/api/meta/permission-modes', (_req, res) => {
  const modes: PermissionMode[] = [
    'default',
    'plan',
    'acceptEdits',
    'auto',
    'bypassPermissions',
    'dontAsk'
  ]
  res.json({ modes })
})

app.get('/api/skills', async (_req, res) => {
  const settings = await loadSettings()
  const meta = await loadSkillsDetailed({
    cwd: settings.cwd,
    useClaudeSkills: settings.useClaudeSkills,
    extraSkillDirs: settings.extraSkillDirs
  })
  res.json({
    count: meta.skills.length,
    ackemSkillsHome: ackemSkillsHome(),
    catalog: SKILL_CATALOG,
    roots: defaultSkillRoots({
      cwd: settings.cwd,
      useClaudeSkills: settings.useClaudeSkills,
      extraSkillDirs: settings.extraSkillDirs
    }).map((r) => ({ path: r.root, source: r.source })),
    skills: toCatalogRows(meta.skills),
    overrides: meta.overrides,
    validationIssues: meta.validationIssues
  })
})

app.delete('/api/skills/:name', async (req, res) => {
  const name = String(req.params.name || '').trim()
  if (!name) {
    res.status(400).json({ ok: false, error: 'skill name required' })
    return
  }
  const scopeRaw = String(req.query.scope || 'auto')
  const scope =
    scopeRaw === 'user' || scopeRaw === 'project' ? scopeRaw : 'auto'
  const settings = await loadSettings()
  const result = await uninstallSkill(name, {
    scope,
    cwd: settings.cwd
  })
  if (!result.ok) {
    res.status(404).json(result)
    return
  }
  res.json(result)
})

app.post('/api/skills/install', async (req, res) => {
  const body = req.body as {
    spec?: string
    sourcePath?: string
    skillName?: string
    scope?: 'user' | 'project'
    /** When true (or URL install fails), fetch page and pick install links */
    discover?: boolean
  }
  const spec = (body.spec || body.sourcePath || '').trim()
  if (!spec) {
    res.status(400).json({
      ok: false,
      error: 'spec required (GitHub owner/repo, URL, zip, local path, or intro page)'
    })
    return
  }
  const settings = await loadSettings()
  const scope = body.scope === 'project' ? 'project' : 'user'
  const skillName = body.skillName
  let result = await installSkillFromSpec(spec, {
    skillName,
    scope,
    cwd: settings.cwd
  })

  const wantDiscover =
    body.discover === true ||
    (!result.ok && /^https?:\/\//i.test(spec))
  if (wantDiscover && !result.ok && /^https?:\/\//i.test(spec)) {
    let parsedKind: string | null = null
    try {
      parsedKind = parseInstallSpec(spec).kind
    } catch {
      parsedKind = null
    }
    if (
      body.discover === true ||
      parsedKind === 'git' ||
      parsedKind === 'github' ||
      parsedKind === null
    ) {
      const discovered = await discoverSkillInstallSpecs(spec)
      if (!discovered.ok) {
        res.status(400).json({
          ok: false,
          error: `${result.error}\nPage discover failed: ${discovered.error}`
        })
        return
      }
      if (!discovered.specs.length) {
        res.status(400).json({
          ok: false,
          error: `Direct install failed: ${result.error}. No install links on page.`,
          markdownExcerpt: discovered.markdownExcerpt.slice(0, 1500)
        })
        return
      }
      if (discovered.specs.length > 1 && !skillName) {
        res.json({
          ok: true,
          needsChoice: true,
          candidates: discovered.specs,
          message:
            'Intro page fetched. Multiple install candidates — pick one and POST again with that spec (or skillName).'
        })
        return
      }
      const chosen = skillName
        ? discovered.specs.find((s) => s.includes(skillName)) ||
          discovered.specs[0]!
        : discovered.specs[0]!
      result = await installSkillFromSpec(chosen, {
        skillName,
        scope,
        cwd: settings.cwd
      })
      if (!result.ok) {
        res.status(400).json({
          ...result,
          candidates: discovered.specs,
          tried: chosen
        })
        return
      }
      result = { ...result, source: `${spec} → ${chosen}` }
    }
  }

  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

const clientDist = path.resolve(__dirname, '../../dist/client')
app.use(express.static(clientDist))

app.listen(PORT, () => {
  console.log(`AckemCode daemon http://127.0.0.1:${PORT}`)
  void loadSettings()
    .then(async (s) => {
      initializeFileChangedWatcher({
        cwd: s.cwd || process.cwd(),
        config: effectiveHooks(s),
        disabled: s.disableAllHooks === true,
        permissionMode: s.permissionMode
      })
      await refreshPluginAugmentation(s.cwd || process.cwd())
      const status = await mcpManager.syncFromSettings(
        getEffectiveMcpServers(s.mcpServers ?? {}, s.cwd || process.cwd())
      )
      if (status.length) {
        console.log(
          'MCP:',
          status.map((x) => `${x.name}=${x.state}(${x.toolCount} tools)`).join(', ')
        )
      }
      await lspManager.syncFromSettings(s.cwd, s.lspServers, s.lspEnabled)
      if (lspManager.isEnabled()) {
        console.log(
          'LSP:',
          lspManager.status().map((x) => `${x.name}[${x.extensions.join(',')}]`).join(', ') ||
            '(no servers configured)'
        )
      }
      let sandboxSettings = s.sandbox
      const deps = checkSandboxDependencies()
      if (
        !sandboxSettings?.enabled &&
        !sandboxSettings?.skipInstallPrompt &&
        isSupportedPlatform() &&
        deps.errors.length === 0
      ) {
        sandboxSettings = { ...sandboxSettings, enabled: true }
        await saveSettings({ sandbox: sandboxSettings })
        console.log('Sandbox: enabled by default (ASRT ready)')
      }
      const sb = await initializeSandbox({
        cwd: s.cwd,
        sandbox: sandboxSettings,
        permissionRules: s.permissionRules
      })
      if (sandboxSettings?.enabled) {
        const why = getSandboxUnavailableReason()
        if (why) console.warn('Sandbox:', why)
        else if (sb.ok) console.log('Sandbox: active (ASRT)')
        else console.warn('Sandbox:', sb.reason)
      }
    })
    .catch((e) => console.error('startup sync failed', e))
})
