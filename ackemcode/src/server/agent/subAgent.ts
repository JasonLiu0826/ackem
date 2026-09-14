import { nanoid } from 'nanoid'
import type {
  AckemCodeSettings,
  AgentEvent,
  ChatMessage,
  EffortLevel,
  PermissionMode,
  ToolDefinition
} from '../../shared/types.js'
import { chatCompletion } from './llm.js'
import { flattenMessageContent } from '../../shared/messageContent.js'
import { evaluatePermission, PermissionBroker } from './permissions.js'
import { maybeApplyAutoModeClassifier } from './autoModeClassifier.js'
import {
  buildAlwaysAllowRule,
  normalizePermissionRules
} from './permissionRules.js'
import { resolveEffectivePermissionRules } from './permissionsLoader.js'
import { InteractionBroker } from './interactions.js'
import {
  TOOL_DEFINITIONS,
  executeTool,
  filterEnabledTools,
  type ReadFileState
} from '../tools/index.js'
import { isReadOnlyTool } from '../tools/registry.js'
import type { TodoItem } from './todos.js'
import type { CustomAgentDef } from './loadAgentsDir.js'
import {
  finalizeVerificationReport,
  verificationSystemPrompt
} from './verification.js'
import type { AgentRegistry } from './agentRegistry.js'
import {
  buildForkPrefixMessages,
  forkSystemPrompt,
  isInForkChild
} from './forkContext.js'
import { runHooks, type HooksConfig } from '../hooks/index.js'
import { getEffectiveHooks } from '../plugins/pluginAugment.js'
import { DEFAULT_PLAN_DESIGN_PERSPECTIVES } from './tasks.js'
import {
  renderSkillPrompt,
  type LoadedSkill
} from '../skills/loadSkills.js'
import {
  injectQueuedMessages,
  isSubAgentTaskNotification,
  type SessionMessageQueue
} from './messageQueue.js'
import type { BackgroundAgentHub } from './backgroundAgents.js'
import { partitionToolCalls, mapPool } from '../tools/orchestration.js'
import { getMaxToolConcurrency } from '../tools/registry.js'
import { runOneSubAgentTool } from './subAgentToolRun.js'

export { verificationSessionAllows } from './verification.js'

export type SubAgentType =
  | 'Explore'
  | 'Plan'
  | 'general-purpose'
  | 'verification'
  | 'fork'
  | string
export type Thoroughness = 'quick' | 'medium' | 'very thorough'

/** Normalize agent type labels (case / aliases). */
export function normalizeSubAgentType(raw: string): SubAgentType {
  const t = raw.trim()
  const lower = t.toLowerCase()
  if (lower === 'explore') return 'Explore'
  if (lower === 'plan') return 'Plan'
  if (lower === 'verification') return 'verification'
  if (lower === 'general-purpose' || lower === 'generalpurpose') {
    return 'general-purpose'
  }
  if (lower === 'fork') return 'fork'
  return t
}

/** Main session = 0; first child = 1; spawning at depth ≥1 → depth ≥2 rejected. */
export const MAX_AGENT_DEPTH = 1

export const FORK_SUBAGENT_TYPE = 'fork'

/** Clear reject when a child tries to spawn (CC nest / recursive-fork spirit). */
export function nestDepthRejectMessage(depth: number): string {
  return `Nested agents are not allowed (depth ≥2; current agentDepth=${depth}). Complete the task directly using your tools — do not call agent.`
}

export function recursiveForkRejectMessage(): string {
  return 'Fork is not available inside a forked worker. Complete your task directly using your tools.'
}

const EXPLORE_TOOLS = new Set([
  'read_file',
  'glob',
  'grep',
  'list_dir',
  // CC Explore keeps Bash but read-only via isReadOnly — Ackem mirrors with shellReadOnly
  'bash',
  'powershell',
  'web_search',
  'web_fetch',
  'task_get',
  'task_list'
])

/** CC verificationAgent: same read/exec surface; no write/edit/agent/notebook. */
const VERIFICATION_TOOLS = new Set([
  'read_file',
  'glob',
  'grep',
  'list_dir',
  'bash',
  'powershell',
  'web_search',
  'web_fetch',
  'task_get',
  'task_list'
])

/**
 * CC planAgent spirit: read-only architect; same tool surface as Explore
 * (no Agent / ExitPlanMode / Write / Edit).
 */
const PLAN_TOOLS = EXPLORE_TOOLS

