import {trustedFrom,toReceiptEvent} from '../ackemcode/receiptProjection'
import type { ChannelPlan } from '../../shared/channelPlan'
import {randomUUID} from 'node:crypto'
import type { ExtensionsCoordinator } from '../extensions/coordinator'
import type { EngineSnapshot } from '../extensions/protocols'
import { executeDispatchedExtension } from '../extensions/dispatch/dispatchExecutor'
import { isWeatherQuery } from '../extensions/skills/builtin/tool/weather-sense/weatherIntent'
import { preExecuteWeatherQuery } from '../extensions/skills/builtin/tool/weather-sense/weatherPreExecute'
import { abortCodeSession, createCodeSession, enqueueCodeFollow, startChatStream } from '../ackemcode/client'
import type { AgentEvent } from '../ackemcode/protocol'
import type { ActionRun, ActionStatus, MemoryRecordResult, TrustedHostReceipt } from '../memory/contracts.js'
import { getMemorySystem } from '../memory/bootstrap.js'
import { stableActionRunId, withPersistedAction } from '../memory/adapters/actionExecution.js'
import {
  findLivePlugin,
  openActionPort,
  sessionHasLiveWork,
  type ActionPort
} from '../memory/adapters/composeMemorySystem.js'
import { enqueueFollow, getSlot, mirrorQueuedJob, projectWorkCache, type SlotStatus } from './pinnedSlot'
import { resolveWorkCwd } from './resolveWorkCwd'
import { startPluginRuntime } from './pluginRuntime'
import { learnUserInvocationForDataRoot } from '../route/userInvocations.js'
import { pickSlots } from './residualSlots'

export type ActionOutcomeStatus =
  | 'not_executed'
  | 'queued'
  | 'running'
  | 'waiting_permission'
  | 'succeeded'
  | 'failed'
  | 'aborted'
  | 'unknown'

export type ExecuteResult = {
  extraInjections: string[]
  handedToWorker: boolean
  queued: boolean
  runId?: string
  status: ActionOutcomeStatus
  receipt?: Record<string, unknown>
  error?: string
  /** Side effect already happened, but the ledger write did not. */
  memoryDegraded?: boolean
}

function result(partial: ExecuteResult): ExecuteResult {
  return partial
}

function slotStatusFor(status: ActionStatus): SlotStatus {
  if (status === 'succeeded') return 'delivered'
  if (status === 'failed') return 'failed'
  if (status === 'aborted') return 'aborted'
  if (status === 'waiting_permission') return 'waiting_permission'
  if (status === 'unknown') return 'unknown'
  if (status === 'queued') return 'idle'
  return 'running'
}

function projectRun(chatSessionId: string, run: ActionRun | null, codeSessionId?: string | null): void {
  if (!run || run.nature !== 'work') return
  if (run.status === 'queued') {
    mirrorQueuedJob(chatSessionId, {
      id: run.runId,
      prompt: run.execution?.prompt ?? run.targetId,
      cwd: run.execution?.cwd,
      plan: {
        channel: 'work',
        intent: (run.execution?.intent as ChannelPlan['intent']) ?? 'work',
        tag: run.execution?.tag ?? null,
        cwd: run.execution?.cwd,
        workKind: run.execution?.workKind,
        params: run.execution?.params ?? {},
        grounding: ''
      }
    })
    return
  }
  projectWorkCache(chatSessionId, {
    status: slotStatusFor(run.status),
    codeSessionId: codeSessionId ?? run.runtimeId,
    summary: run.execution?.prompt ?? '',
    cwd: run.execution?.cwd
  })
}

function memoryFailure(message: string): ExecuteResult {
  return result({
    extraInjections: [],
    handedToWorker: false,
    queued: false,
    status: 'not_executed',
    error: message
  })
}

