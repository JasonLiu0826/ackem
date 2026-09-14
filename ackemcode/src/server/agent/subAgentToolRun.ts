/**
 * B7-SA1 — single sub-agent tool call (shared by serial + parallel batches).
 */
import { nanoid } from 'nanoid'
import type {
  AckemCodeSettings,
  AgentEvent,
  ChatMessage,
  PermissionMode,
  ToolCall
} from '../../shared/types.js'
import { evaluatePermission, PermissionBroker } from './permissions.js'
import { grantWorkingDirectoryForToolPath } from './filePermissions.js'
import type { InteractionBroker } from './interactions.js'
import { maybeApplyAutoModeClassifier } from './autoModeClassifier.js'
import type { PermissionRulesConfig } from './permissionRules.js'
import { executeTool, type ReadFileState } from '../tools/index.js'
import type { TodoItem } from './todos.js'
import type { AgentRegistry } from './agentRegistry.js'
import type { BackgroundAgentHub } from './backgroundAgents.js'
import type { SessionMessageQueue } from './messageQueue.js'
import { verificationSessionAllows } from './verification.js'

type SubAgentSettings = Pick<
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

export type SubAgentToolRunOpts = {
  call: ToolCall
  agentId: string
  childDepth: number
  effectiveType: string
  builtInType: string
  toolFace: Set<string>
  verificationHardDeny: Set<string>
  settings: SubAgentSettings
  permissionRules: PermissionRulesConfig
  getMode: () => PermissionMode
  setMode: (m: PermissionMode) => void
  permissions: PermissionBroker
  interactions: InteractionBroker
  parentPermissionMode?: PermissionMode
  parentAbortController?: AbortController
  readFileState?: ReadFileState
  signal?: AbortSignal
  isFork: boolean
  messages: ChatMessage[]
  getTodos: () => TodoItem[]
  setTodos: (t: TodoItem[]) => void
  agentRegistry?: AgentRegistry
  backgroundAgents?: BackgroundAgentHub
  messageQueue?: SessionMessageQueue
  taskStore?: import('./tasks.js').TaskStore
  emit: (ev: AgentEvent) => void
}

export type SubAgentToolRunOutcome = {
  call: ToolCall
  name: string
  content: string
  ok: boolean
  output: string
}