const GENERAL_TOOLS = new Set([
  'read_file',
  'write_file',
  'search_replace',
  'notebook_edit',
  'glob',
  'grep',
  'list_dir',
  'bash',
  'powershell',
  'web_search',
  'web_fetch',
  'todo_write',
  'task_create',
  'task_get',
  'task_update',
  'task_list',
  // S09: keep agent in pool so depth≥2 is an explicit reject (not silent omit)
  'agent',
  // GM-AGENT: TaskStop / TaskOutput spirit (main + GP; Explore stays read-only)
  'agent_stop',
  'agent_output',
  'ask_user',
  'invoke_skill',
  'list_skills',
  'verify_delivery'
  // no enter/exit plan, worktree, install_skill in GP v1
])

function toolSetFor(type: SubAgentType): Set<string> {
  if (type === 'verification') return VERIFICATION_TOOLS
  if (type === 'Explore') return EXPLORE_TOOLS
  if (type === 'Plan') return PLAN_TOOLS
  if (type === 'fork' || type === FORK_SUBAGENT_TYPE) return GENERAL_TOOLS
  return GENERAL_TOOLS
}

export function maxTurnsForAgent(
  type: SubAgentType,
  thoroughness: Thoroughness = 'medium'
): number {
  if (type === 'fork' || type === FORK_SUBAGENT_TYPE) return 40
  if (type === 'general-purpose') return 40
  if (type === 'verification') {
    switch (thoroughness) {
      case 'quick':
        return 10
      case 'very thorough':
        return 30
      default:
        return 18
    }
  }
  if (type === 'Plan') {
    switch (thoroughness) {
      case 'quick':
        return 10
      case 'very thorough':
        return 28
      default:
        return 18
    }
  }
  switch (thoroughness) {
    case 'quick':
      return 12
    case 'very thorough':
      return 40
    default:
      return 25
  }
}

export function toolNamesForAgent(type: SubAgentType): string[] {
  return [...toolSetFor(type)]
}

export function filterToolDefinitions(type: SubAgentType): ToolDefinition[] {
  const allowed = toolSetFor(type)
  return filterEnabledTools(
    TOOL_DEFINITIONS.filter((t) => allowed.has(t.function.name))
  )
}

function exploreSystemPrompt(cwd: string, thoroughness: Thoroughness): string {
  const depth =
    thoroughness === 'quick'
      ? 'quick: a few targeted glob/grep hits, then read 1–3 files. Stop when you can answer.'
      : thoroughness === 'very thorough'
        ? 'very thorough: several directories and naming conventions; do not stop at the first hit.'
        : 'medium: more than one naming convention / folder; read the concrete files you name.'
  return `You are a file search specialist for AckemCode.

Working directory: ${cwd}
Thoroughness: ${thoroughness} — ${depth}

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
You are STRICTLY PROHIBITED from creating, modifying, or deleting files.
Allowed tools: read_file, glob, grep, list_dir, bash, powershell, web_search, web_fetch.
Shell is READ-ONLY only: git status/log/diff, ls/dir, cat/type, find, rg/grep, pwd, etc.
Forbidden shell: write redirects, git add/commit/push, rm, npm install, package mutations.

How to search (CC Explore spirit):
- glob for file-name patterns; grep for content/regex; read_file when you already have a path.
- Prefer several glob/grep/read calls in the same turn (parallel).
- Final answer is a normal message: paths, what you found, what is still open. Do not create files.
- Do not invent machine tags (LOCATE_*, DONE_*). Only verification agents use VERDICT: PASS|FAIL|PARTIAL.

Do NOT attempt to edit files or call tools you do not have.`
}

/** Design lenses come from tasks.DEFAULT_PLAN_DESIGN_PERSPECTIVES (single source). */

/**
 * CC planAgent spirit: read-only architect. Synthesize a design from an assigned
 * perspective; end with Critical Files. No writes / no nested agents.
 */
