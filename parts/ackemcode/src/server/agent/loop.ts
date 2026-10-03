import { nanoid } from 'nanoid'
import type {
  AckemTask,
  AgentEvent,
  ChatMessage,
  AckemCodeSettings,
  PermissionMode,
  ToolCall
} from '../../shared/types.js'
import { flattenMessageContent, mediaFollowUpMessage } from '../../shared/messageContent.js'
import {
  chatCompletion,
  chatCompletionStream,
  formatTurnError,
  isTransientDisconnect,
  LlmError
} from './llm.js'
import { resolveModelMedia } from '../llm/capabilities.js'
import { buildSystemPrompt } from './systemPrompt.js'
import { evaluatePermission, PermissionBroker } from './permissions.js'
import { grantWorkingDirectoryForToolPath } from './filePermissions.js'
import {
  classifyAutoModeAction,
  maybeApplyAutoModeClassifier
} from './autoModeClassifier.js'
import {
  normalizePermissionRules,
  type PermissionRulesConfig
} from './permissionRules.js'
import {
  coercePermissionModeUnderPolicy,
  resolveEffectivePermissionRules
} from './permissionsLoader.js'
import { initializeSandbox } from '../sandbox/index.js'
import { InteractionBroker } from './interactions.js'
import {
  TOOL_DEFINITIONS,
  executeTool,
  filterEnabledTools,
  type ToolContext,
  type ReadFileState
} from '../tools/index.js'
import type { SessionCronStore } from '../tools/cron/cronStore.js'
import { deliverDueCronJobs } from '../tools/cron/cronDeliver.js'
import { partitionToolCalls, mapPool, ABORT_TOOL_RESULT, parseToolArguments } from '../tools/orchestration.js'
import { getMaxToolConcurrency } from '../tools/registry.js'
import {
  StreamingToolExecutor,
  isStreamingToolExecutionEnabled
} from '../tools/streamingToolExecutor.js'
import {
  extractDiscoveredToolNames,
  selectToolsForModel
} from '../tools/toolDeferred.js'
import {
  isWebSearchEnabled,
  pickAutoProvider
} from '../tools/webSearch/index.js'
import {
  TURN_DONE_ERRORS,
  applyMaxTurnsRecovery,
  buildMaxTurnsRecoveryPrompt,
  buildOutputTruncationRecoveryPrompt,
  isOutputTruncated,
  needsToolFollowUp,
  resolveMaxBudgetTokens,
  resolveMaxTurns,
  resolveTurnHardCap,
  shouldRefundBrowserTurn,
  toolCallsUseBrowserMcp
} from './turnControl.js'
import type { LlmRetryOpts } from './llm.js'
import { LlmRetryExhaustedError } from './llmRetry.js'
import { lspManager } from '../lsp/manager.js'
import {
  LspDiagnosticRegistry,
  collectFileDiagnostics,
  editedFileFromToolInput,
  formatLspFeedback
} from '../lsp/passiveFeedback.js'
import type { LspDiagnostic } from '../lsp/types.js'
import { parseShellDiagnostics } from './shellDiagnostics.js'
import { loadSkills } from '../skills/loadSkills.js'
import type { TodoItem } from './todos.js'
import {
  injectQueuedMessages,
  isMainSessionQueueItem,
  type SessionMessageQueue
} from './messageQueue.js'
import {
  createAutoCompactTracking,
  createContentReplacementState,
  isPromptTooLongError,
  MAX_PROMPT_TOO_LONG_RETRIES,
  runCompactPipeline,
  snipOldestToolGroup,
  calculateTokenWarningState,
  formatCompactPressureStatus,
  runPostCompactCleanup,
  estimateMessagesTokens,
  buildPostCompactAttachments,
  type CompactResult
} from './compact/index.js'
import { mcpManager } from '../mcp/index.js'
import type { EffortLevel } from '../../shared/types.js'
import {
  runHooks,
  updateWatchPaths,
  onCwdChangedForHooks,
  type HooksConfig
} from '../hooks/index.js'
import { getEffectiveHooks } from '../plugins/pluginAugment.js'
import {
  filterAndSeedSurfacedMemories,
  startRelevantMemoryPrefetch,
  tryConsumeMemoryPrefetch,
  type MemoryPrefetch
} from '../memdir/prefetch.js'
import {
  createSessionMemoryState,
  formatSessionMemoryResume,
  loadSessionMemory,
  shouldUpdateSessionMemory,
  updateSessionMemory
} from '../memdir/sessionMemory.js'
import {
  effectivePlanExploreAgents,
  filterToolsForAgentTier,
  normalizeAgentTier
} from './agentCollaboration.js'
import { createTokenUsageReporter, emitTokenUsage } from './tokenUsage.js'
import {
  GIT_SNAPSHOT_NUDGE,
  maybeRepoPreflightContinuation,
  shouldGitSnapshotNudge
} from './repoPreflight.js'

export type EmitFn = (event: AgentEvent) => void

function emitDueCron(
  getCron: (() => SessionCronStore) | undefined,
  emit: EmitFn,
  messageQueue?: SessionMessageQueue
): void {
  if (!getCron) return
  // GM-CRON + GM-NOTIFY: single deliver path (poll → queue)
  const { due, queued } = deliverDueCronJobs({
    store: getCron(),
    messageQueue
  })
  if (!due.length) return
  emit({ type: 'cron_due', jobs: due })
  for (const item of queued) {
    emit({
      type: 'message_queued',
      id: item.id,
      text: item.text,
      queueLength: messageQueue?.length ?? 0,
      priority: item.priority,
      mode: item.mode
    })
  }
}

const compactLlmFailsBySession = new Map<string, number>()

async function applyCompact(
  messages: ChatMessage[],
  emit: EmitFn,
  opts: {
    forceFull?: boolean
    llm?: {
      apiBaseUrl: string
      apiKey: string
      model: string
      effort: EffortLevel
    }
    signal?: AbortSignal
    cwd?: string
    sessionId?: string
    tracking?: ReturnType<typeof createAutoCompactTracking>
    replacementState?: ReturnType<typeof createContentReplacementState>
    hooksConfig?: HooksConfig
    hooksDisabled?: boolean
    permissionMode?: string
    /** R3: post-compact reinjection sources (recent files + todos). */
    readFileState?: ReadFileState
    getTodos?: () => TodoItem[]
    /** R4: latest maintained session summary for SM-compact. */
    getSessionSummary?: () => string | null
    settingsContextWindow?: number
    recordCollapseCommits?: (
      commits: import('./compact/contextCollapseCommits.js').ContextCollapseCommit[]
    ) => void
  } = {}
): Promise<ChatMessage[]> {
  let working = messages
  const preCompactMessages = messages
  if (opts.hooksConfig && !opts.hooksDisabled) {
    try {
      const pre = await runHooks({
        event: 'PreCompact',
        config: opts.hooksConfig,
        disabled: opts.hooksDisabled,
        cwd: opts.cwd || process.cwd(),
        signal: opts.signal,
        input: {
          session_id: opts.sessionId || 'session',
          cwd: opts.cwd || process.cwd(),
          permission_mode: opts.permissionMode,
          hook_event_name: 'PreCompact',
          trigger: opts.forceFull ? 'manual' : 'auto',
          custom_instructions: null
        }
      })
      if (pre.additionalContext.length) {
        const instr = pre.additionalContext.join('\n')
        working = [
          ...working,
          {
            role: 'user',
            content: `[PreCompact hook instructions]\n${instr}`
          }
        ]
        emit({
          type: 'status',
          message: 'PreCompact hook injected instructions'
        })
      }
    } catch (e) {
      emit({
        type: 'status',
        message: `PreCompact hook error (ignored): ${e instanceof Error ? e.message : String(e)}`
      })
    }
  }

  // GM-COMPACT: surface pressure before work (CC warning-state spirit)
  const pressure = calculateTokenWarningState(estimateMessagesTokens(working), {
    model: opts.llm?.model
  })
  if (pressure.level !== 'ok' || opts.forceFull) {
    emit({
      type: 'status',
      message: formatCompactPressureStatus(pressure)
    })
  }

  const pipeline = await runCompactPipeline({
    messages: working,
    forceFull: opts.forceFull,
    llm: opts.llm,
    model: opts.llm?.model,
    settingsContextWindow: opts.settingsContextWindow,
    signal: opts.signal,
    cwd: opts.cwd,
    sessionId: opts.sessionId,
    tracking: opts.tracking,
    replacementState: opts.replacementState,
    sessionSummary: opts.getSessionSummary?.() ?? undefined,
    allowSnipOnce: !opts.forceFull,
    onCollapseCommits: (commits) => {
      if (commits.length) opts.recordCollapseCommits?.(commits)
    }
  })
  const result: CompactResult = pipeline.compact
  working = pipeline.messages
  if (pipeline.steps.length) {
    emit({
      type: 'status',
      message: `compact pipeline · ${pipeline.steps.join(' → ')}`
    })
  }
  if (opts.tracking && result.consecutiveFailures != null) {
    opts.tracking.consecutiveFailures = result.consecutiveFailures
  }
  if (result.circuitOpen) {
    emit({
      type: 'status',
      message: `autocompact circuit open (${opts.tracking?.consecutiveFailures ?? 3} failures) — skipping`
    })
    return working
  }
  const sid = opts.sessionId
  if (result.kind === 'full' && result.summaryVia === 'extractive' && opts.llm?.apiKey) {
    if (sid) compactLlmFailsBySession.set(sid, (compactLlmFailsBySession.get(sid) ?? 0) + 1)
  } else if (result.kind === 'full' && result.summaryVia === 'llm') {
    if (sid) compactLlmFailsBySession.set(sid, 0)
  }
  runPostCompactCleanup(result, {
    tracking: opts.tracking,
    summaryVia: result.summaryVia,
    kind: result.kind,
    resetLlmFailCount: () => {
      if (sid) compactLlmFailsBySession.set(sid, 0)
    }
  })
  if (result.kind !== 'none') {
    emit({
      type: 'context_compacted',
      kind: result.kind,
      beforeTokens: result.beforeTokens,
      afterTokens: result.afterTokens,
      truncatedToolResults: result.truncatedToolResults,
      summaryVia: result.summaryVia,
      phase: 'end'
    })
    const via =
      result.kind === 'full' && result.summaryVia
        ? ` · ${result.summaryVia}`
        : ''
    const persist =
      result.persistedToolResults && result.persistedToolResults > 0
        ? ` · persisted ${result.persistedToolResults}`
        : ''
    emit({
      type: 'status',
      message:
        result.kind === 'full'
          ? `context compacted (full${via}${persist}) · ~${result.beforeTokens}→${result.afterTokens} tok`
          : `context compacted (micro) · truncated ${result.truncatedToolResults} tool results${persist}`
    })
    emitTokenUsage(emit, {
      messages: result.messages,
      overrideTokens: result.afterTokens,
      settingsContextWindow: opts.settingsContextWindow,
      model: opts.llm?.model ?? ''
    })
    // PostCompact — observability / context (CC PostCompact spirit)
    if (opts.hooksConfig && !opts.hooksDisabled) {
      try {
        const post = await runHooks({
          event: 'PostCompact',
          config: opts.hooksConfig,
          disabled: opts.hooksDisabled,
          cwd: opts.cwd || process.cwd(),
          signal: opts.signal,
          input: {
            session_id: opts.sessionId || 'session',
            cwd: opts.cwd || process.cwd(),
            permission_mode: opts.permissionMode,
            hook_event_name: 'PostCompact',
            trigger: opts.forceFull ? 'manual' : 'auto',
            compact_summary: `${result.kind} ~${result.beforeTokens}→${result.afterTokens}`
          }
        })
        if (post.additionalContext.length) {
          emit({
            type: 'status',
            message: `PostCompact: ${post.additionalContext.join(' ').slice(0, 200)}`
          })
        }
      } catch {
        /* never block compact */
      }
    }
  } else if (pipeline.steps.includes('collapse')) {
    emitTokenUsage(emit, {
      messages: working,
      settingsContextWindow: opts.settingsContextWindow,
      model: opts.llm?.model ?? ''
    })
  }

  // R3: after a FULL compact, reattach working state (recent files + todos) so
  // the next turn doesn't start blind (CC createPostCompactFileAttachments).
  // Skipped at blocking pressure — no non-essential injection near the window.
  if (result.kind === 'full') {
    try {
      const after = calculateTokenWarningState(
        estimateMessagesTokens(result.messages),
        { model: opts.llm?.model }
      )
      if (!after.isAboveBlockingThreshold) {
        const attachment = await buildPostCompactAttachments({
          readFileState: opts.readFileState,
          getTodos: opts.getTodos,
          recentMessages: preCompactMessages
        })
        if (attachment?.content) {
          const { textAttachment, attachmentsToUserMessage } = await import(
            './attachments/index.js'
          )
          const postAtt = textAttachment({
            kind: 'post_compact',
            source: 'post_compact',
            label: 'post-compact',
            body: flattenMessageContent(attachment.content)
          })
          const postMsg = attachmentsToUserMessage([postAtt])
          if (postMsg) {
            working = [...working, postMsg]
            result.messages = working
            emit({
              type: 'status',
              message: 'post-compact: reattached recent files + todos'
            })
          }
        }
      }
    } catch {
      /* reinjection is best-effort */
    }
  }
  return working
}