export async function runOneSubAgentTool(
  opts: SubAgentToolRunOpts
): Promise<SubAgentToolRunOutcome> {
  const { call } = opts
  if (opts.signal?.aborted) throw new Error('aborted')

  const name = call.function.name
  let parsedInput: unknown = call.function.arguments
  try {
    parsedInput = JSON.parse(call.function.arguments || '{}')
  } catch {
    /* keep raw */
  }

  opts.emit({
    type: 'tool_start',
    id: call.id,
    name,
    input: parsedInput,
    agentId: opts.agentId
  })

  const finish = (content: string, ok: boolean): SubAgentToolRunOutcome => ({
    call,
    name,
    content,
    ok,
    output: content
  })

  if (!opts.toolFace.has(name)) {
    const denied = `Tool "${name}" is not available to this agent (allowed: ${[...opts.toolFace].join(', ')}). Complete the task with your allowed tools.`
    return finish(denied, false)
  }

  if (
    opts.builtInType === 'verification' &&
    opts.verificationHardDeny.has(name)
  ) {
    return finish(
      'Verification agent cannot modify the project (read/test only).',
      false
    )
  }

  const additionalWorkingDirectories =
    opts.permissions.getAdditionalWorkingDirectories()
  let verdict = evaluatePermission({
    toolName: name,
    input: parsedInput,
    mode: opts.getMode(),
    rules: opts.permissionRules,
    additionalWorkingDirectories,
    sessionAllows: (t, inp) => {
      if (
        opts.builtInType === 'verification' &&
        verificationSessionAllows(t, inp, opts.settings.verifyCommand)
      ) {
        return true
      }
      return opts.permissions.sessionAllows(t, inp)
    },
    sessionToolClassAllows: (t) => opts.permissions.sessionAllowsToolClass(t),
    cwd: opts.settings.cwd
  })

  const autoClassifierActive =
    opts.getMode() === 'auto' || opts.parentPermissionMode === 'auto'
  if (
    autoClassifierActive &&
    verdict.behavior === 'ask' &&
    !verdict.classifierCandidate &&
    opts.parentPermissionMode === 'auto'
  ) {
    const autoProbe = evaluatePermission({
      toolName: name,
      input: parsedInput,
      mode: 'auto',
      rules: opts.permissionRules,
      sessionAllows: (t, inp) => opts.permissions.sessionAllows(t, inp),
      sessionToolClassAllows: (t) => opts.permissions.sessionAllowsToolClass(t),
      cwd: opts.settings.cwd,
      additionalWorkingDirectories
    })
    if (autoProbe.classifierCandidate) {
      verdict = { ...verdict, classifierCandidate: true }
    }
  }
  if (autoClassifierActive && opts.settings.apiKey) {
    verdict = await maybeApplyAutoModeClassifier(true, verdict, {
      toolName: name,
      input: parsedInput,
      cwd: opts.settings.cwd,
      settings: opts.settings,
      recentMessages: opts.messages.filter((m) => m.role !== 'system'),
      signal: opts.signal,
      permissions: opts.permissions,
      onStatus: (message) => opts.emit({ type: 'status', message })
    })
  }

  if (verdict.behavior === 'deny') {
    const denied =
      opts.builtInType === 'Explore' && verdict.planDenied
        ? 'Explore agent is read-only: mutating/exec tools are blocked.'
        : verdict.reason
    return finish(denied, false)
  }

  if (verdict.behavior === 'ask' && opts.permissions.sessionAllowsToolClass(name)) {
    verdict = { ...verdict, behavior: 'allow', reason: 'Allowed for this session (tool class)' }
  }

  if (verdict.behavior === 'ask') {
    const requestId = nanoid()
    opts.emit({
      type: 'permission_request',
      requestId,
      toolName: name,
      input: parsedInput,
      reason: `sub-agent ${opts.effectiveType}: ${verdict.reason}`
    })
    const payload = await opts.permissions.wait(requestId, {
      toolName: name,
      input: parsedInput
    })
    if (payload.decision === 'deny') {
      if (
        opts.parentAbortController &&
        !opts.parentAbortController.signal.aborted
      ) {
        opts.parentAbortController.abort('user_rejected_tool')
      }
      throw new Error('user_rejected_tool')
    }
    if (payload.decision === 'allow_session') {
      opts.permissions.rememberSession(name)
    } else if (payload.decision === 'allow_always') {
      opts.permissions.rememberSession('*')
    }
    grantWorkingDirectoryForToolPath(
      name,
      parsedInput,
      opts.settings.cwd,
      opts.permissions
    )
  }

  const result = await executeTool(name, call.function.arguments, {
    cwd: opts.settings.cwd,
    additionalWorkingDirectories: opts.permissions.getAdditionalWorkingDirectories(),
    setCwd: () => {},
    getWorktree: () => null,
    setWorktree: () => {},
    llm: {
      apiBaseUrl: opts.settings.apiBaseUrl,
      apiKey: opts.settings.apiKey,
      model: opts.settings.model,
      effort: opts.settings.effort
    },
    multimodal: opts.settings.multimodal,
    signal: opts.signal,
    getMode: opts.getMode,
    setMode: opts.setMode,
    interactions: opts.interactions,
    permissions: opts.permissions,
    permissionRules: opts.permissionRules,
    readFileState: opts.readFileState,
    emit: opts.emit,
    getTodos: opts.getTodos,
    setTodos: opts.setTodos,
    agentDepth: opts.childDepth,
    currentAgentId: opts.agentId,
    agentRegistry: opts.agentRegistry,
    backgroundAgents: opts.backgroundAgents,
    messageQueue: opts.messageQueue,
    getParentMessages: () => opts.messages.filter((m) => m.role !== 'system'),
    parentSystemPrompt:
      typeof opts.messages[0]?.content === 'string'
        ? opts.messages[0].content
        : undefined,
    isForkChild: opts.isFork,
    taskStore: opts.taskStore
  })

  const truncated =
    result.output.length > 40_000
      ? result.output.slice(0, 40_000) + '\n…[truncated]'
      : result.output

  return finish(truncated, result.ok)
}