export function planSystemPrompt(
  cwd: string,
  thoroughness: Thoroughness,
  designLens?: string
): string {
  const lenses = DEFAULT_PLAN_DESIGN_PERSPECTIVES.map(
    (p, i) => `  ${i + 1}. ${p}`
  ).join('\n')
  const lensBlock = designLens?.trim()
    ? `Assigned design lens for this run: ${designLens.trim()}
Prioritize this lens; still note trade-offs vs the other lenses below.`
    : `If the user message includes a [Plan perspective / focus: …] tag, treat that as your assigned design lens.
Otherwise pick the most relevant lens from the list below and state which you used.`
  return `You are a read-only planning architect for AckemCode.

Working directory: ${cwd}
Thoroughness: ${thoroughness}

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
You are STRICTLY PROHIBITED from creating, modifying, or deleting files.
Allowed tools: read_file, glob, grep, list_dir, bash, powershell, web_search, web_fetch, task_get, task_list.
Shell is READ-ONLY only (same as Explore). No nested agent / write / edit / plan-exit tools.

${lensBlock}

Standard design lenses:
${lenses}

Your role:
1. Gather just enough evidence (prefer targeted reads over broad dumps).
2. Design an approach from your assigned lens — concrete steps, files, risks, tests.
3. End with a **Critical Files** list (paths the implementer must touch or verify).
Do NOT implement. Do NOT call exit_plan_mode. Return a structured markdown design for the parent to merge.`
}

function generalSystemPrompt(cwd: string): string {
  return `You are a general-purpose sub-agent for AckemCode. Complete the assigned task fully—don't gold-plate, but don't leave it half-done.

Working directory: ${cwd}

When finished, respond with a concise report covering what was done and key findings — the parent agent will relay this to the user (you do not talk to the user directly).

Guidelines:
- Search broadly when unsure where something lives; use read_file when you know the path.
- Prefer editing existing files over creating new ones.
- Never invent file contents; use tools for evidence.
- Use ask_user only when blocked on a decision the parent did not resolve.
- Use invoke_skill when the task explicitly names an installed skill.
- Call verify_delivery before claiming delivery when tests/build matter.`
}

export interface RunSubAgentOpts {
  type: SubAgentType
  prompt: string
  description?: string
  thoroughness?: Thoroughness
  /** When set, overrides built-in Explore/GP tool set + system prompt */
  customAgent?: CustomAgentDef
  settings: Pick<
    AckemCodeSettings,
    | 'apiBaseUrl'
    | 'apiKey'
    | 'model'
    | 'effort'
    | 'cwd'
    | 'permissionRules'
    | 'verifyCommand'
    | 'hooks'
    | 'disableAllHooks'
    | 'autoMode'
    | 'multimodal'
  >
  /** Parent permission broker — nested write/exec can ask the user */
  permissions: PermissionBroker
  interactions: InteractionBroker
  readFileState?: ReadFileState
  emit: (event: AgentEvent) => void
  signal?: AbortSignal
  /** Optional shared todos for general-purpose */
  getTodos?: () => TodoItem[]
  setTodos?: (todos: TodoItem[]) => void
  /** S09: session sidechain registry (resume by agentId) */
  agentRegistry?: AgentRegistry
  /** S09: resume existing sidechain (same agentId) */
  resumeAgentId?: string
  /**
   * S09: parent conversation for fork prefix (CC buildForkedMessages spirit).
   * Used when type=fork and not resuming.
   */
  parentMessages?: ChatMessage[]
  /** S09: parent system prompt bytes for fork cache-prefix parity */
  parentSystemPrompt?: string
  /** S09: depth of the *parent* caller (0 = main). Child runs at parent+1. */
  parentAgentDepth?: number
  /** S10: share session Task store with children */
  taskStore?: import('./tasks.js').TaskStore
  /** Hooks / SessionStart linkage */
  sessionId?: string
  /** §5.3 #11: pre-allocate agentId for background spawn (tool returns id immediately) */
  forceAgentId?: string
  /**
   * R6: override the permission mode chosen from the agent type. Used by
   * forked skills without allowed-tools to lock the child read-only ('plan').
   */
  permissionModeOverride?: PermissionMode
  /** Parent session mode — when `auto`, gray-zone asks run the LLM classifier. */
  parentPermissionMode?: PermissionMode
  /** Foreground only: user deny on nested permission aborts parent turn. */
  parentAbortController?: AbortController
  /** CC query.ts: scoped task-notifications for this sub-agent. */
  messageQueue?: SessionMessageQueue
  backgroundAgents?: BackgroundAgentHub
  /** K4: spawn-time isolation tree (persisted so resume can re-enter). */
  isolationWorktree?: import('../tools/worktree/worktree.js').WorktreeSession
}

export interface RunSubAgentResult {
  ok: boolean
  agentId: string
  report: string
  turns: number
  error?: string
  /** S08: set when subagent_type=verification */
  verifyVerdict?: 'PASS' | 'FAIL' | 'PARTIAL' | null
  /** S09: true when this run used fork prefix inheritance */
  forked?: boolean
  /** S09: true when continued from registry transcript */
  resumed?: boolean
  /** S09: number of non-system parent messages reused in fork prefix */
  forkPrefixCount?: number
}