function isWebSearchConfigured(settings?: AckemCodeSettings): boolean {
  if (!isWebSearchEnabled()) return false
  const key = settings?.webSearch?.apiKey?.trim()
  if (key && !key.includes('••••')) return true
  return Boolean(
    pickAutoProvider(undefined, settings?.webSearch?.customUrl) ??
      process.env.TAVILY_API_KEY?.trim() ??
      process.env.SERPAPI_API_KEY?.trim() ??
      process.env.BRAVE_API_KEY?.trim()
  )
}

async function prepareCall(
  call: ToolCall,
  opts: {
    getMode: () => PermissionMode
    permissions: PermissionBroker
    rules: PermissionRulesConfig
    emit: EmitFn
    signal?: AbortSignal
    /** User reject bubbles to query abort (CC PermissionContext cancelAndAbort). */
    abortController?: AbortController
    agentId?: string
    parentToolUseId?: string
    hooksConfig?: HooksConfig
    hooksDisabled?: boolean
    cwd: string
    sessionId: string
    planFilePath?: string | null
    planModeInterviewPhase?: boolean
    /** For auto-mode LLM classifier (CC sideQuery spirit). */
    settings?: AckemCodeSettings
    recentMessages?: ChatMessage[]
    /** Test injectable */
    classifyAuto?: typeof classifyAutoModeAction
  }
): Promise<{
  call: ToolCall
  name: string
  parsedInput: unknown
  /** Serialized args after PreToolUse updatedInput (if any). */
  argumentsJson: string
  early?: { ok: boolean; output: string }
}> {
  if (opts.signal?.aborted) throw new Error('aborted')
  const name = call.function.name
  const parsed = parseToolArguments(call.function.arguments || '')
  let parsedInput: unknown = parsed.ok ? parsed.input : {}
  let argumentsJson = call.function.arguments || ''
  const mode = opts.getMode()
  const hookBase = {
    session_id: opts.sessionId,
    cwd: opts.cwd,
    permission_mode: mode
  }

  opts.emit({
    type: 'tool_start',
    id: call.id,
    name,
    input: parsedInput,
    agentId: opts.agentId,
    parentToolUseId: opts.parentToolUseId
  })

  // PreToolUse — before permission UI (CC spirit). Deny rules still win after.
  let preDecision: 'allow' | 'deny' | 'ask' | undefined
  try {
    const pre = await runHooks({
      event: 'PreToolUse',
      config: opts.hooksConfig,
      disabled: opts.hooksDisabled,
      cwd: opts.cwd,
      toolName: name,
      toolInput: parsedInput,
      signal: opts.signal,
      input: {
        ...hookBase,
        hook_event_name: 'PreToolUse',
        tool_name: name,
        tool_input: parsedInput,
        tool_use_id: call.id
      }
    })
    if (pre.updatedInput && typeof parsedInput === 'object' && parsedInput) {
      parsedInput = { ...(parsedInput as object), ...pre.updatedInput }
      argumentsJson = JSON.stringify(parsedInput)
    } else if (pre.updatedInput) {
      parsedInput = pre.updatedInput
      argumentsJson = JSON.stringify(parsedInput)
    }
    preDecision = pre.permissionDecision
    if (pre.blocking || pre.permissionDecision === 'deny') {
      const msg =
        pre.blockMessage ||
        pre.permissionDecisionReason ||
        'PreToolUse hook blocked this tool'
      opts.emit({ type: 'status', message: `hook blocked: ${name}` })
      return {
        call,
        name,
        parsedInput,
        argumentsJson,
        early: { ok: false, output: msg }
      }
    }
  } catch (e) {
    opts.emit({
      type: 'status',
      message: `PreToolUse hook error (ignored): ${e instanceof Error ? e.message : String(e)}`
    })
  }

  const additionalWorkingDirectories =
    opts.permissions.getAdditionalWorkingDirectories()
  let verdict = evaluatePermission({
    toolName: name,
    input: parsedInput,
    mode,
    rules: opts.rules,
    sessionAllows: (t, inp) => opts.permissions.sessionAllows(t, inp),
    sessionToolClassAllows: (t) => opts.permissions.sessionAllowsToolClass(t),
    cwd: opts.cwd,
    additionalWorkingDirectories,
    planFilePath: opts.planFilePath,
    planModeInterviewPhase: opts.planModeInterviewPhase,
    webSearchConfigured: isWebSearchConfigured(opts.settings)
  })

  if (opts.settings) {
    verdict = await maybeApplyAutoModeClassifier(mode === 'auto', verdict, {
      toolName: name,
      input: parsedInput,
      cwd: opts.cwd,
      settings: opts.settings,
      recentMessages: opts.recentMessages,
      signal: opts.signal,
      permissions: opts.permissions,
      onStatus: (message) => opts.emit({ type: 'status', message }),
      classifyAuto: opts.classifyAuto
    })
  }

  // Deny rules always win over PreToolUse allow
  if (verdict.behavior === 'deny') {
    // PermissionDenied — classifier / rule denial (CC PermissionDenied spirit)
    try {
      const pd = await runHooks({
        event: 'PermissionDenied',
        config: opts.hooksConfig,
        disabled: opts.hooksDisabled,
        cwd: opts.cwd,
        toolName: name,
        toolInput: parsedInput,
        signal: opts.signal,
        input: {
          ...hookBase,
          hook_event_name: 'PermissionDenied',
          tool_name: name,
          tool_input: parsedInput,
          tool_use_id: call.id,
          reason: verdict.reason
        }
      })
      if (pd.permissionDeniedRetry) {
        opts.emit({
          type: 'status',
          message: `PermissionDenied hook suggests retry: ${name}`
        })
        return {
          call,
          name,
          parsedInput,
          argumentsJson,
          early: {
            ok: false,
            output: `${verdict.reason}\n(Hook suggests you may retry with a safer approach.)`
          }
        }
      }
    } catch {
      /* ignore */
    }
    return {
      call,
      name,
      parsedInput,
      argumentsJson,
      early: { ok: false, output: verdict.reason }
    }
  }

  let needAsk = verdict.behavior === 'ask'
  if (preDecision === 'allow' && needAsk) {
    needAsk = false
  }
  if (preDecision === 'ask') {
    needAsk = true
  }

  if (needAsk) {
    // PermissionRequest hooks may auto allow/deny before UI
    try {
      const pr = await runHooks({
        event: 'PermissionRequest',
        config: opts.hooksConfig,
        disabled: opts.hooksDisabled,
        cwd: opts.cwd,
        toolName: name,
        toolInput: parsedInput,
        signal: opts.signal,
        input: {
          ...hookBase,
          hook_event_name: 'PermissionRequest',
          tool_name: name,
          tool_input: parsedInput,
          tool_use_id: call.id
        }
      })
      if (pr.updatedInput && typeof parsedInput === 'object' && parsedInput) {
        parsedInput = { ...(parsedInput as object), ...pr.updatedInput }
        argumentsJson = JSON.stringify(parsedInput)
      }
      if (
        pr.blocking ||
        pr.permissionDecision === 'deny' ||
        pr.permissionAuto?.behavior === 'deny'
      ) {
        const msg =
          pr.permissionAuto?.behavior === 'deny'
            ? pr.permissionAuto.message || pr.blockMessage
            : pr.blockMessage ||
              pr.permissionDecisionReason ||
              'PermissionRequest hook denied this tool'
        opts.emit({ type: 'status', message: `hook denied permission: ${name}` })
        return {
          call,
          name,
          parsedInput,
          argumentsJson,
          early: { ok: false, output: msg }
        }
      }
      if (
        pr.permissionAuto?.behavior === 'allow' ||
        pr.permissionDecision === 'allow'
      ) {
        if (
          pr.permissionAuto?.behavior === 'allow' &&
          pr.permissionAuto.updatedInput &&
          typeof parsedInput === 'object' &&
          parsedInput
        ) {
          parsedInput = {
            ...(parsedInput as object),
            ...pr.permissionAuto.updatedInput
          }
          argumentsJson = JSON.stringify(parsedInput)
        }
        needAsk = false
      }
    } catch (e) {
      opts.emit({
        type: 'status',
        message: `PermissionRequest hook error (ignored): ${e instanceof Error ? e.message : String(e)}`
      })
    }
  }

  if (needAsk && opts.permissions.sessionAllowsToolClass(name)) {
    needAsk = false
  }

  if (needAsk) {
    const requestId = nanoid()
    opts.emit({ type: 'session_state', state: 'requires_action', detail: name })
    opts.emit({
      type: 'permission_request',
      requestId,
      toolName: name,
      input: parsedInput,
      reason: verdict.reason,
      toolUseId: call.id,
      agentId: opts.agentId,
      parentToolUseId: opts.parentToolUseId
    })
    const payload = await opts.permissions.wait(requestId, {
      toolName: name,
      input: parsedInput
    })
    opts.emit({ type: 'session_state', state: 'running' })
    if (payload.decision === 'deny') {
      const msg = payload.message?.trim()
        ? `User denied this tool call: ${payload.message.trim()}`
        : 'User denied this tool call.'
      // Bubble to query controller — does NOT use sibling_error (shell cascade)
      if (opts.abortController && !opts.abortController.signal.aborted) {
        opts.abortController.abort('user_rejected_tool')
      }
      return {
        call,
        name,
        parsedInput,
        argumentsJson,
        early: { ok: false, output: msg }
      }
    }
    if (payload.decision === 'allow_session') {
      opts.permissions.rememberSession(name)
    } else if (payload.decision === 'allow_always') {
      opts.permissions.rememberSession('*')
    }
    grantWorkingDirectoryForToolPath(
      name,
      parsedInput,
      opts.cwd,
      opts.permissions
    )
  }

  return { call, name, parsedInput, argumentsJson }
}