export async function executeChannel(input: {
  plan: ChannelPlan
  userText: string
  chatSessionId: string
  coordinator?: ExtensionsCoordinator | null
  snapshot?: EngineSnapshot
  dataRoot?: string
  turnId?: string
  correlationId?: string
  onWorkerEvent?: (ev: { type: string; [k: string]: unknown }) => void
}): Promise<ExecuteResult> {
  const { plan } = input
  if (plan.pendingConfirm) {
    return result({ extraInjections: [plan.grounding], handedToWorker: false, queued: false, status: 'not_executed' })
  }

  if (plan.intent === 'use' && plan.channel === 'work') {
    return result({
      extraInjections: [plan.grounding],
      handedToWorker: false,
      queued: false,
      status: 'not_executed',
      error: 'Use 不进入 AckemCode'
    })
  }

  if (plan.channel === 'chat') {
    return result({
      extraInjections: [plan.grounding, plan.chatDelivery === 'paper_card' ? '【交付】纸面卡' : ''].filter(Boolean),
      handedToWorker: false,
      queued: false,
      status: 'not_executed'
    })
  }

  if (plan.channel === 'plugin') return executePlugin(input)
  return launchOrQueueWork(input)
}

async function executePlugin(input: {
  plan: ChannelPlan
  userText: string
  chatSessionId: string
  coordinator?: ExtensionsCoordinator | null
  snapshot?: EngineSnapshot
  dataRoot?: string
  turnId?: string
  correlationId?: string
}): Promise<ExecuteResult> {
  const { plan } = input
  if (!plan.extensionId || !input.coordinator || !input.snapshot) {
    return result({
      extraInjections: [plan.grounding],
      handedToWorker: false,
      queued: false,
      status: 'not_executed',
      error: '插件未执行：缺少 extensionId'
    })
  }
  if (!input.dataRoot) return memoryFailure('记忆不可用，未执行插件')
  const port = openActionPort(input.dataRoot)
  if (!port) return memoryFailure('记忆不可用，未执行插件')

  const turnId = input.turnId || `adhoc:${input.chatSessionId}`
  const runId = stableActionRunId(['plugin', input.chatSessionId, turnId, plan.planId ?? '', plan.extensionId])
  let pluginOutcome: { error?: string; memoryDegraded?: boolean } = {}
  const notes: string[] = []
  const outcome = await withPersistedAction(
    port,
    {
      runId,
      parentRunId: null,
      nature: 'plugin',
      sessionId: input.chatSessionId,
      turnId,
      correlationId: input.correlationId || turnId,
      planId: plan.planId ?? null,
      targetId: plan.extensionId,
      initialStatus: 'accepted',
      requestSummary: input.userText.slice(0, 200),
      execution: {
        prompt: input.userText,
        targetId: plan.extensionId,
        extensionId: plan.extensionId,
        params: plan.params,
        intent: plan.intent,
        tag: plan.tag ?? null
      }
    },
    async (run) => {
      pluginOutcome = await performPlugin(input, port, run, notes)
    }
  )
  if (!outcome.executed) {
    const status = outcome.run ? outcomeStatus(outcome.run.status) : 'not_executed'
    return result({
      extraInjections: [plan.grounding],
      handedToWorker: false,
      queued: outcome.reason === 'queued',
      runId: outcome.run?.runId,
      status: outcome.reason === 'not_persisted' ? 'not_executed' : status,
      error:
        outcome.reason === 'not_persisted'
          ? outcome.failure.message
          : outcome.reason === 'duplicate'
            ? '同一插件调用不会再次执行'
            : undefined
    })
  }
  const run = outcome.run
  if (pluginOutcome.memoryDegraded) {
    return result({
      extraInjections: [plan.grounding, ...notes].filter(Boolean),
      handedToWorker: false,
      queued: false,
      runId: run.runId,
      status: 'unknown',
      memoryDegraded: true,
      error: pluginOutcome.error,
      receipt: { extensionId: plan.extensionId, memoryDegraded: true }
    })
  }
  return result({
    extraInjections: [plan.grounding, ...notes].filter(Boolean),
    handedToWorker: false,
    queued: false,
    runId: run.runId,
    status: outcomeStatus(run.status),
    error: pluginOutcome.error,
    receipt: { extensionId: plan.extensionId, status: run.status }
  })
}