function resolveBuiltInType(
  type: SubAgentType,
  custom?: CustomAgentDef
): 'Explore' | 'Plan' | 'general-purpose' | 'verification' | 'fork' {
  if (custom) return 'general-purpose'
  if (type === 'fork' || type === FORK_SUBAGENT_TYPE) return 'fork'
  if (type === 'verification') return 'verification'
  if (type === 'general-purpose') return 'general-purpose'
  if (type === 'Plan') return 'Plan'
  if (type === 'Explore') return 'Explore'
  return 'Explore'
}

function persistTranscript(
  registry: AgentRegistry | undefined,
  entry: {
    agentId: string
    name: string
    description: string
    subagentType: string
    depth: number
    isFork: boolean
    transcript: ChatMessage[]
    lastSummary?: string
  },
  isolation?: import('../tools/worktree/worktree.js').WorktreeSession
): void {
  if (!registry) return
  const existing = registry.get(entry.agentId)
  const iso = isolation
    ? {
        isolationWorktreePath: isolation.worktreePath,
        isolationWorktreeBranch: isolation.worktreeBranch,
        isolationOriginalCwd: isolation.originalCwd,
        isolationOriginalHeadCommit: isolation.originalHeadCommit,
        isolationWorktreeName: isolation.worktreeName
      }
    : undefined
  if (existing) {
    registry.updateTranscript(entry.agentId, entry.transcript, entry.lastSummary)
    if (iso) registry.updateIsolation(entry.agentId, iso)
  } else {
    registry.register({ ...entry, ...iso })
  }
}

/**
 * Nested agent loop (M15 + S09). Explore/verification read-only; GP/fork may mutate
 * (subject to parent permissions). Nesting depth ≥2 rejected at agent tool.
 */