/** Ensure every tool_use has a tool_result (CC abort path). */
function fillMissingToolResults(
  messages: ChatMessage[],
  calls: ToolCall[],
  emit: EmitFn,
  output = ABORT_TOOL_RESULT
): void {
  const have = new Set(
    messages.filter((m) => m.role === 'tool' && m.tool_call_id).map((m) => m.tool_call_id!)
  )
  for (const call of calls) {
    if (have.has(call.id)) continue
    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      name: call.function.name,
      content: output
    })
    emit({
      type: 'tool_result',
      id: call.id,
      name: call.function.name,
      ok: false,
      output
    })
  }
}

export async function runAgentTurn(opts: {
  settings: AckemCodeSettings
  history: ChatMessage[]
  userText: string
  permissions: PermissionBroker
  interactions: InteractionBroker
  readFileState?: ReadFileState
  getMode: () => PermissionMode
  setMode: (mode: PermissionMode) => void
  getTodos: () => TodoItem[]
  setTodos: (todos: TodoItem[]) => void
  /** Session runtime cwd (may differ after enter_worktree). */
  getCwd?: () => string
  setCwd?: (cwd: string) => void
  getWorktree?: () => import('../tools/worktree/worktree.js').WorktreeSession | null
  setWorktree?: (
    w: import('../tools/worktree/worktree.js').WorktreeSession | null
  ) => void
  sessionId?: string
  /** Host (Ackem) task envelope — forwarded into the system prompt. */
  ackemTask?: AckemTask
  /** SessionStart hook source (CC sessionStart.ts) */
  sessionStartSource?: 'startup' | 'resume' | 'clear' | 'compact' | 'prompt'
  personaSlot?: string
  getCron?: () => SessionCronStore
  /**
   * S06: session file history (CC fileHistoryMakeSnapshot at turn start).
   */
  fileHistory?: import('../fileHistory/index.js').FileHistory
  /**
   * S07: mid-turn user prompts (CC messageQueueManager + query.ts drain).
   */
  messageQueue?: SessionMessageQueue
  /**
   * S09: sidechain registry for agent resume-by-agentId (CC resumeAgent spirit).
   */
  agentRegistry?: import('./agentRegistry.js').AgentRegistry
  /** §5.3 #11: background agent hub + task-notification */
  backgroundAgents?: import('./backgroundAgents.js').BackgroundAgentHub
  /** S08: persist verify_delivery / verification agent evidence on the session. */
  noteVerifyEvidence?: (
    ev: import('./verification.js').VerifyEvidence
  ) => void
  /** R10: persist verify_plan_execution evidence on the session. */
  notePlanVerifyEvidence?: (
    ev: import('./verification.js').VerifyEvidence
  ) => void
  /** S10: Task v2 store */
  taskStore?: import('./tasks.js').TaskStore
  /** S10 PlanV2 explore counter (session-scoped) */
  getPlanExploreCount?: () => number
  notePlanExplore?: (focus?: string) => void
  resetPlanExplore?: () => void
  getPlanExploreFoci?: () => string[]
  /** CC plan_mode / plan_mode_exit attachments */
    getPlanRuntime?: () => {
    planFilePath: string | null
    planEnterAttachmentFullSent: boolean
    needsPlanModeExitAttachment: boolean
    hasExitedPlanMode: boolean
    prePlanMode: PermissionMode | null
    interviewPhase: boolean
    exploreN: number
    planFileExists: boolean
  }
  setPlanEnterAttachmentFullSent?: (v: boolean) => void
  consumePlanModeExitAttachment?: () => boolean
  /** Plan tool/context bridge (CC plan file + transitions). */
  getPlanFilePath?: () => string | null
  getPrePlanMode?: () => PermissionMode | null
  planModeInterviewPhase?: boolean
  plansDirectory?: string
  onEnterPlanMode?: (fromMode: PermissionMode) => void | Promise<string | void>
  onExitPlanModeApproved?: (
    nextMode: PermissionMode,
    opts?: { allowedPrompts?: Array<{ tool: string; prompt: string }> }
  ) => void | Promise<void>
  onExitPlanModeRejected?: (
    kind: 'keep_planning' | 'exit_to_default'
  ) => void | Promise<void>
  onPlanFileUpdated?: (planFilePath: string, chars: number) => void
  emit: EmitFn
  signal?: AbortSignal
  /** G-05: workbench chips / preview paths from POST /chat. */
  hostAttachments?: import('./attachments/types.js').HostAttachmentInput[]
  /** Prefer passing controller so tool cancel can bubble (CC query abort). */
  abortController?: AbortController
  /** Batch 8: persist history snip records on the session. */
  recordSnip?: (record: import('./contextSnip.js').SnipRecord) => void
  /** L3: persist context collapse commits on the session. */
  recordCollapseCommits?: (
    commits: import('./compact/contextCollapseCommits.js').ContextCollapseCommit[]
  ) => void
}): Promise<ChatMessage[]> {
  const {
    settings,
    permissions,
    interactions,
    readFileState,
    getMode,
    setMode,
    getTodos,
    setTodos,
    emit,
    abortController
  } = opts
  const signal = abortController?.signal ?? opts.signal
  const getCwd = opts.getCwd ?? (() => settings.cwd)
  const setCwdRaw = opts.setCwd ?? (() => {})
  // Real setCwd (awaits CwdChanged + permissions/sandbox refresh) assigned below.
  let setCwd: (cwd: string) => void | Promise<void> = (cwd: string) => {
    setCwdRaw(cwd)
  }
  const getWorktree = opts.getWorktree ?? (() => null)
  const setWorktree = opts.setWorktree ?? (() => {})
  const getCron = opts.getCron
  const hostPermissionRules = normalizePermissionRules(settings.permissionRules)
  let permissionRules: PermissionRulesConfig = hostPermissionRules
  // Keep ASRT config in sync with session cwd / settings (CC initialize/refresh spirit)
  void initializeSandbox({
    cwd: getCwd(),
    sandbox: settings.sandbox,
    permissionRules: hostPermissionRules
  })
  const refreshPermissionRules = async () => {
    try {
      const eff = await resolveEffectivePermissionRules({
        cwd: getCwd(),
        hostRules: hostPermissionRules,
        permissionMode: getMode()
      })
      permissionRules = eff.rules
      if (eff.managedOnly) {
        emit({
          type: 'status',
          message: 'permissions: managed-only (policy rules exclusive)'
        })
      }
      if (
        eff.policy.disableBypassPermissionsMode &&
        getMode() === 'bypassPermissions'
      ) {
        const next = coercePermissionModeUnderPolicy(
          getMode(),
          eff.policy
        ) as PermissionMode
        setMode(next)
        emit({
          type: 'status',
          message:
            'permissions: bypassPermissions disabled by managed policy → default'
        })
      }
      if (eff.strippedApplied && eff.stripped.length) {
        emit({
          type: 'status',
          message: `permissions: stripped ${eff.stripped.length} dangerous allow rule(s) (${eff.stripMode}; policy kept)`
        })
      }
    } catch (e) {
      permissionRules = hostPermissionRules
      emit({
        type: 'status',
        message: `permissions loader error (host-only): ${
          e instanceof Error ? e.message : String(e)
        }`
      })
    }
  }

  /**
   * GM-WT: mid-turn cwd switch must settle CwdChanged hooks + reload layered
   * permission rules + refresh sandbox root before the next tool in the same turn.
   */
  setCwd = async (cwd: string) => {
    const old = getCwd()
    setCwdRaw(cwd)
    if (old === cwd) return
    await onCwdChangedForHooks(old, cwd).catch(() => {})
    await refreshPermissionRules()
    try {
      await initializeSandbox({
        cwd: getCwd(),
        sandbox: settings.sandbox,
        permissionRules: hostPermissionRules
      })
    } catch {
      /* sandbox optional */
    }
    emit({
      type: 'status',
      message: `cwd synced for permissions/hooks: ${getCwd()}`
    })
  }
  const hooksConfig = getEffectiveHooks(
    (settings.hooks ?? {}) as HooksConfig,
    getCwd()
  )
  const hooksDisabled = settings.disableAllHooks === true
  const sessionId = opts.sessionId ?? 'session'
  let stopHookContinues = 0
  const MAX_STOP_HOOK_CONTINUES = 3
  if (!settings.apiKey?.trim()) {
    emit({ type: 'error', message: 'API Key 未配置，请先在设置里填写。' })
    emit({ type: 'done', ok: false, error: TURN_DONE_ERRORS.missingApiKey })
    return opts.history
  }
  if (!getCwd()?.trim()) {
    emit({ type: 'error', message: '工作目录未设置。' })
    emit({ type: 'done', ok: false, error: TURN_DONE_ERRORS.missingCwd })
    return opts.history
  }

  let skills = await loadSkills({
    cwd: getCwd(),
    useClaudeSkills: settings.useClaudeSkills,
    extraSkillDirs: settings.extraSkillDirs
  })

  const reloadSkills = async () => {
    skills = await loadSkills({
      cwd: getCwd(),
      useClaudeSkills: settings.useClaudeSkills,
      extraSkillDirs: settings.extraSkillDirs
    })
  }

  const { isAutoMemoryEnabled, ensureMemoryDirExists, executeExtractMemories } =
    await import('../memdir/index.js')
  let memoryDir: string | null = null
  let memoryWrittenThisTurn = false
  if (
    isAutoMemoryEnabled({ autoMemoryEnabled: settings.autoMemoryEnabled })
  ) {
    try {
      memoryDir = await ensureMemoryDirExists(getCwd())
    } catch {
      memoryDir = null
    }
  }

  let messages: ChatMessage[] = [
    {
      role: 'system',
      content: await buildSystemPrompt({
        cwd: getCwd(),
        effort: settings.effort,
        skills,
        todos: getTodos(),
        tasks: opts.taskStore?.list(),
        permissionMode: getMode(),
        agentTier: settings.agentTier,
        planExploreAgents: settings.planExploreAgents,
        planModeInterviewPhase: settings.planModeInterviewPhase,
        planFilePath: opts.getPlanFilePath?.() ?? null,
        personaSlot: opts.personaSlot,
        autoMemoryEnabled: settings.autoMemoryEnabled,
        hooks: hooksConfig,
        disableAllHooks: hooksDisabled,
        sessionId,
        ackemTask: opts.ackemTask
      })
    },
    ...opts.history.filter((m) => m.role !== 'system'),
    { role: 'user', content: opts.userText }
  ]

  {
    const { collectTurnStartAttachments, attachmentsToUserMessage } =
      await import('./attachments/index.js')
    const mediaCaps = resolveModelMedia({
      model: settings.model,
      apiBaseUrl: settings.apiBaseUrl,
      multimodal: settings.multimodal
    })
    const atts = await collectTurnStartAttachments({
      userText: opts.userText,
      cwd: getCwd(),
      hostAttachments: opts.hostAttachments,
      mediaCaps
    })
    const msg = attachmentsToUserMessage(atts, {
      detail: mediaCaps.imageDetail,
      nativePdf: mediaCaps.nativePdf
    })
    if (msg) messages.push(msg)
  }

  {
    const { ensureMessageIds } = await import('./contextSnip.js')
    ensureMessageIds(messages)
  }

  const planRt = opts.getPlanRuntime?.()
  if (planRt) {
    const {
      buildPlanModeEnterAttachment,
      buildPlanModeExitAttachment
    } = await import('../plans/planAttachments.js')
    const { clampPlanExploreAgents } = await import('./tasks.js')
    const exploreN = clampPlanExploreAgents(planRt.exploreN)

    if (opts.consumePlanModeExitAttachment?.()) {
      messages.splice(1, 0, {
        role: 'user',
        content: buildPlanModeExitAttachment({
          previousMode: planRt.prePlanMode ?? 'default',
          planFilePath: planRt.planFilePath ?? undefined
        })
      })
    }

    if (getMode() === 'plan' && planRt.planFilePath) {
      const sparse = planRt.planEnterAttachmentFullSent
      messages.splice(1, 0, {
        role: 'user',
        content: buildPlanModeEnterAttachment({
          planFilePath: planRt.planFilePath,
          planExists: planRt.planFileExists,
          interviewPhase: planRt.interviewPhase,
          exploreN,
          sparse
        })
      })
      if (!sparse) opts.setPlanEnterAttachmentFullSent?.(true)
    } else if (
      opts.sessionStartSource === 'resume' &&
      planRt.planFilePath &&
      planRt.planFileExists &&
      getMode() !== 'plan'
    ) {
      const { readPlan } = await import('../plans/plans.js')
      const planContent = opts.sessionId
        ? await readPlan(opts.sessionId, { plansDirectory: settings.plansDirectory }, getCwd())
        : ''
      if (planContent.trim()) {
        const { buildPlanModeResumedAttachment } = await import('../plans/planAttachments.js')
        messages.splice(1, 0, {
          role: 'user',
          content: buildPlanModeResumedAttachment({
            planFilePath: planRt.planFilePath,
            planContent
          })
        })
      }
    }
  }

  // R4: session memory — resume injects the persisted summary at the context
  // head (contract 4); the in-memory copy also feeds SM-compact immediately.
  const sessMem = createSessionMemoryState(sessionId)
  if (opts.sessionStartSource === 'resume') {
    const persisted = await loadSessionMemory(sessionId)
    if (persisted) {
      sessMem.summary = persisted
      messages.splice(1, 0, {
        role: 'user',
        content: formatSessionMemoryResume(persisted)
      })
    }
  }

  const llmCompact = {
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    effort: settings.effort
  }
  // S05: session-scoped autocompact breaker + cache-stable tool replacements
  const compactTracking = createAutoCompactTracking()
  const toolReplacementState = createContentReplacementState()
  const compactOpts = {
    llm: llmCompact,
    signal,
    cwd: getCwd(),
    sessionId: opts.sessionId,
    tracking: compactTracking,
    replacementState: toolReplacementState,
    hooksConfig,
    hooksDisabled,
    permissionMode: getMode(),
    // R3: post-compact reinjection sources
    readFileState,
    getTodos,
    // R4: SM-compact reads the latest maintained summary
    getSessionSummary: () => sessMem.summary,
    settingsContextWindow: settings.contextWindow,
    recordCollapseCommits: opts.recordCollapseCommits
  }
  messages = await applyCompact(messages, emit, compactOpts)

  // SessionStart — inject boot context (blocking ignored; CC sessionStart spirit)
  try {
    const ss = await runHooks({
      event: 'SessionStart',
      config: hooksConfig,
      disabled: hooksDisabled,
      cwd: getCwd(),
      signal,
      input: {
        session_id: sessionId,
        cwd: getCwd(),
        permission_mode: getMode(),
        hook_event_name: 'SessionStart',
        source: opts.sessionStartSource ?? 'prompt',
        model: settings.model
      }
    })
    if (ss.additionalContext.length) {
      messages.push({
        role: 'user',
        content: `[SessionStart hook context]\n${ss.additionalContext.join('\n')}`
      })
      emit({ type: 'status', message: 'SessionStart hook injected context' })
    }
    if (ss.initialUserMessage) {
      messages.push({ role: 'user', content: ss.initialUserMessage })
    }
    if (ss.watchPaths.length) {
      updateWatchPaths(ss.watchPaths)
    }
  } catch (e) {
    emit({
      type: 'status',
      message: `SessionStart hook error (ignored): ${e instanceof Error ? e.message : String(e)}`
    })
  }

  // UserPromptSubmit — gate / inject every user turn (CC processUserInput spirit)
  try {
    const ups = await runHooks({
      event: 'UserPromptSubmit',
      config: hooksConfig,
      disabled: hooksDisabled,
      cwd: getCwd(),
      signal,
      input: {
        session_id: sessionId,
        cwd: getCwd(),
        permission_mode: getMode(),
        hook_event_name: 'UserPromptSubmit',
        prompt: opts.userText
      }
    })
    if (ups.blocking) {
      const msg =
        ups.blockMessage ||
        ups.additionalContext.join('\n') ||
        'UserPromptSubmit hook blocked this prompt'
      emit({ type: 'error', message: msg })
      emit({ type: 'session_state', state: 'idle' })
      emit({ type: 'done', ok: false, error: TURN_DONE_ERRORS.userPromptBlocked })
      return opts.history
    }
    if (ups.preventContinuation && !ups.blocking) {
      emit({
        type: 'status',
        message: ups.stopReason || 'UserPromptSubmit hook skipped model query'
      })
      emit({ type: 'session_state', state: 'idle' })
      emit({ type: 'done', ok: true })
      return opts.history
    }
    if (ups.additionalContext.length) {
      messages.push({
        role: 'user',
        content: `[UserPromptSubmit hook context]\n${ups.additionalContext.join('\n')}`
      })
    }
  } catch (e) {
    emit({
      type: 'status',
      message: `UserPromptSubmit hook error (ignored): ${e instanceof Error ? e.message : String(e)}`
    })
  }

  // S04: relevance prefetch — parallel with first model/tools; never blocks
  let memoryPrefetch: MemoryPrefetch | undefined = startRelevantMemoryPrefetch({
    query: opts.userText,
    memoryDir,
    messages,
    autoMemoryEnabled: settings.autoMemoryEnabled,
    readFileState,
    llm: {
      apiBaseUrl: settings.apiBaseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      effort: 'low'
    },
    signal
  })

  const injectMemoryPrefetchIfReady = async (): Promise<boolean> => {
    const raw = await tryConsumeMemoryPrefetch(memoryPrefetch)
    if (!raw?.length) return false
    const mems = filterAndSeedSurfacedMemories(raw, readFileState)
    if (!mems.length) return false
    const { textAttachment, attachmentsToUserMessage } = await import(
      './attachments/index.js'
    )
    const memAtts = mems.map((m) =>
      textAttachment({
        kind: 'memory',
        source: 'prefetch',
        path: m.path,
        label: m.path.split(/[/\\]/).pop() || m.path,
        body: `${m.header}\n${m.content}`
      })
    )
    const memMsg = attachmentsToUserMessage(memAtts)
    if (memMsg) messages.push(memMsg)
    emit({
      type: 'status',
      message: `memory prefetch ×${mems.length}`
    })
    return true
  }

  const startedAt = Date.now()
  const elapsed = () => Math.max(1, Math.round((Date.now() - startedAt) / 1000))

  emit({ type: 'session_state', state: 'running' })
  emit({ type: 'thinking', phase: 'start', text: '理解任务并规划下一步…', elapsedSec: 0 })
  emit({ type: 'status', message: 'thinking…' })

  // S06: checkpoint per user turn (CC fileHistoryMakeSnapshot before tools)
  const fileHistory = opts.fileHistory
  const checkpointMessageId = nanoid()
  if (fileHistory) {
    try {
      await fileHistory.makeSnapshot(checkpointMessageId)
    } catch {
      /* best-effort — never block the turn */
    }
  }

  const messageQueue = opts.messageQueue

  // Test hook: hold the turn so HTTP smokes can enqueue / interrupt (S07).
  // ACKEM_TEST_TURN_HOLD_ONCE=1 → only the first turn in the process holds.
  {
    const holdMs = Number(process.env.ACKEM_TEST_TURN_HOLD_MS || 0)
    const once = process.env.ACKEM_TEST_TURN_HOLD_ONCE === '1'
    const g = globalThis as { __ackemTestHoldUsed?: boolean }
    const allowHold = holdMs > 0 && (!once || !g.__ackemTestHoldUsed)
    if (allowHold && !signal?.aborted) {
      if (once) g.__ackemTestHoldUsed = true
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, holdMs)
        const onAbort = () => {
          clearTimeout(timer)
          reject(new Error('aborted'))
        }
        if (signal) {
          if (signal.aborted) {
            clearTimeout(timer)
            reject(new Error('aborted'))
            return
          }
          signal.addEventListener('abort', onAbort, { once: true })
        }
      }).catch((e) => {
        throw e instanceof Error ? e : new Error('aborted')
      })
    }
  }

  /** S07: defer terminal `done` when interrupt aborts but queue still has follow-up work. */
  const hasQueuedFollowUp = (): boolean =>
    Boolean(messageQueue?.peek(isMainSessionQueueItem))

  /** CC query.ts: after tool_results, drain queued prompts into this turn. */
  const drainQueuedPrompts = (): number => {
    if (!messageQueue?.length) return 0
    const items = messageQueue.drainMidTurn(
      'next',
      (cmd) => cmd.agentId === undefined
    )
    if (!items.length) return 0
    injectQueuedMessages(messages, items)
    for (const item of items) {
      emit({
        type: 'message_dequeued',
        id: item.id,
        text: item.text,
        remaining: messageQueue.length,
        mode: item.mode
      })
    }
    emit({
      type: 'status',
      message: `injected queued message ×${items.length}`
    })
    return items.length
  }

  /** R3: mid-turn compact when context is blocking (CC query.ts spirit). */
  const maybeMidTurnCompactIfBlocking = async (): Promise<boolean> => {
    const pressure = calculateTokenWarningState(estimateMessagesTokens(messages), {
      model: settings.model
    })
    if (pressure.level !== 'blocking') return false
    const before = estimateMessagesTokens(messages)
    messages = await applyCompact(messages, emit, {
      ...compactOpts,
      cwd: getCwd()
    })
    const after = estimateMessagesTokens(messages)
    if (after < before) {
      emit({
        type: 'status',
        message: `mid-turn compact (blocking): ${before} → ${after} tokens`
      })
      return true
    }
    return false
  }

  const toolCtx = (): ToolContext => ({
    cwd: getCwd(),
    setCwd,
    getWorktree,
    setWorktree,
    getCron,
    sessionId: opts.sessionId,
    skills,
    llm: {
      apiBaseUrl: settings.apiBaseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      effort: settings.effort
    },
    multimodal: settings.multimodal,
    signal,
    getMode,
    setMode,
    interactions,
    permissions,
    permissionRules,
    additionalWorkingDirectories: permissions.getAdditionalWorkingDirectories(),
    readFileState,
    memoryDir,
    noteMemoryWrite: () => {
      memoryWrittenThisTurn = true
    },
    trackFileEdit: async (absPath: string) => {
      if (!fileHistory) return
      await fileHistory.trackEdit(absPath, getCwd())
    },
    webSearch: settings.webSearch,
    verifyCommand: settings.verifyCommand,
    hooks: settings.hooks,
    disableAllHooks: settings.disableAllHooks,
    autoMode: settings.autoMode,
    parentAbortController: abortController,
    noteVerifyEvidence: opts.noteVerifyEvidence,
    notePlanVerifyEvidence: opts.notePlanVerifyEvidence,
    agentDepth: 0,
    agentRegistry: opts.agentRegistry,
    backgroundAgents: opts.backgroundAgents,
    messageQueue,
    enqueueTaskNotification: (text: string) => {
      if (!messageQueue) return
      const item = messageQueue.enqueuePendingNotification(text)
      if (!item) return
      emit({
        type: 'message_queued',
        id: item.id,
        text: item.text,
        queueLength: messageQueue.length,
        priority: item.priority,
        mode: item.mode
      })
    },
    getParentMessages: () => messages.filter((m) => m.role !== 'system'),
    parentSystemPrompt: (() => {
      const sys = messages.find((m) => m.role === 'system')
      return typeof sys?.content === 'string' ? sys.content : undefined
    })(),
    isForkChild: false,
    taskStore: opts.taskStore,
    snipContextMessages: async (messageIds: string[]) => {
      const {
        isSnipEnabled,
        ensureMessageIds,
        applySnipToMessages,
        buildSnipBoundaryMessage
      } = await import('./contextSnip.js')
      const { findLastTurnUserIndex } = await import('./retryLastTurn.js')
      if (!isSnipEnabled()) {
        return { ok: false, output: 'Snip disabled (ACKEM_DISABLE_SNIP=1)' }
      }
      if (!messageIds.length) {
        return { ok: false, output: 'message_ids required' }
      }
      ensureMessageIds(messages)
      const lastUserIdx = findLastTurnUserIndex(
        messages.filter((m) => m.role !== 'system')
      )
      const lastUserId =
        lastUserIdx >= 0
          ? messages.filter((m) => m.role !== 'system')[lastUserIdx]?.id
          : undefined
      const ids = new Set(messageIds)
      if (lastUserId && ids.has(lastUserId)) {
        return {
          ok: false,
          output: 'Cannot snip the latest user prompt (retry-last-turn instead).'
        }
      }
      for (const m of messages) {
        if (m.role === 'system' && m.id && ids.has(m.id)) {
          return { ok: false, output: 'Cannot snip system messages' }
        }
      }
      const system = messages.filter((m) => m.role === 'system')
      const rest = messages.filter((m) => m.role !== 'system')
      const applied = applySnipToMessages(rest, ids)
      if (applied.removedCount === 0) {
        return {
          ok: false,
          output: 'No matching message ids found in current context'
        }
      }
      messages.length = 0
      messages.push(...system, ...applied.messages)
      const boundary = buildSnipBoundaryMessage(
        applied.removedCount,
        applied.removedIds
      )
      messages.push(boundary)
      opts.recordSnip?.({
        at: new Date().toISOString(),
        removedIds: applied.removedIds,
        summary: flattenMessageContent(boundary.content)
      })
      return {
        ok: true,
        output: `Snipped ${applied.removedCount} message(s) from context.`
      }
    },
    planExploreAgents: effectivePlanExploreAgents(settings),
    agentTier: normalizeAgentTier(settings.agentTier),
    getPlanExploreCount: opts.getPlanExploreCount,
    notePlanExplore: opts.notePlanExplore,
    resetPlanExplore: opts.resetPlanExplore,
    getPlanExploreFoci: opts.getPlanExploreFoci,
    getPlanFilePath: opts.getPlanFilePath,
    getPrePlanMode: opts.getPrePlanMode,
    planModeInterviewPhase: opts.planModeInterviewPhase,
    plansDirectory: opts.plansDirectory,
    onEnterPlanMode: opts.onEnterPlanMode,
    onExitPlanModeApproved: opts.onExitPlanModeApproved,
    onExitPlanModeRejected: opts.onExitPlanModeRejected,
    onPlanFileUpdated: opts.onPlanFileUpdated,
    emit,
    getTodos,
    setTodos
  })

  const runExtractMemories = async (history: ChatMessage[]) => {
    try {
      const result = await executeExtractMemories({
        cwd: getCwd(),
        userText: opts.userText,
        messages: history,
        memoryWrittenThisTurn,
        sessionId: opts.sessionId,
        llm: {
          apiBaseUrl: settings.apiBaseUrl,
          apiKey: settings.apiKey,
          model: settings.model,
          effort: settings.effort
        },
        signal
      })
      if (result.saved.length) {
        emit({
          type: 'status',
          message: `memory: saved ${result.saved.map((s) => s.filename).join(', ')}`
        })
      }
    } catch {
      /* non-fatal */
    }
  }

  let turns = 0
  let promptTooLongRetries = 0
  let promptTooLongSnipUsed = false
  let maxTurnsRecoveryUsed = false
  let gitSnapshotNudgeSent = false
  let successfulEditsThisTurn = 0
  let lengthRecoveryUsed = false

  // R5-LSPFEED: passive diagnostics — collected after file edits, injected the
  // next turn, deduped for the session (CC LSPDiagnosticRegistry spirit).
  const lspFeedbackRegistry = new LspDiagnosticRegistry()
  let pendingLspFeedback: Array<Promise<LspDiagnostic[] | null>> = []
  const pendingShellDiagnostics: string[] = []
  const drainShellDiagnostics = async (): Promise<void> => {
    if (!pendingShellDiagnostics.length) return
    const bodies = pendingShellDiagnostics.splice(0, pendingShellDiagnostics.length)
    try {
      const { textAttachment, attachmentsToUserMessage } = await import(
        './attachments/index.js'
      )
      const body = bodies.join('\n\n')
      const msg = attachmentsToUserMessage([
        textAttachment({
          kind: 'lsp',
          source: 'lsp',
          label: 'command-diagnostics',
          body
        })
      ])
      if (msg) {
        messages.push(msg)
        emit({ type: 'status', message: 'shell diagnostics injected for next turn' })
      }
    } catch {
      /* best-effort */
    }
  }
  const drainLspFeedback = async (): Promise<void> => {
    if (!pendingLspFeedback.length) return
    const pending = pendingLspFeedback
    pendingLspFeedback = []
    try {
      // Each collector self-times-out (default 2s) — this never hangs the turn.
      const settled = await Promise.all(pending)
      const all = settled
        .filter((s): s is LspDiagnostic[] => Array.isArray(s))
        .flat()
      const fresh = lspFeedbackRegistry.takeNew(all)
      const text = formatLspFeedback(fresh)
      if (text) {
        const { textAttachment, attachmentsToUserMessage } = await import(
          './attachments/index.js'
        )
        const lspMsg = attachmentsToUserMessage([
          textAttachment({
            kind: 'lsp',
            source: 'lsp',
            label: 'lsp-diagnostics',
            body: text
          })
        ])
        if (lspMsg) messages.push(lspMsg)
        emit({
          type: 'status',
          message: `lsp feedback: ${fresh.length} new diagnostic(s) injected`
        })
      }
    } catch {
      /* passive feedback is best-effort */
    }
  }

  // R1-RETRY: shared retry policy for every model API call this run. Retry wraps
  // only the pre-stream POST + status check; each backoff surfaces as a Host status.
  const llmRetry: LlmRetryOpts = {
    fallbackModel: settings.fallbackModel,
    onRetry: (ev) => {
      emit({
        type: 'status',
        message:
          `api_retry: ${ev.reason}` +
          (ev.status ? ` (${ev.status})` : '') +
          ` — attempt ${ev.attempt}, waiting ${Math.round(ev.delayMs)}ms` +
          (ev.model !== settings.model ? ` [model ${ev.model}]` : '')
      })
    },
    onFallback: (from, to) => {
      emit({ type: 'status', message: `api fallback model: ${from} → ${to}` })
    }
  }

  // R7 contract 3: turn-end orphan sweep — any permission request left
  // pending gets a synthesized deny so no waiter dangles across turns.
  const sweepOrphanedPermissions = () => {
    try {
      const n = opts.permissions.denyAllPending()
      if (n > 0) {
        emit({
          type: 'status',
          message: `auto-denied ${n} orphaned permission request(s) at turn end`
        })
      }
    } catch {
      /* never block turn close */
    }
  }

  // R7 contract 2: optional token budget (default off)
  const maxBudgetTokens = resolveMaxBudgetTokens(settings.maxBudgetTokens)
  const tokenUsage = createTokenUsageReporter(emit, {
    contextWindow: settings.contextWindow,
    model: settings.model
  })

  const configuredMaxTurns = settings.maxTurns
  let turnCap = resolveMaxTurns(configuredMaxTurns)
  const hardCap = resolveTurnHardCap(configuredMaxTurns)

  try {
    while (turns < turnCap) {
      if (signal?.aborted) throw new Error('aborted')
      turns += 1
      successfulEditsThisTurn = 0
      await refreshPermissionRules()

      if (
        maxBudgetTokens != null &&
        estimateMessagesTokens(messages) >= maxBudgetTokens
      ) {
        emit({
          type: 'error',
          message: `Session token budget exceeded (~${estimateMessagesTokens(messages)} ≥ ${maxBudgetTokens})`
        })
        emit({ type: 'thinking', phase: 'end', elapsedSec: elapsed() })
        emit({ type: 'session_state', state: 'idle' })
        sweepOrphanedPermissions()
        memoryPrefetch?.abort()
        emit({ type: 'done', ok: false, error: TURN_DONE_ERRORS.budgetExceeded })
        return messages.filter((m) => m.role !== 'system')
      }

      messages = await applyCompact(messages, emit, {
        ...compactOpts,
        cwd: getCwd()
      })
      await injectMemoryPrefetchIfReady()

      emit({
        type: 'thinking',
        phase: 'update',
        text: turns === 1 ? '正在调用模型…' : `继续执行（第 ${turns} 轮）…`,
        elapsedSec: elapsed()
      })

      const agentTier = normalizeAgentTier(settings.agentTier)
      const allTools = filterToolsForAgentTier(
        [...filterEnabledTools(TOOL_DEFINITIONS), ...mcpManager.toolDefinitions()],
        agentTier
      )
      const discoveredTools = extractDiscoveredToolNames(messages)
      const selectedTools = selectToolsForModel(allTools, discoveredTools)
      const toolsForModel = selectedTools.tools
      if (selectedTools.deferred && turns === 1) {
        emit({
          type: 'status',
          message: `tool deferral: ${selectedTools.deferredCount} deferred (use tool_search)`
        })
      }

      const runOneFull = async (call: ToolCall, toolSignal?: AbortSignal) => {
        const effectiveSignal = toolSignal ?? signal
        const prepared = await prepareCall(call, {
          getMode,
          permissions,
          rules: permissionRules,
          emit,
          signal: effectiveSignal,
          abortController,
          hooksConfig,
          hooksDisabled,
          cwd: getCwd(),
          sessionId,
          settings,
          recentMessages: messages,
          planFilePath: opts.getPlanFilePath?.() ?? null,
          planModeInterviewPhase: settings.planModeInterviewPhase
        })
        if (prepared.early) {
          return {
            call,
            name: prepared.name,
            ok: prepared.early.ok,
            output: prepared.early.output,
            executed: false
          }
        }
        if (effectiveSignal?.aborted) throw new Error('aborted')
        const started = Date.now()
        const progressTimer = setInterval(() => {
          emit({
            type: 'tool_progress',
            id: call.id,
            name: prepared.name,
            elapsedSec: Math.max(1, Math.round((Date.now() - started) / 1000))
          })
        }, 2000)
        let result: Awaited<ReturnType<typeof executeTool>>
        try {
          result = await executeTool(
            prepared.name,
            prepared.argumentsJson,
            {
              ...toolCtx(),
              signal: effectiveSignal,
              currentToolUseId: call.id
            }
          )
        } finally {
          clearInterval(progressTimer)
        }
        if (
          (prepared.name === 'install_skill' ||
            prepared.name === 'uninstall_skill') &&
          result.ok
        ) {
          await reloadSkills()
        }

        // R5: successful file edit → start async diagnostics collection
        if (result.ok) {
          if (
            prepared.name === 'search_replace' ||
            prepared.name === 'write_file'
          ) {
            successfulEditsThisTurn += 1
          }
          const editedFile = editedFileFromToolInput(
            prepared.name,
            prepared.parsedInput,
            getCwd()
          )
          if (editedFile) {
            pendingLspFeedback.push(
              collectFileDiagnostics(lspManager, editedFile)
            )
          }
        }
        let truncated =
          result.output.length > 80_000
            ? result.output.slice(0, 80_000) + '\n…[truncated]'
            : result.output

        // PostToolUse / PostToolUseFailure — never crash the loop
        try {
          const postEvent = result.ok ? 'PostToolUse' : 'PostToolUseFailure'
          const post = await runHooks({
            event: postEvent,
            config: hooksConfig,
            disabled: hooksDisabled,
            cwd: getCwd(),
            toolName: prepared.name,
            toolInput: prepared.parsedInput,
            signal: effectiveSignal,
            input: result.ok
              ? {
                  session_id: sessionId,
                  cwd: getCwd(),
                  permission_mode: getMode(),
                  hook_event_name: 'PostToolUse',
                  tool_name: prepared.name,
                  tool_input: prepared.parsedInput,
                  tool_use_id: call.id,
                  tool_response: truncated
                }
              : {
                  session_id: sessionId,
                  cwd: getCwd(),
                  permission_mode: getMode(),
                  hook_event_name: 'PostToolUseFailure',
                  tool_name: prepared.name,
                  tool_input: prepared.parsedInput,
                  tool_use_id: call.id,
                  error: truncated
                }
          })
          if (post.additionalContext.length) {
            truncated +=
              '\n\n[Hook context]\n' + post.additionalContext.join('\n')
          }
          if (post.blocking && post.blockMessage) {
            truncated += `\n\n[Hook feedback]\n${post.blockMessage}`
          }
        } catch (e) {
          emit({
            type: 'status',
            message: `PostToolUse hook error (ignored): ${e instanceof Error ? e.message : String(e)}`
          })
        }

        if (prepared.name === 'bash' || prepared.name === 'powershell') {
          const cmd = String(
            (prepared.parsedInput as Record<string, unknown>).command ?? ''
          )
          const diag = parseShellDiagnostics(
            prepared.name,
            cmd,
            truncated
          )
          if (diag) pendingShellDiagnostics.push(diag)
        }

        return {
          call,
          name: prepared.name,
          ok: result.ok,
          output: truncated,
          executed: true,
          media: result.media
        }
      }

      const emitOrphanToolResults = (
        orphans: Array<{
          call: ToolCall
          name: string
          ok: boolean
          output: string
        }>
      ) => {
        // Close UI tool_start rows without polluting next-turn messages
        for (const ex of orphans) {
          emit({
            type: 'tool_result',
            id: ex.call.id,
            name: ex.name,
            ok: ex.ok,
            output: ex.output
          })
        }
      }

      const appendToolResults = (
        executed: Array<{
          call: ToolCall
          name: string
          ok: boolean
          output: string
          media?: import('../tools/files/types.js').ToolMediaPart[]
        }>
      ) => {
        for (const ex of executed) {
          messages.push({
            role: 'tool',
            tool_call_id: ex.call.id,
            name: ex.name,
            content: ex.output
          })
          emit({
            type: 'tool_result',
            id: ex.call.id,
            name: ex.name,
            ok: ex.ok,
            output: ex.output
          })
        }
        const media = executed.flatMap((ex) => ex.media ?? [])
        const caps = resolveModelMedia({
          model: settings.model,
          apiBaseUrl: settings.apiBaseUrl,
          multimodal: settings.multimodal
        })
        const follow = mediaFollowUpMessage(media, {
          detail: caps.imageDetail,
          nativePdf: caps.nativePdf
        })
        if (follow) messages.push(follow)
      }

      let assistant: ChatMessage
      let llmUsage: import('./tokenUsage.js').LlmUsage | null = null
      const useStreaming = isStreamingToolExecutionEnabled()
      let streamingExecutor: StreamingToolExecutor | null = null
      let streamStartedTools = 0
      let streamContent = ''

      tokenUsage.emit({ messages, tools: toolsForModel, force: true })

      try {
        if (useStreaming) {
          streamingExecutor = new StreamingToolExecutor(
            (call, toolSignal) => runOneFull(call, toolSignal),
            { parentSignal: signal, abortController }
          )
          emit({
            type: 'status',
            message: 'streaming tools enabled…'
          })
          const streamed = await chatCompletionStream({
            apiBaseUrl: settings.apiBaseUrl,
            apiKey: settings.apiKey,
            model: settings.model,
            effort: settings.effort,
            messages,
            tools: toolsForModel,
            signal,
            retry: llmRetry,
            multimodal: settings.multimodal,
            handlers: {
              onContentDelta: (text) => {
                streamContent += text
                emit({ type: 'assistant_delta', text })
                tokenUsage.emit({
                  messages,
                  tools: toolsForModel,
                  partialAssistant: streamContent
                })
              },
              onToolCallReady: ({ call }) => {
                // Start tools mid-stream (CC content_block_stop spirit).
                // Do NOT push tool_results into messages until assistant is appended.
                streamStartedTools += 1
                streamingExecutor!.addTool(call)
              }
            }
          })
          assistant = streamed.message
          llmUsage = streamed.usage
        } else {
          const completed = await chatCompletion({
            apiBaseUrl: settings.apiBaseUrl,
            apiKey: settings.apiKey,
            model: settings.model,
            effort: settings.effort,
            messages,
            tools: toolsForModel,
            signal,
            retry: llmRetry,
            multimodal: settings.multimodal
          })
          assistant = completed.message
          llmUsage = completed.usage
        }
      } catch (err) {
        // Stream failed after tools started → discard + close UI orphans
        if (streamingExecutor && streamStartedTools > 0) {
          const orphans = await streamingExecutor.finalizeDiscard()
          emitOrphanToolResults(orphans)
        }
        const msg = err instanceof Error ? err.message : String(err)
        const body = err instanceof LlmError ? err.body || msg : msg
        if (isPromptTooLongError(body) && promptTooLongRetries < MAX_PROMPT_TOO_LONG_RETRIES) {
          promptTooLongRetries += 1
          emit({
            type: 'status',
            message: `prompt too long — forcing compact (retry ${promptTooLongRetries})`
          })
          messages = await applyCompact(messages, emit, {
            ...compactOpts,
            cwd: getCwd(),
            forceFull: true
          })
          turns -= 1
          continue
        }
        if (
          isPromptTooLongError(body) &&
          promptTooLongRetries >= MAX_PROMPT_TOO_LONG_RETRIES &&
          !promptTooLongSnipUsed
        ) {
          promptTooLongSnipUsed = true
          const cut = snipOldestToolGroup(messages)
          if (cut.removed > 0) {
            messages = cut.messages
            emit({
              type: 'status',
              message: `prompt too long — snipped oldest tool group (${cut.removed} msgs), forcing compact once`
            })
          } else {
            emit({
              type: 'status',
              message: 'prompt too long — no tool group to snip, forcing compact once'
            })
          }
          messages = await applyCompact(messages, emit, {
            ...compactOpts,
            cwd: getCwd(),
            forceFull: true
          })
          turns -= 1
          continue
        }
        // Fallback: non-streaming completion if stream unsupported or dropped
        // before any tool_call started (do not replay in-flight streaming tools).
        if (
          useStreaming &&
          streamStartedTools === 0 &&
          (isTransientDisconnect(err) || /stream|SSE|EventStream/i.test(body + msg))
        ) {
          emit({
            type: 'status',
            message: 'stream unsupported — falling back to non-streaming…'
          })
          streamingExecutor = null
          streamStartedTools = 0
          try {
            const completed = await chatCompletion({
              apiBaseUrl: settings.apiBaseUrl,
              apiKey: settings.apiKey,
              model: settings.model,
              effort: settings.effort,
              messages,
              tools: toolsForModel,
              signal,
              retry: llmRetry,
              multimodal: settings.multimodal
            })
            assistant = completed.message
            llmUsage = completed.usage
          } catch (err2) {
            throw err2
          }
        } else {
          throw err
        }
      }

      // Ensure assistant is defined (TypeScript)
      assistant = assistant!

      messages.push(assistant)

      tokenUsage.emit({
        messages,
        tools: toolsForModel,
        apiUsage: llmUsage,
        force: true
      })

      const text = flattenMessageContent(assistant.content).trim()
      const calls = assistant.tool_calls ?? []

      // GM-CORE: continue on tool_calls presence (not finish_reason)
      if (needsToolFollowUp(assistant)) {
        // Visible model text is delivery/commentary, not a thinking block.
        // Streaming already sent assistant_delta; the non-stream path must too.
        if (text && !useStreaming) {
          emit({ type: 'assistant_delta', text })
        }

        try {
          if (streamingExecutor && streamStartedTools > 0) {
            // Tools already queued during stream; wait for remainder in order
            if (streamStartedTools > 1) {
              emit({
                type: 'status',
                message: `streaming parallel tools ×${streamStartedTools}…`
              })
            }
            // Add any tool_calls the stream finished in the final message but
            // somehow missed (should be rare — flush covers this).
            const seen = new Set(
              streamingExecutor.getTracked().map((t) => t.id)
            )
            for (const call of calls) {
              if (!seen.has(call.id)) streamingExecutor.addTool(call)
            }
            const remaining = await streamingExecutor.getRemainingResults()
            appendToolResults(remaining)
            tokenUsage.emit({ messages, tools: toolsForModel, force: true })
          } else {
            // Classic post-stream batch path (CC runTools)
            const batches = partitionToolCalls(calls)
            for (const batch of batches) {
              if (signal?.aborted) throw new Error('aborted')

              if (batch.isConcurrencySafe && batch.calls.length > 1) {
                emit({
                  type: 'status',
                  message: `parallel tools ×${batch.calls.length}…`
                })
              }

              const executed = batch.isConcurrencySafe
                ? await mapPool(batch.calls, getMaxToolConcurrency(), (c) =>
                    runOneFull(c)
                  )
                : await (async () => {
                    const out: Awaited<ReturnType<typeof runOneFull>>[] = []
                    for (const call of batch.calls) {
                      out.push(await runOneFull(call))
                    }
                    return out
                  })()

              appendToolResults(executed)
            }
            tokenUsage.emit({ messages, tools: toolsForModel, force: true })
          }
        } catch (toolErr) {
          const msg = toolErr instanceof Error ? toolErr.message : String(toolErr)
          if (msg === 'aborted' || signal?.aborted) {
            if (streamingExecutor) {
              const orphans = await streamingExecutor.finalizeDiscard()
              // Prefer synthetic discard/abort outputs already produced
              const have = new Set(
                messages
                  .filter((m) => m.role === 'tool' && m.tool_call_id)
                  .map((m) => m.tool_call_id!)
              )
              for (const o of orphans) {
                if (have.has(o.call.id)) continue
                messages.push({
                  role: 'tool',
                  tool_call_id: o.call.id,
                  name: o.name,
                  content: o.output
                })
                emit({
                  type: 'tool_result',
                  id: o.call.id,
                  name: o.name,
                  ok: o.ok,
                  output: o.output
                })
                have.add(o.call.id)
              }
            }
            fillMissingToolResults(messages, calls, emit, ABORT_TOOL_RESULT)
            emit({ type: 'thinking', phase: 'end', elapsedSec: elapsed() })
            emit({ type: 'session_state', state: 'idle' })
            emit({
              type: 'done',
              ok: false,
              error: TURN_DONE_ERRORS.abortedTools
            })
            return messages.filter((m) => m.role !== 'system')
          }
          throw toolErr
        }

        // GM-CORE: one recovery turn after tools on the last budgeted turn
        if (
          shouldRefundBrowserTurn({
            usedBrowserMcp: toolCallsUseBrowserMcp(calls),
            turnCap,
            hardCap
          })
        ) {
          turnCap += 1
          emit({
            type: 'status',
            message: `browser MCP: turn budget ${turnCap} (base ${
              configuredMaxTurns > 0 ? configuredMaxTurns : 'unlimited'
            })`
          })
        }

        const recovery = applyMaxTurnsRecovery({
          turns,
          maxTurns: turnCap,
          recoveryUsed: maxTurnsRecoveryUsed
        })
        if (recovery.grant) {
          maxTurnsRecoveryUsed = true
          turns = recovery.nextTurns
          messages.push({
            role: 'user',
            content: buildMaxTurnsRecoveryPrompt({
              maxTurns: Number.isFinite(turnCap) ? turnCap : configuredMaxTurns,
              turnsUsed: turns,
              lastAssistantPreview: text
            })
          })
          emit({
            type: 'status',
            message: 'max_turns reached — granting one recovery turn'
          })
        }

        // R5: inject new diagnostics from this turn's edits (CC lsp_diagnostics attachment)
        await drainLspFeedback()
        await drainShellDiagnostics()
        if (
          shouldGitSnapshotNudge(successfulEditsThisTurn, gitSnapshotNudgeSent)
        ) {
          gitSnapshotNudgeSent = true
          messages.push({ role: 'user', content: GIT_SNAPSHOT_NUDGE })
          emit({
            type: 'status',
            message: 'repo hint: consider git_snapshot after multiple edits'
          })
        }
        // R4: background incremental session summary (contract 1; fail-soft,
        // fire-and-forget so the main loop is never blocked)
        if (
          shouldUpdateSessionMemory(
            sessMem,
            turns,
            estimateMessagesTokens(messages)
          )
        ) {
          void updateSessionMemory(sessMem, messages, turns)
        }
        await injectMemoryPrefetchIfReady()
        // S07: mid-turn drain AFTER tool_results (CC query.ts attachments)
        drainQueuedPrompts()
        if (await maybeMidTurnCompactIfBlocking()) {
          emit({ type: 'status', message: `continue (turn ${turns})…` })
          continue
        }
        emit({ type: 'status', message: `continue (turn ${turns})…` })
        continue
      }

      // R1: output-token truncation recovery (finish_reason === 'length', no tools).
      if (isOutputTruncated(assistant)) {
        if (text) emit({ type: 'assistant_message', text, final: false })
        if (!lengthRecoveryUsed) {
          lengthRecoveryUsed = true
          messages.push({
            role: 'user',
            content: buildOutputTruncationRecoveryPrompt()
          })
          emit({
            type: 'status',
            message:
              'output truncated (max_output_tokens) — granting one continuation turn'
          })
          turns -= 1
          continue
        }
        emit({ type: 'thinking', phase: 'end', elapsedSec: elapsed() })
        emit({ type: 'session_state', state: 'idle' })
        const outTrunc = messages.filter((m) => m.role !== 'system')
        await runExtractMemories(outTrunc)
        emit({
          type: 'done',
          ok: false,
          error: TURN_DONE_ERRORS.maxOutputTokens
        })
        return outTrunc
      }

      if (text) {
        emit({ type: 'assistant_message', text, final: true })
      }

      const preflightMsg = maybeRepoPreflightContinuation({
        messages,
        settings,
        assistantText: text
      })
      if (preflightMsg) {
        messages.push({ role: 'user', content: preflightMsg })
        emit({
          type: 'status',
          message: 'repo preflight: open diagnostics — continue to fix or snapshot'
        })
        emit({ type: 'status', message: `continue (turn ${turns})…` })
        continue
      }

      // No-tool path: if prefetch just settled, inject and give model one more turn
      if (await injectMemoryPrefetchIfReady()) {
        emit({ type: 'status', message: `continue (turn ${turns})…` })
        continue
      }

      // S07: prompts queued during final LLM call — continue same turn
      if (drainQueuedPrompts() > 0) {
        emit({ type: 'status', message: `continue (turn ${turns})…` })
        continue
      }

      // Stop hooks — exit 2 / blocking injects feedback and continues; continue:false ends
      try {
        const stop = await runHooks({
          event: 'Stop',
          config: hooksConfig,
          disabled: hooksDisabled,
          cwd: getCwd(),
          signal,
          input: {
            session_id: sessionId,
            cwd: getCwd(),
            permission_mode: getMode(),
            hook_event_name: 'Stop',
            stop_hook_active: stopHookContinues > 0,
            last_assistant_message: text || undefined
          }
        })
        if (stop.preventContinuation && !stop.blocking) {
          emit({
            type: 'status',
            message:
              stop.stopReason ||
              stop.blockMessage ||
              'Stop hook ended the turn'
          })
        } else if (stop.blocking && stopHookContinues < MAX_STOP_HOOK_CONTINUES) {
          const feedback =
            stop.blockMessage ||
            stop.additionalContext.join('\n') ||
            'Stop hook requested continuation'
          emit({ type: 'status', message: `Stop hook: continue (${stopHookContinues + 1})` })
          messages.push({
            role: 'user',
            content: `Stop hook feedback:\n${feedback}`
          })
          stopHookContinues += 1
          emit({ type: 'status', message: `continue (turn ${turns})…` })
          continue
        } else if (stop.blocking) {
          // R7 contract 1: Stop hook still blocking after the continuation
          // limit — force close with a stable code (CC stop-hook loop guard).
          emit({
            type: 'error',
            message: `Stop hook still blocking after ${MAX_STOP_HOOK_CONTINUES} continuations — forcing turn close`
          })
          emit({ type: 'thinking', phase: 'end', elapsedSec: elapsed() })
          emit({ type: 'session_state', state: 'idle' })
          sweepOrphanedPermissions()
          memoryPrefetch?.abort()
          emit({ type: 'done', ok: false, error: TURN_DONE_ERRORS.stopHookLoop })
          return messages.filter((m) => m.role !== 'system')
        }
      } catch (e) {
        emit({
          type: 'status',
          message: `Stop hook error (ignored): ${e instanceof Error ? e.message : String(e)}`
        })
      }

      // Queued during Stop hooks
      if (drainQueuedPrompts() > 0) {
        emit({ type: 'status', message: `continue (turn ${turns})…` })
        continue
      }

      memoryPrefetch?.abort()
      sweepOrphanedPermissions()
      emit({ type: 'thinking', phase: 'end', elapsedSec: elapsed() })
      emit({ type: 'session_state', state: 'idle' })
      const outOk = messages.filter((m) => m.role !== 'system')
      // R4: persist final session summary so resume sees the end state
      void updateSessionMemory(sessMem, messages, turns)
      await runExtractMemories(outOk)
      emitDueCron(getCron, emit, messageQueue)
      emit({ type: 'done', ok: true })
      return outOk
    }

    const capLabel = !Number.isFinite(turnCap)
      ? 'unlimited'
      : turnCap > configuredMaxTurns && configuredMaxTurns > 0
        ? `${configuredMaxTurns} + browser→${turnCap}`
        : String(configuredMaxTurns)
    emit({ type: 'error', message: `Reached maxTurns (${capLabel})` })
    emit({ type: 'thinking', phase: 'end', elapsedSec: elapsed() })
    emit({ type: 'session_state', state: 'idle' })
    sweepOrphanedPermissions()
    emitDueCron(getCron, emit, messageQueue)
    memoryPrefetch?.abort()
    emit({ type: 'done', ok: false, error: TURN_DONE_ERRORS.maxTurns })
    return messages.filter((m) => m.role !== 'system')
  } catch (e) {
    memoryPrefetch?.abort()
    sweepOrphanedPermissions()
    const msg = e instanceof Error ? e.message : String(e)
    // If aborted after assistant emitted tool_calls, synthesize missing tool_results
    const lastAsst = [...messages].reverse().find((m) => m.role === 'assistant')
    const pendingCalls = lastAsst?.tool_calls
    if ((msg === 'aborted' || signal?.aborted) && pendingCalls?.length) {
      fillMissingToolResults(messages, pendingCalls, emit, ABORT_TOOL_RESULT)
      emit({ type: 'thinking', phase: 'end', elapsedSec: elapsed() })
      const deferDone = hasQueuedFollowUp()
      if (!deferDone) {
        emit({ type: 'session_state', state: 'idle' })
        emit({
          type: 'done',
          ok: false,
          error: TURN_DONE_ERRORS.abortedTools
        })
      } else {
        emit({
          type: 'status',
          message: 'turn interrupted — draining queued messages'
        })
      }
      return messages.filter((m) => m.role !== 'system')
    }
    if (msg === 'aborted' || signal?.aborted) {
      emit({ type: 'thinking', phase: 'end', elapsedSec: elapsed() })
      const deferDone = hasQueuedFollowUp()
      if (!deferDone) {
        emit({ type: 'session_state', state: 'idle' })
        emit({ type: 'done', ok: false, error: TURN_DONE_ERRORS.aborted })
      } else {
        emit({
          type: 'status',
          message: 'turn interrupted — draining queued messages'
        })
      }
      return messages.filter((m) => m.role !== 'system')
    }
    if (isPromptTooLongError(msg) || /prompt.?too.?long/i.test(msg)) {
      emit({ type: 'error', message: msg })
      emit({ type: 'thinking', phase: 'end', elapsedSec: elapsed() })
      emit({ type: 'session_state', state: 'idle' })
      emit({ type: 'done', ok: false, error: TURN_DONE_ERRORS.promptTooLong })
      return messages.filter((m) => m.role !== 'system')
    }
    // R1: LLM API retries (+ optional fallback model) all exhausted.
    if (e instanceof LlmRetryExhaustedError) {
      emit({ type: 'error', message: msg })
      emit({ type: 'thinking', phase: 'end', elapsedSec: elapsed() })
      emit({ type: 'session_state', state: 'idle' })
      emit({ type: 'done', ok: false, error: TURN_DONE_ERRORS.apiRetryExhausted })
      return messages.filter((m) => m.role !== 'system')
    }
    // StopFailure — fire-and-forget (CC spirit: exit codes ignored)
    try {
      await runHooks({
        event: 'StopFailure',
        config: hooksConfig,
        disabled: hooksDisabled,
        cwd: getCwd(),
        signal,
        input: {
          session_id: sessionId,
          cwd: getCwd(),
          permission_mode: getMode(),
          hook_event_name: 'StopFailure',
          last_assistant_message: msg
        }
      })
    } catch {
      /* ignore */
    }
    const shown = formatTurnError(msg)
    emit({ type: 'error', message: shown })
    emit({ type: 'thinking', phase: 'end', elapsedSec: elapsed() })
    emit({ type: 'session_state', state: 'idle' })
    emit({ type: 'done', ok: false, error: shown })
    return messages.filter((m) => m.role !== 'system')
  }
}