type PluginPerform = { error?: string; memoryDegraded?: boolean }

function afterPluginWrite(recorded: MemoryRecordResult, happened: string, fallback?: string): PluginPerform {
  if (recorded.ok) return fallback ? { error: fallback } : {}
  return { memoryDegraded: true, error: `${happened}，记忆降级：${recorded.message}` }
}

async function performPlugin(
  input: {
    plan: ChannelPlan
    userText: string
    chatSessionId: string
    coordinator?: ExtensionsCoordinator | null
    snapshot?: EngineSnapshot
    dataRoot?: string
  },
  port: ActionPort,
  run: ActionRun,
  notes: string[]
): Promise<PluginPerform> {
  const plan = input.plan
  const extensionId = plan.extensionId!
  if (isWeatherQuery(input.userText) && /weather/i.test(extensionId) && input.coordinator) {
    try {
      const pre = await preExecuteWeatherQuery(input.coordinator, input.userText)
      if (pre?.ok) {
        notes.push(pre.summary)
        return afterPluginWrite(recordPlugin(port, run, 'succeeded', pre.summary, 2), '插件已执行')
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return afterPluginWrite(recordPlugin(port, run, 'failed', message, 2, 'plugin_failed'), '插件已执行', message)
    }
  }

  const runtime = startPluginRuntime({
    extensionId,
    tag: plan.tag,
    params: plan.params
  })
  if (runtime.receipt.kind === 'timer_start') {
    if (!runtime.ok) {
      const note = runtime.note ?? '计时未开始'
      return afterPluginWrite(recordPlugin(port, run, 'failed', note, 2, 'timer_start_failed'), '计时未能开始', note)
    }
    if (runtime.note) notes.push(runtime.note)
    return {}
  }

  try {
    const exec = await executeDispatchedExtension(
      input.coordinator!,
      extensionId,
      input.userText,
      input.chatSessionId,
      input.snapshot!,
      pickSlots(plan.params)
    )
    if (exec.ok === true) {
      if (exec.contextInjection) notes.push(exec.contextInjection)
      // 阶段 4 个性化: 确认执行成功 → 原话措辞学为该插件的用户调用式 (§10)。
      const recorded = recordPlugin(port, run, 'succeeded', exec.contextInjection ?? `${extensionId} ok`, 2)
      if (recorded.ok && input.dataRoot) {
        try {
          learnUserInvocationForDataRoot(input.dataRoot, {
            phrase: input.userText,
            extensionId,
            evidenceTurnId: run.turnId
          })
        } catch {
          /* learning is best-effort, never blocks execution */
        }
      }
      return afterPluginWrite(recorded, '插件已执行')
    }
    if (exec.ok === false) {
      const note = exec.errorCode ?? '插件执行失败'
      return afterPluginWrite(
        recordPlugin(port, run, 'failed', exec.errorCode ?? 'plugin_failed', 2, exec.errorCode ?? 'plugin_failed'),
        '插件已执行',
        note
      )
    }
    return afterPluginWrite(
      recordPlugin(port, run, 'unknown', '插件结果缺少可核验证据', 2, 'unverified_plugin_result'),
      '插件已执行',
      '插件结果缺少可核验证据'
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return afterPluginWrite(recordPlugin(port, run, 'failed', message, 2, 'plugin_failed'), '插件已执行', message)
  }
}

function recordPlugin(
  port: ActionPort,
  run: ActionRun,
  outcome: 'succeeded' | 'failed' | 'unknown',
  summary: string,
  revision: number,
  errorCode?: string
): MemoryRecordResult {
  if (outcome === 'succeeded') {
    return port.record({
      kind: 'runtime.received',
      receipt: {
        source: 'plugin',
        runId: run.runId,
        extensionId: run.targetId,
        at: new Date().toISOString(),
        revision,
        outcome: 'succeeded',
        summary
      }
    })
  }
  return port.record({
    kind: 'runtime.received',
    receipt: {
      source: 'plugin',
      runId: run.runId,
      extensionId: run.targetId,
      at: new Date().toISOString(),
      revision,
      outcome,
      summary,
      errorCode
    }
  })
}

function outcomeStatus(status: ActionStatus): ActionOutcomeStatus {
  if (status === 'succeeded' || status === 'failed' || status === 'aborted' || status === 'unknown') return status
  if (status === 'waiting_permission') return 'waiting_permission'
  if (status === 'queued') return 'queued'
  if (status === 'running') return 'running'
  return 'not_executed'
}

async function launchOrQueueWork(input: {
  plan: ChannelPlan
  userText: string
  chatSessionId: string
  dataRoot?: string
  turnId?: string
  correlationId?: string
  onWorkerEvent?: (ev: { type: string; [k: string]: unknown }) => void
}): Promise<ExecuteResult> {
  const { plan } = input
  const resolved = resolveWorkCwd(plan, input.dataRoot)
  const cwd = resolved.cwd
  if (!cwd) {
    return result({
      extraInjections: [plan.grounding],
      handedToWorker: false,
      queued: false,
      status: 'not_executed',
      error: resolved.error ?? '缺少工作目录'
    })
  }
  if (!input.dataRoot) return memoryFailure('记忆不可用，未启动任务')
  if(plan.workKind!=='factory'){
    try{
      const {dispatchChatWorkJob}=await import('../tasks/chatWorkDispatch')
      const dispatch=await dispatchChatWorkJob({dataRoot:input.dataRoot,text:input.userText,turnId:input.turnId??`direct:${input.chatSessionId}:${input.correlationId??randomUUID()}`,correlationId:input.correlationId??randomUUID(),chatSessionId:input.chatSessionId,cwd,inspectionScope:typeof plan.params.inspectionScope==='string'?plan.params.inspectionScope:undefined})
      return result({extraInjections:[plan.grounding,'任务已持久化接收，最终结果仍需执行与验收'],handedToWorker:true,queued:dispatch.queued,runId:dispatch.runId,status:dispatch.queued?'queued':'running'})
    }catch(error){return memoryFailure(String((error as Error).message))}
  }
  const port = openActionPort(input.dataRoot)
  if (!port) return memoryFailure('记忆不可用，未启动任务')

  const turnId = input.turnId || `adhoc:${input.chatSessionId}:${input.userText.slice(0, 80)}`
  const runId = stableActionRunId(['work', input.chatSessionId, turnId, plan.planId ?? '', cwd, input.userText])
  let runtimeStarted = false
  const queued = sessionHasLiveWork(port, input.chatSessionId, runId)
  const outcome = await withPersistedAction(
    port,
    {
      runId,
      parentRunId: null,
      nature: 'work',
      sessionId: input.chatSessionId,
      turnId,
      correlationId: input.correlationId || turnId,
      planId: plan.planId ?? null,
      targetId: cwd,
      initialStatus: queued ? 'queued' : 'accepted',
      requestSummary: input.userText.slice(0, 200),
      execution: {
        prompt: input.userText,
        cwd,
        targetId: cwd,
        hostRunId: runId,
        workKind: plan.workKind,
        intent: plan.intent,
        tag: plan.tag ?? null,
        params: plan.params
      }
    },
    async (run) => {
      runtimeStarted = await startWorkRuntime(port, input, { ...plan, cwd }, run)
    }
  )

  if (!outcome.executed) {
    if (outcome.reason === 'not_persisted') {
      return result({
        extraInjections: [plan.grounding],
        handedToWorker: false,
        queued: false,
        status: 'not_executed',
        error: outcome.failure.message
      })
    }
    projectRun(input.chatSessionId, outcome.run)
    return result({
      extraInjections: [plan.grounding, outcome.reason === 'queued' ? '【状态】已排入下一件工队' : '【状态】同一任务不会再次执行'],
      handedToWorker: false,
      queued: outcome.reason === 'queued',
      runId: outcome.run.runId,
      status: outcomeStatus(outcome.run.status),
      error: outcome.reason === 'duplicate' ? '同一 hostRunId 不会再次执行' : undefined
    })
  }

  const live = port.getAction(outcome.run.runId) ?? outcome.run
  projectRun(input.chatSessionId, live, live.runtimeId)
  if (!runtimeStarted) {
    return result({
      extraInjections: [plan.grounding],
      handedToWorker: false,
      queued: false,
      runId: live.runId,
      status: outcomeStatus(live.status),
      error: 'Runtime 未启动'
    })
  }
  return result({
    extraInjections: [plan.grounding, '【状态】已交给内联工人。'],
    handedToWorker: true,
    queued: false,
    runId: live.runId,
    status: 'running',
    receipt: { hostRunId: runId, codeSessionId: live.runtimeId }
  })
}

async function startWorkRuntime(
  port: ActionPort,
  input: {
    chatSessionId: string
    userText: string
    dataRoot?: string
    onWorkerEvent?: (ev: { type: string; [k: string]: unknown }) => void
  },
  plan: ChannelPlan,
  run: ActionRun
): Promise<boolean> {
  const kind =
    plan.workKind === 'factory'
      ? plan.intent === 'update'
        ? 'openforu.update'
        : 'openforu.create'
      : 'work.job'
  let codeSessionId = ''
  try {
    const created = await createCodeSession({
      cwd: plan.cwd!,
      ackemTask: { kind, summary: input.userText.slice(0, 80), tag: plan.tag ?? null }
    })
    codeSessionId = created.sessionId
    port.bindRuntime(run.runId, codeSessionId)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    port.record({
      kind: 'runtime.received',
      receipt: {
        source: 'ackemcode',
        runId: run.runId,
        codeSessionId: '',
        hostRunId: run.runId,
        at: new Date().toISOString(),
        event: { type: 'unverified', reason: message }
      }
    })
    projectRun(input.chatSessionId, port.getAction(run.runId))
    return false
  }

  const hostRunId = run.execution?.hostRunId || run.runId
  const observe = (event: WorkStreamEvent) => {
    applyWorkStreamEvent(port, input.chatSessionId, run, codeSessionId, hostRunId, event, input.dataRoot, input.onWorkerEvent)
  }

  startChatStream({
    sessionId: codeSessionId,
    text: run.execution?.prompt || input.userText,
    hostRunId,
    onEvent: (ev) => observe(ev),
    onError: (err) => observe({ type: 'http_error', message: err.message }),
    onDisconnect: () => observe({ type: 'disconnected' }),
    onProtocolWarning: (warning) => observe({ type: 'protocol_warning', detail: warning.detail })
  })
  projectRun(input.chatSessionId, port.getAction(run.runId) ?? { ...run, runtimeId: codeSessionId }, codeSessionId)
  return true
}

type WorkStreamEvent =
  | AgentEvent
  | { type: 'disconnected' }
  | { type: 'http_error'; message: string }
  | { type: 'protocol_warning'; detail: string }

function applyWorkStreamEvent(
  port: ActionPort,
  chatSessionId: string,
  run: ActionRun,
  codeSessionId: string,
  hostRunId: string,
  event: WorkStreamEvent,
  dataRoot?: string,
  onWorkerEvent?: (ev: { type: string; [k: string]: unknown }) => void
): void {
  const recorded = port.record({
    kind: 'runtime.received',
    receipt: {
      source: 'ackemcode',
      runId: run.runId,
      codeSessionId,
      hostRunId,
      at: new Date().toISOString(),
      event: toReceiptEvent(event),
      trustedReceipt: 'hostTurnReceipt' in event ? trustedFrom(event.hostTurnReceipt) : undefined
    }
  })
  if (!recorded.ok) {
    onWorkerEvent?.({
      type: 'memory_degraded',
      memoryDegraded: true,
      message: `记忆降级：${recorded.message}`
    })
    return
  }
  const updated = port.getAction(run.runId)
  projectRun(chatSessionId, updated, codeSessionId)
  if (event.type !== 'disconnected' && event.type !== 'http_error' && event.type !== 'protocol_warning') {
    onWorkerEvent?.(event)
  }
  if (updated && (updated.status === 'succeeded' || updated.status === 'failed' || updated.status === 'aborted')) {
    void promoteNextJob(chatSessionId, dataRoot, onWorkerEvent)
  }
}

export {trustedFrom,toReceiptEvent} from '../ackemcode/receiptProjection'

export async function resumeQueuedWork(dataRoot: string): Promise<void> {
  const memory = getMemorySystem(dataRoot)
  await memory.recover()
  const port = openActionPort(dataRoot)
  if (!port) return
  for (const sessionId of port.listPromotableSessions()) {
    await promoteNextJob(sessionId, dataRoot)
  }
}

export async function promoteNextJob(
  chatSessionId: string,
  dataRoot?: string,
  onWorkerEvent?: (ev: { type: string; [k: string]: unknown }) => void
): Promise<void> {
  if (!dataRoot) return
  const port = openActionPort(dataRoot)
  if (!port) return
  if (sessionHasLiveWork(port, chatSessionId)) return
  const head = port.listOpen(chatSessionId).filter(run => run.status === 'queued').sort((a, b) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0))[0]
  if(head&&head.execution?.workKind!=='factory'){
    const {getTaskRuntime}=await import('../tasks/runtime')
    await getTaskRuntime(dataRoot).coordinator.pump();return
  }
  if (head?.execution?.params?.chatDelivery === true) {
    const { resumeChatWorkQueue } = await import('../ipc/workbench')
    await resumeChatWorkQueue(dataRoot, chatSessionId)
    return
  }
  const promoted = port.promoteNext(chatSessionId)
  const execution = promoted.ok ? promoted.run?.execution : undefined
  if (!promoted.ok || !promoted.run || !execution?.cwd || !execution.prompt) return
  const run = promoted.run
  await startWorkRuntime(
    port,
    { chatSessionId, userText: execution.prompt, dataRoot, onWorkerEvent },
    {
      channel: 'work',
      intent: (execution.intent as ChannelPlan['intent']) ?? 'work',
      tag: execution.tag ?? null,
      cwd: execution.cwd,
      workKind: execution.workKind,
      params: execution.params ?? {},
      grounding: ''
    },
    run
  )
}

export async function followPinnedWork(
  chatSessionId: string,
  text: string,
  _onWorkerEvent?: (ev: { type: string; [k: string]: unknown }) => void,
  dataRoot?: string
): Promise<{ ok: boolean; reason?: string }> {
  if (!dataRoot) return { ok: false, reason: '记忆不可用，跟一句未发送' }
  const {getTaskRuntime}=await import('../tasks/runtime')
  const managed=getTaskRuntime(dataRoot).repository.visibleList().filter(t=>t.originConversationId===chatSessionId&&['running','waiting_user','reviewing','unknown','paused'].includes(t.state))
  if(managed.length===1){const accepted=await getTaskRuntime(dataRoot).coordinator.submit({requestId:randomUUID(),origin:'chat',conversationId:chatSessionId,taskId:managed[0].id,text},false,{kind:'amend',taskId:managed[0].id});return{ok:accepted.disposition==='applied',reason:accepted.message}}
  if(managed.length>1)return{ok:false,reason:'请明确要继续哪个任务'}
  const port = openActionPort(dataRoot)
  if (!port) return { ok: false, reason: '记忆不可用，跟一句未发送' }
  const live = port.listOpen(chatSessionId).find(
    (run) =>
      run.nature === 'work' &&
      (run.status === 'running' || run.status === 'waiting_permission' || run.status === 'unknown')
  )
  if (!live) return { ok: false, reason: '没有可继续的任务' }
  if (live.status !== 'running' && live.status !== 'waiting_permission') {
    return { ok: false, reason: '任务正在对账，跟一句暂不能发送' }
  }
  const slot = getSlot(chatSessionId)
  const hostRunId = live.execution?.hostRunId || live.runId
  const codeSessionId = live.runtimeId || slot.codeSessionId
  if (!codeSessionId) return { ok: false, reason: '没有任务会话' }
  const queued = await enqueueCodeFollow({ sessionId: codeSessionId, text, hostRunId })
  if (!queued.ok) return { ok: false, reason: queued.error }
  enqueueFollow(chatSessionId, text)
  return { ok: true }
}

export async function abortPinnedWork(chatSessionId: string, dataRoot?: string): Promise<void> {
  if (!dataRoot) return
  const {getTaskRuntime}=await import('../tasks/runtime')
  const managed=getTaskRuntime(dataRoot).repository.visibleList().filter(t=>t.originConversationId===chatSessionId&&['queued','running','waiting_user','reviewing','unknown'].includes(t.state))
  if(managed.length){for(const task of managed)getTaskRuntime(dataRoot).coordinator.stop(task.id);return}
  const port = openActionPort(dataRoot)
  if (!port) return
  const live = port.listOpen(chatSessionId).find((run) => run.nature === 'work' && (run.status === 'running' || run.status === 'waiting_permission'))
  if (!live) return
  const slot = getSlot(chatSessionId)
  const codeSessionId = live.runtimeId || slot.codeSessionId
  if (!codeSessionId) return
  await abortCodeSession(codeSessionId)
  port.record({
    kind: 'runtime.received',
    receipt: {
      source: 'ackemcode',
      runId: live.runId,
      codeSessionId,
      hostRunId: live.execution?.hostRunId || live.runId,
      at: new Date().toISOString(),
      event: { type: 'abort_requested' }
    }
  })
  projectRun(chatSessionId, port.getAction(live.runId), live.runtimeId)
}

export async function recordPluginStop(input: {
  dataRoot?: string
  sessionId: string
  extensionId: string
  ok: boolean
  summary: string
}): Promise<ExecuteResult> {
  if (!input.dataRoot) return memoryFailure('记忆不可用，未记录停止')
  const port = openActionPort(input.dataRoot)
  if (!port) return memoryFailure('记忆不可用，未记录停止')
  const live = findLivePlugin(port, input.sessionId, input.extensionId)
  if (!live) {
    return result({
      extraInjections: [input.summary],
      handedToWorker: false,
      queued: false,
      status: 'failed',
      error: input.summary
    })
  }
  const at = new Date().toISOString()
  const recorded = port.record({
    kind: 'runtime.received',
    receipt: input.ok
      ? {
          source: 'plugin',
          runId: live.runId,
          extensionId: input.extensionId,
          at,
          revision: live.version + 1,
          outcome: 'aborted',
          summary: input.summary
        }
      : {
          source: 'plugin',
          runId: live.runId,
          extensionId: input.extensionId,
          at,
          revision: live.version + 1,
          outcome: 'stop_failed',
          summary: input.summary,
          errorCode: 'stop_failed'
        }
  })
  if (!recorded.ok) {
    const happened = input.ok ? '插件已停止' : '停止未完成'
    return result({
      extraInjections: [input.summary],
      handedToWorker: false,
      queued: false,
      runId: live.runId,
      status: 'unknown',
      memoryDegraded: true,
      error: `${happened}，记忆降级：${recorded.message}`,
      receipt: { memoryDegraded: true }
    })
  }
  if (!input.ok) {
    return result({
      extraInjections: [input.summary],
      handedToWorker: false,
      queued: false,
      runId: live.runId,
      status: 'failed',
      error: input.summary,
      receipt: { outcome: 'stop_failed', status: 'running' }
    })
  }
  const next = port.getAction(live.runId)
  return result({
    extraInjections: [input.summary],
    handedToWorker: false,
    queued: false,
    runId: live.runId,
    status: next ? outcomeStatus(next.status) : 'aborted',
    receipt: { outcome: 'aborted' }
  })
}