export async function runSubAgent(opts: RunSubAgentOpts): Promise<RunSubAgentResult> {
  const thoroughness = opts.thoroughness ?? 'medium'
  const custom = opts.customAgent
  const parentDepth = opts.parentAgentDepth ?? 0
  const childDepth = parentDepth + 1

  const resumeId = opts.resumeAgentId?.trim()
  const resumedEntry = resumeId ? opts.agentRegistry?.get(resumeId) : undefined
  if (resumeId && !resumedEntry) {
    return {
      ok: false,
      agentId: resumeId,
      report: `No transcript found for agent ID: ${resumeId}`,
      turns: 0,
      error: 'resume_not_found',
      resumed: true
    }
  }

  const isResume = Boolean(resumedEntry)
  const agentId =
    resumedEntry?.agentId ??
    (opts.forceAgentId?.trim() || nanoid(10))
  const typeFromResume = resumedEntry?.subagentType
  const effectiveType = (typeFromResume || opts.type) as SubAgentType
  const builtInType = resolveBuiltInType(effectiveType, isResume ? undefined : custom)
  const isFork = builtInType === 'fork' || Boolean(resumedEntry?.isFork)
  const maxTurns =
    custom?.maxTurns && custom.maxTurns > 0 && !isResume
      ? custom.maxTurns
      : maxTurnsForAgent(builtInType, thoroughness)

  let tools: ToolDefinition[]
  if (custom && !isResume && !isFork) {
    const deny = new Set(custom.disallowedTools)
    // Keep agent out of custom cold-starts unless fork (nest gate handles depth)
    deny.add('agent')
    if (custom.tools.length) {
      const allow = new Set(custom.tools)
      tools = TOOL_DEFINITIONS.filter(
        (t) => allow.has(t.function.name) && !deny.has(t.function.name)
      )
    } else {
      tools = filterToolDefinitions('general-purpose').filter(
        (t) => !deny.has(t.function.name)
      )
    }
  } else {
    tools = filterToolDefinitions(builtInType)
  }

  // Explore/Plan: plan (read-only shell). Verification: default + scoped sessionAllows
  // (verify command + read-only shell); S13 still blocks critical destructive shell.
  const mode: PermissionMode =
    opts.permissionModeOverride ??
    ((builtInType === 'Explore' || builtInType === 'Plan') && !custom
      ? 'plan'
      : 'default')
  const getMode = () => mode
  const setMode = (_m: PermissionMode) => {
    /* explore/plan/verification locked; general/fork ignore mode changes */
  }
  const VERIFICATION_HARD_DENY = new Set([
    'write_file',
    'search_replace',
    'notebook_edit',
    'agent',
    'install_skill',
    'uninstall_skill',
    'todo_write',
    'enter_worktree',
    'exit_worktree',
    'cron_create',
    'enter_plan_mode',
    'exit_plan_mode'
  ])
  const permissionRulesHost = normalizePermissionRules(opts.settings.permissionRules)
  const todos: TodoItem[] = []
  const getTodos = opts.getTodos ?? (() => todos)
  const setTodos = opts.setTodos ?? ((t: TodoItem[]) => {
    todos.length = 0
    todos.push(...t)
  })

  // Sub-agents: merge layered rules once (mode locked; strip follows current mode)
  let permissionRules = permissionRulesHost
  try {
    const eff = await resolveEffectivePermissionRules({
      cwd: opts.settings.cwd,
      hostRules: permissionRulesHost,
      permissionMode: mode
    })
    permissionRules = eff.rules
  } catch {
    permissionRules = permissionRulesHost
  }

  const typeLabel = custom?.name || effectiveType
  const description =
    opts.description ||
    resumedEntry?.description ||
    opts.prompt.slice(0, 120)

  opts.emit({
    type: 'agent_started',
    agentId,
    subagentType: typeLabel,
    description: isResume ? `${description} (resumed)` : description,
    thoroughness:
      (builtInType === 'Explore' ||
        builtInType === 'Plan' ||
        builtInType === 'verification') &&
      !custom
        ? thoroughness
        : undefined
  })

  /** CC query.ts: drain task-notifications addressed to this sub-agent. */
  const drainSubAgentNotifications = (): number => {
    if (!opts.messageQueue?.length) return 0
    const items = opts.messageQueue.drainMidTurn('later', (cmd) =>
      isSubAgentTaskNotification(cmd, agentId)
    )
    if (!items.length) return 0
    injectQueuedMessages(messages, items)
    for (const item of items) {
      opts.emit({
        type: 'message_dequeued',
        id: item.id,
        text: item.text,
        remaining: opts.messageQueue!.length,
        mode: item.mode
      })
    }
    opts.emit({
      type: 'status',
      message: `sub-agent [${agentId}] injected task-notification ×${items.length}`
    })
    return items.length
  }

  let messages: ChatMessage[]
  let forkPrefixCount: number | undefined

  if (isResume && resumedEntry) {
    messages = [
      ...resumedEntry.transcript,
      { role: 'user', content: opts.prompt }
    ]
  } else if (isFork) {
    const parent = opts.parentMessages ?? []
    if (isInForkChild(parent)) {
      const msg = recursiveForkRejectMessage()
      opts.emit({
        type: 'agent_finished',
        agentId,
        ok: false,
        turns: 0,
        reportPreview: msg
      })
      return {
        ok: false,
        agentId,
        report: msg,
        turns: 0,
        error: 'recursive_fork',
        forked: true
      }
    }
    const system = forkSystemPrompt(opts.settings.cwd, opts.parentSystemPrompt)
    const prefix = buildForkPrefixMessages(parent, opts.prompt)
    forkPrefixCount = prefix.length - 1 // exclude directive user turn
    messages = [{ role: 'system', content: system }, ...prefix]
  } else {
    const designLens =
      builtInType === 'Plan'
        ? opts.prompt.match(/\[Plan perspective\s*\/\s*focus:\s*([^\]]+)\]/i)?.[1]?.trim()
        : undefined
    const system = custom
      ? `${custom.systemPrompt}\n\nWorking directory: ${opts.settings.cwd}`
      : builtInType === 'verification'
        ? verificationSystemPrompt(
            opts.settings.cwd,
            opts.settings.verifyCommand,
            { taskSummary: opts.prompt.slice(0, 2000) }
          )
        : builtInType === 'Plan'
          ? planSystemPrompt(opts.settings.cwd, thoroughness, designLens)
          : builtInType === 'Explore'
            ? exploreSystemPrompt(opts.settings.cwd, thoroughness)
            : generalSystemPrompt(opts.settings.cwd)

    messages = [
      { role: 'system', content: system },
      { role: 'user', content: opts.prompt }
    ]
  }

  // SubagentStart — inject additionalContext (CC AgentTool/runAgent spirit)
  const hooksConfig = getEffectiveHooks(
    (opts.settings.hooks ?? {}) as HooksConfig,
    opts.settings.cwd || process.cwd()
  )
  const hooksDisabled = opts.settings.disableAllHooks === true
  try {
    const start = await runHooks({
      event: 'SubagentStart',
      config: hooksConfig,
      disabled: hooksDisabled,
      cwd: opts.settings.cwd,
      signal: opts.signal,
      input: {
        session_id: opts.sessionId || 'session',
        cwd: opts.settings.cwd,
        hook_event_name: 'SubagentStart',
        agent_id: agentId,
        agent_type: typeLabel
      }
    })
    if (start.additionalContext.length) {
      messages.push({
        role: 'user',
        content: `[SubagentStart hook context]\n${start.additionalContext.join('\n')}`
      })
    }
  } catch {
    /* never block spawn */
  }

  let turns = 0
  let lastText = ''
  // R6: hard tool-face enforcement (CC forked-agent tool constraint). The
  // model was only shown `tools`; any other name is a violation — reject,
  // never execute.
  const toolFace = new Set(tools.map((t) => t.function.name))

  const runSubagentStop = async (lastMsg?: string) => {
    try {
      await runHooks({
        event: 'SubagentStop',
        config: hooksConfig,
        disabled: hooksDisabled,
        cwd: opts.settings.cwd,
        signal: opts.signal,
        input: {
          session_id: opts.sessionId || 'session',
          cwd: opts.settings.cwd,
          hook_event_name: 'SubagentStop',
          agent_id: agentId,
          agent_type: typeLabel,
          last_assistant_message: lastMsg
        }
      })
    } catch {
      /* ignore */
    }
  }

  const finishPersist = (summary?: string) => {
    persistTranscript(
      opts.agentRegistry,
      {
        agentId,
        name: typeLabel,
        description,
        subagentType: String(effectiveType),
        depth: childDepth,
        isFork,
        transcript: messages,
        lastSummary: summary
      },
      opts.isolationWorktree
    )
  }

  try {
    while (turns < maxTurns) {
      if (opts.signal?.aborted) throw new Error('aborted')
      turns += 1

      opts.emit({
        type: 'agent_progress',
        agentId,
        turn: turns,
        maxTurns,
        text: turns === 1
          ? isResume
            ? '子代理续跑中…'
            : isFork
              ? 'Fork 子代理思考中…'
              : '子代理思考中…'
          : `子代理第 ${turns} 轮…`
      })

      drainSubAgentNotifications()

      const { message: assistant } = await chatCompletion({
        apiBaseUrl: opts.settings.apiBaseUrl,
        apiKey: opts.settings.apiKey,
        model: opts.settings.model,
        effort: (opts.settings.effort || 'medium') as EffortLevel,
        messages,
        tools,
        signal: opts.signal,
        multimodal: opts.settings.multimodal
      })

      messages.push(assistant)
      const text = flattenMessageContent(assistant.content).trim()
      const calls = assistant.tool_calls ?? []

      if (calls.length) {
        const toolRunBase = {
          agentId,
          childDepth,
          effectiveType,
          builtInType,
          toolFace,
          verificationHardDeny: VERIFICATION_HARD_DENY,
          settings: opts.settings,
          permissionRules,
          getMode,
          setMode,
          permissions: opts.permissions,
          interactions: opts.interactions,
          parentPermissionMode: opts.parentPermissionMode,
          parentAbortController: opts.parentAbortController,
          readFileState: opts.readFileState,
          signal: opts.signal,
          isFork,
          messages,
          getTodos,
          setTodos,
          agentRegistry: opts.agentRegistry,
          backgroundAgents: opts.backgroundAgents,
          messageQueue: opts.messageQueue,
          taskStore: opts.taskStore,
          emit: opts.emit
        }
        const batches = partitionToolCalls(calls)
        for (const batch of batches) {
          if (opts.signal?.aborted) throw new Error('aborted')
          if (batch.isConcurrencySafe && batch.calls.length > 1) {
            opts.emit({
              type: 'status',
              message: `sub-agent parallel tools ×${batch.calls.length}…`
            })
          }
          const outcomes =
            batch.isConcurrencySafe && batch.calls.length > 1
              ? await mapPool(
                  batch.calls,
                  getMaxToolConcurrency(),
                  (call) => runOneSubAgentTool({ ...toolRunBase, call })
                )
              : await (async () => {
                  const out = []
                  for (const call of batch.calls) {
                    out.push(await runOneSubAgentTool({ ...toolRunBase, call }))
                  }
                  return out
                })()
          for (const o of outcomes) {
            messages.push({
              role: 'tool',
              tool_call_id: o.call.id,
              name: o.name,
              content: o.content
            })
            opts.emit({
              type: 'tool_result',
              id: o.call.id,
              name: o.name,
              ok: o.ok,
              output: o.output,
              agentId
            })
          }
        }
        drainSubAgentNotifications()
        continue
      }

      if (drainSubAgentNotifications() > 0) {
        continue
      }

      lastText = text || '(sub-agent finished with empty report)'
      let verifyVerdict: RunSubAgentResult['verifyVerdict']
      let reportOut = lastText
      if (builtInType === 'verification') {
        const finalized = finalizeVerificationReport(lastText)
        verifyVerdict = finalized.verdict
        if (finalized.reasons.length) {
          reportOut = `${lastText}\n\n[GM-VERIFY evidence gate]\n${finalized.reasons.join('\n')}\nVERDICT: ${finalized.verdict ?? 'MISSING'}`
        }
      }
      const ok =
        builtInType === 'verification' ? verifyVerdict === 'PASS' : true
      finishPersist(reportOut.slice(0, 500))
      await runSubagentStop(reportOut.slice(0, 2000))
      opts.emit({
        type: 'agent_finished',
        agentId,
        ok,
        turns,
        reportPreview: reportOut.slice(0, 500)
      })
      return {
        ok,
        agentId,
        report: reportOut,
        turns,
        verifyVerdict:
          builtInType === 'verification' ? verifyVerdict : undefined,
        error:
          builtInType === 'verification' && verifyVerdict !== 'PASS'
            ? verifyVerdict
              ? `verify_${verifyVerdict.toLowerCase()}`
              : 'missing_verdict'
            : undefined,
        forked: isFork,
        resumed: isResume,
        forkPrefixCount
      }
    }

    const err = `Sub-agent reached maxTurns (${maxTurns})`
    let maxTurnsVerdict: RunSubAgentResult['verifyVerdict']
    let maxTurnsReport = lastText || err
    if (builtInType === 'verification') {
      const finalized = finalizeVerificationReport(maxTurnsReport)
      maxTurnsVerdict = finalized.verdict
      if (finalized.reasons.length || !finalized.verdict) {
        maxTurnsReport = `${maxTurnsReport}\n\n[GM-VERIFY evidence gate]\n${(finalized.reasons.length ? finalized.reasons : ['missing VERDICT (maxTurns)']).join('\n')}\nVERDICT: ${finalized.verdict ?? 'MISSING'}`
      }
    }
    finishPersist(maxTurnsReport.slice(0, 500) || err)
    await runSubagentStop(maxTurnsReport.slice(0, 2000))
    opts.emit({
      type: 'agent_finished',
      agentId,
      ok: false,
      turns,
      reportPreview: maxTurnsReport.slice(0, 500) || err
    })
    return {
      ok: false,
      agentId,
      report: maxTurnsReport || err,
      turns,
      error: 'max_turns',
      verifyVerdict:
        builtInType === 'verification' ? maxTurnsVerdict : undefined,
      forked: isFork,
      resumed: isResume,
      forkPrefixCount
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    finishPersist(msg)
    await runSubagentStop()
    opts.emit({
      type: 'agent_finished',
      agentId,
      ok: false,
      turns,
      reportPreview: msg
    })
    return {
      ok: false,
      agentId,
      report: msg,
      turns,
      error: msg,
      forked: isFork,
      resumed: isResume,
      forkPrefixCount
    }
  }
}

// ---------------------------------------------------------------------------
// R6-SKILLFORK · real forked skill execution (CC executeForkedSkill spirit)
// ---------------------------------------------------------------------------

/**
 * Map SKILL.md `allowed-tools` names (often CC-style: Read, Grep, Bash, Edit…)
 * onto Ackem tool names. Unknown names are dropped (fail-closed to the
 * declared surface); exact Ackem tool names pass through.
 */
const SKILL_TOOL_NAME_MAP: Record<string, string[]> = {
  read: ['read_file'],
  readfile: ['read_file'],
  grep: ['grep'],
  glob: ['glob'],
  ls: ['list_dir'],
  listdir: ['list_dir'],
  bash: ['bash', 'powershell'],
  powershell: ['powershell'],
  shell: ['bash', 'powershell'],
  edit: ['search_replace'],
  strreplace: ['search_replace'],
  multiedit: ['search_replace'],
  write: ['write_file'],
  writefile: ['write_file'],
  notebookedit: ['notebook_edit'],
  webfetch: ['web_fetch'],
  websearch: ['web_search'],
  todowrite: ['todo_write']
}

export function mapSkillAllowedTools(names: string[]): string[] {
  const ackemNames = new Set(TOOL_DEFINITIONS.map((t) => t.function.name))
  const out = new Set<string>()
  for (const raw of names) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    // Strip CC rule suffixes like Bash(git:*) down to the tool name
    const base = trimmed.replace(/\(.*\)$/, '')
    if (ackemNames.has(base)) {
      out.add(base)
      continue
    }
    const mapped = SKILL_TOOL_NAME_MAP[base.toLowerCase().replace(/[_-]/g, '')]
    for (const m of mapped ?? []) out.add(m)
  }
  return [...out]
}

/** Tools a forked skill must never get, regardless of allowed-tools. */
const FORK_SKILL_DENY = [
  'agent',
  'agent_stop',
  'agent_output',
  'invoke_skill',
  'install_skill',
  'uninstall_skill',
  'enter_worktree',
  'exit_worktree',
  'enter_plan_mode',
  'exit_plan_mode'
]

function forkedSkillSystemPrompt(
  skill: LoadedSkill,
  renderedBody: string,
  cwd: string,
  readOnly: boolean
): string {
  return `You are an isolated worker executing the skill "${skill.name}" for AckemCode.
You do NOT see the parent conversation — everything you need is in the skill
instructions and the task message below.

Working directory: ${cwd}
${readOnly ? 'You are READ-ONLY: no file creation/modification/deletion, shell for inspection only.\n' : ''}
Follow the skill instructions to complete the task, then reply with a concise
final report (findings, actions taken, remaining risks). The parent agent only
receives that report. You cannot spawn nested agents.

----- SKILL START -----
${renderedBody}
----- SKILL END -----`
}

export interface RunForkedSkillOpts {
  skill: LoadedSkill
  args: string
  settings: RunSubAgentOpts['settings']
  permissions: PermissionBroker
  interactions: InteractionBroker
  readFileState?: ReadFileState
  emit: (event: AgentEvent) => void
  signal?: AbortSignal
  agentRegistry?: AgentRegistry
  parentAgentDepth?: number
  taskStore?: import('./tasks.js').TaskStore
  sessionId?: string
  getTodos?: () => TodoItem[]
  setTodos?: (todos: TodoItem[]) => void
  parentPermissionMode?: PermissionMode
  parentAbortController?: AbortController
}

/**
 * Contract 1-3: run a context:fork skill in a real sub-agent. The skill body
 * becomes the child's system prompt; the parent only receives the report.
 * allowed-tools constrains the tool surface; undeclared → read-only Explore
 * set. Failure/timeout returns a structured error, never silence.
 */
export async function runForkedSkill(
  opts: RunForkedSkillOpts
): Promise<{ ok: boolean; output: string }> {
  const { skill } = opts
  const mapped = mapSkillAllowedTools(skill.allowedTools)
  const readOnly = mapped.length === 0
  const tools = readOnly ? [...EXPLORE_TOOLS] : mapped

  const rendered = renderSkillPrompt(skill, opts.args)
  const custom: CustomAgentDef = {
    name: `skill:${skill.name}`,
    description: skill.description,
    tools,
    disallowedTools: [...FORK_SKILL_DENY],
    maxTurns: 30,
    systemPrompt: forkedSkillSystemPrompt(
      skill,
      rendered,
      opts.settings.cwd,
      readOnly
    ),
    sourcePath: skill.skillMdPath
  }

  const result = await runSubAgent({
    type: 'general-purpose',
    prompt: opts.args.trim()
      ? `Execute the skill now. Arguments from the caller:\n${opts.args.trim()}`
      : 'Execute the skill instructions now and report the results.',
    description: `forked skill: ${skill.name}`,
    customAgent: custom,
    permissionModeOverride: readOnly ? 'plan' : undefined,
    parentPermissionMode: opts.parentPermissionMode,
    parentAbortController: opts.parentAbortController,
    settings: opts.settings,
    permissions: opts.permissions,
    interactions: opts.interactions,
    readFileState: opts.readFileState,
    emit: opts.emit,
    signal: opts.signal,
    agentRegistry: opts.agentRegistry,
    parentAgentDepth: opts.parentAgentDepth,
    taskStore: opts.taskStore,
    sessionId: opts.sessionId,
    getTodos: opts.getTodos,
    setTodos: opts.setTodos
  })

  const header = [
    `Forked skill "${skill.name}" ${result.ok ? 'completed' : 'failed'} (agentId=${result.agentId}, turns=${result.turns}).`,
    result.error ? `error=${result.error}` : null,
    ''
  ]
    .filter((l) => l != null)
    .join('\n')
  return { ok: result.ok, output: header + result.report }
}
