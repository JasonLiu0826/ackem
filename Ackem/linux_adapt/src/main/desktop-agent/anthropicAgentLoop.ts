/**
 * Anthropic 电脑助手多轮 Agent Loop（TaskPlan 门禁 + 持久化）
 */
import type { WebContents } from 'electron'
import type { AppSettings } from '../settings'
import {
  buildAnthropicHeaders,
  openAiMessagesToAnthropic,
  resolveAnthropicMessagesUrl,
  anthropicAllTools,
  anthropicMessagesJson
} from '../anthropicMessages'
import type { ToolsPayloadOptions } from '../chat'
import { finalizeTurnAfterStream } from '../postChatTurn'
import { t } from '../i18n'
import { notifyUiChatBubble } from '../uiWindow'
import { buildToolFollowUpMessages, buildToolResultsFallback } from '../toolFollowUp'
import { lastUserMessageFromContext } from '../extensions/plugins/builtin/knowledge-presentation/knowledgeAnswer'
import { taskFrameFollowUpActivityLabel } from '../chatStatusLabels'
import { parseUserTaskFrameFromBody, type UserTaskFrame } from '../taskFrame'
import { INVESTIGATION_SYNTHESIZE_MIN_TOKENS } from '../../shared/investigation'
import {
  appendDesktopAgentRoundMessages,
  DESKTOP_AGENT_MAX_TOOL_ROUNDS
} from './agentLoopMessages'
import { executeOpenAiToolBatch, shouldContinueDesktopAgentLoop } from './openAiToolRound'
import type { ToolCallAcc } from '../openAiSseStream'
import {
  resolveDesktopAgentTaskPlan,
  clearTaskPlanProgress,
  savePersistedTaskPlan,
  clearPersistedTaskPlan,
  readTaskPlanAudit,
  buildTaskPlanResumeUserHint
} from './task-plan/resolveTaskPlan'
import { injectTaskPlanSystemHint } from './task-plan/injectTaskPlan'
import {
  gateAgentLoopExit,
  shouldForceTaskPlanContinuation,
  buildPostToolTaskPlanNudge
} from './task-plan/taskPlanLoop'
import {
  buildTaskPlanIncompleteDelivery,
  buildTaskPlanFollowUpHonestyBlock
} from './task-plan/taskPlanPrompt'
import { emitTaskPlanFromAudit, emitTaskPlanProgress } from './task-plan/taskPlanProgress'
import { evaluateTaskPlanProgress } from './task-plan/verifyTaskPlan'
import type { DesktopAgentTaskPlan, TaskPlanProgress } from '../../shared/desktopAgentTaskPlan'
import { deliverDesktopAgentTaskResult } from './deliveryCoordinator'
import {
  buildDesktopAgentFollowUpSuffix,
  mergeDesktopAgentDelivery,
  mergeToolResultsForDelivery
} from './desktopAgentDelivery'
import { createLogger } from '../logger'

const log = createLogger('anthropic-agent-loop')

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

type AnthropicMsg = {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

async function anthropicRound(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal: AbortSignal
): Promise<{ text: string; toolUses: AnthropicContentBlock[]; rawContent: AnthropicContentBlock[] }> {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, stream: false }),
    signal
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${raw.slice(0, 500)}`)
  const json = JSON.parse(raw) as { content?: AnthropicContentBlock[] }
  const blocks = json.content ?? []
  const text = blocks
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('')
  const toolUses = blocks.filter(
    (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
      b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string'
  )
  return { text, toolUses, rawContent: blocks }
}

function toolUsesToSortedAcc(toolUses: AnthropicContentBlock[]): Array<[number, ToolCallAcc]> {
  return toolUses
    .filter(
      (t): t is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        t.type === 'tool_use'
    )
    .map(
      (t, i) =>
        [
          i,
          {
            id: t.id,
            name: t.name,
            arguments: JSON.stringify(t.input ?? {})
          }
        ] as [number, ToolCallAcc]
    )
}

async function executeAnthropicToolBatch(args: {
  toolUses: AnthropicContentBlock[]
  settings: AppSettings
  dataRoot: string
  webContents: WebContents
  sessionId: string
  ctxMsgs: Array<{ role: string; content: unknown }>
  userMsg: string
  userTaskFrame?: UserTaskFrame
  taskPlanId?: string
  background?: boolean
}): Promise<{
  toolResults: Array<{ name: string; content: string }>
  writes: string[]
  toolResultBlocks: AnthropicContentBlock[]
}> {
  const sorted = toolUsesToSortedAcc(args.toolUses)
  const batch = await executeOpenAiToolBatch({
    sorted,
    settings: args.settings,
    dataRoot: args.dataRoot,
    webContents: args.webContents,
    sessionId: args.sessionId,
    allMsgs: args.ctxMsgs,
    userMsg: args.userMsg,
    userTaskFrame: args.userTaskFrame,
    actionCtx: null,
    taskPlanId: args.taskPlanId,
    background: args.background
  })

  const toolResultBlocks: AnthropicContentBlock[] = sorted.map(([, tc], i) => ({
    type: 'tool_result',
    tool_use_id: tc.id ?? `tool_${i}`,
    content: batch.toolResults[i]?.content ?? batch.toolResults.find((r) => r.name === tc.name)?.content ?? '无返回'
  }))

  return { toolResults: batch.toolResults, writes: batch.writes, toolResultBlocks }
}

export async function runAnthropicDesktopAgentLoop(
  webContents: WebContents,
  body: Record<string, unknown>,
  dataRoot: string,
  opts?: { background?: boolean; signal?: AbortSignal }
): Promise<void> {
  const background = opts?.background === true
  const settings = body.settings as AppSettings
  const rawMessages = body.messages as Array<{ role: string; content: unknown }>
  const ctxMsgsEarly = rawMessages
  const userMsg = lastUserMessageFromContext(ctxMsgsEarly)
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : 'default'
  const turnId = typeof body.turnId === 'string' ? body.turnId : undefined
  const userTaskFrame = parseUserTaskFrameFromBody(body)
  const toolsOpts: ToolsPayloadOptions = {
    settings,
    desktopAgentChatMode: body.desktopAgentChatMode === true
  }

  const url = resolveAnthropicMessagesUrl(settings)
  const headers = buildAnthropicHeaders(settings)
  const controller = new AbortController()
  if (opts?.signal) {
    opts.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  const maxTokens = Math.max(256, Math.min(200_000, Number(settings.anthropicMaxTokens) || 8192))

  const planResult = await resolveDesktopAgentTaskPlan({
    settings,
    userText: userMsg,
    webContents,
    signal: controller.signal,
    dataRoot,
    sessionId
  })
  let taskPlan: DesktopAgentTaskPlan | null = planResult.plan
  let taskPlanProgress: TaskPlanProgress | null = null
  let taskPlanDeliveredEarly = false

  let injectedMessages = rawMessages
  if (taskPlan) {
    injectedMessages = injectTaskPlanSystemHint(rawMessages, taskPlan)
    if (planResult.resumed) {
      const hint = buildTaskPlanResumeUserHint(
        { settings, userText: userMsg, webContents, signal: controller.signal, dataRoot, sessionId },
        taskPlan
      )
      if (hint) {
        injectedMessages = [...injectedMessages, { role: 'user', content: hint }]
      }
    }
    log.info('anthropic.task-plan', { id: taskPlan.id, resumed: planResult.resumed })
  }

  let { system, messages: loopMessages } = openAiMessagesToAnthropic(injectedMessages)
  const anthropicLoop = loopMessages as AnthropicMsg[]

  const tools = anthropicAllTools(toolsOpts)
  const writes: string[] = []
  let assistantAcc = ''
  let round1Text = ''
  let toolResults: Array<{ name: string; content: string }> = []
  const allToolResults: Array<{ name: string; content: string }> = []
  const maxRounds = DESKTOP_AGENT_MAX_TOOL_ROUNDS
  let zeroToolRetried = false
  let messages = [...anthropicLoop]

  for (let agentRound = 0; agentRound < maxRounds; agentRound++) {
    if (agentRound > 0) {
      const label = `电脑助手工作中…（第 ${agentRound + 1}/${maxRounds} 步）`
      if (background) webContents.send('desktop-agent:job-status', { sessionId, label })
      else webContents.send('chat:status', label)
    }

    const reqBody: Record<string, unknown> = {
      model: settings.model,
      max_tokens: maxTokens,
      messages,
      tools,
      tool_choice: { type: 'auto' }
    }
    if (system) reqBody.system = system

    const round = await anthropicRound(url, headers, reqBody, controller.signal)
    round1Text = round.text

    if (round.toolUses.length === 0) {
      if (taskPlan) {
        const audit = readTaskPlanAudit(dataRoot, taskPlan)
        const gate = gateAgentLoopExit({
          plan: taskPlan,
          audit,
          agentRound,
          maxRounds,
          sortedToolCount: 0,
          round1Text
        })
        taskPlanProgress = gate.progress
        savePersistedTaskPlan(dataRoot, sessionId, taskPlan, gate.progress)

        if (gate.action === 'continue') {
          emitTaskPlanProgress(webContents, taskPlan, 'executing', undefined, audit)
          messages = [
            ...messages,
            { role: 'assistant', content: round1Text.trim() || '…' },
            { role: 'user', content: gate.continuationUserMessage }
          ]
          continue
        }
        if (gate.action === 'incomplete') {
          assistantAcc = buildTaskPlanIncompleteDelivery(gate.progress)
          taskPlanDeliveredEarly = true
          emitTaskPlanProgress(webContents, taskPlan, 'incomplete', undefined, audit)
          break
        }
        if (gate.action === 'deliver' && gate.progress.allPassed) {
          clearPersistedTaskPlan(dataRoot, sessionId)
          emitTaskPlanProgress(webContents, taskPlan, 'delivering', undefined, audit)
          break
        }
      } else if (agentRound === 0 && !zeroToolRetried) {
        zeroToolRetried = true
        messages = [
          ...messages,
          { role: 'user', content: '【系统】请先调用 use_computer 获取本机证据后再回答。' }
        ]
        continue
      }
      assistantAcc = round1Text
      break
    }

    const exec = await executeAnthropicToolBatch({
      toolUses: round.toolUses,
      settings,
      dataRoot,
      webContents,
      sessionId,
      ctxMsgs: ctxMsgsEarly,
      userMsg,
      userTaskFrame,
      taskPlanId: taskPlan?.id,
      background
    })
    toolResults = exec.toolResults
    allToolResults.push(...exec.toolResults)
    writes.push(...exec.writes)

    messages = [
      ...messages,
      { role: 'assistant', content: round.rawContent },
      { role: 'user', content: exec.toolResultBlocks }
    ]

    if (taskPlan) {
      const audit = readTaskPlanAudit(dataRoot, taskPlan)
      taskPlanProgress = emitTaskPlanFromAudit(webContents, taskPlan, audit, 'executing')
      savePersistedTaskPlan(dataRoot, sessionId, taskPlan, taskPlanProgress)
    }

    const sorted = toolUsesToSortedAcc(round.toolUses)
    const willContinue = shouldContinueDesktopAgentLoop(true, agentRound, maxRounds, sorted)

    if (
      taskPlan &&
      shouldForceTaskPlanContinuation(
        taskPlan,
        readTaskPlanAudit(dataRoot, taskPlan),
        agentRound,
        maxRounds,
        willContinue
      )
    ) {
      const nudge = buildPostToolTaskPlanNudge(taskPlan, readTaskPlanAudit(dataRoot, taskPlan))
      const oaiLoop = appendDesktopAgentRoundMessages(
        messages as unknown as Array<{ role: string; content: unknown }>,
        round1Text,
        toolResults,
        { taskPlanActive: true, taskPlanNudge: nudge }
      )
      const lastUser = oaiLoop[oaiLoop.length - 1]
      if (lastUser?.role === 'user') {
        messages = [...messages, { role: 'user', content: lastUser.content }]
      }
      continue
    }

    if (willContinue) continue

    if (taskPlan && taskPlanProgress && !taskPlanProgress.allPassed) {
      if (agentRound < maxRounds - 1) {
        const audit = readTaskPlanAudit(dataRoot, taskPlan)
        const gate = gateAgentLoopExit({
          plan: taskPlan,
          audit,
          agentRound,
          maxRounds,
          sortedToolCount: sorted.length,
          round1Text
        })
        if (gate.action === 'continue' && gate.continuationUserMessage) {
          messages = [...messages, { role: 'user', content: gate.continuationUserMessage }]
          continue
        }
      }
      assistantAcc = buildTaskPlanIncompleteDelivery(taskPlanProgress)
      taskPlanDeliveredEarly = true
      break
    }
    break
  }

  const finalProgress =
    taskPlan && !taskPlanDeliveredEarly
      ? evaluateTaskPlanProgress(taskPlan, readTaskPlanAudit(dataRoot, taskPlan))
      : taskPlanProgress

  const canDeliver = !taskPlan || (finalProgress?.allPassed === true && !taskPlanDeliveredEarly)
  const taskPlanAudit = taskPlan ? readTaskPlanAudit(dataRoot, taskPlan) : []

  if (taskPlan && finalProgress && !finalProgress.allPassed && !taskPlanDeliveredEarly) {
    assistantAcc = buildTaskPlanIncompleteDelivery(finalProgress)
    savePersistedTaskPlan(dataRoot, sessionId, taskPlan, finalProgress)
    emitTaskPlanProgress(webContents, taskPlan, 'incomplete', undefined, taskPlanAudit)
  } else if (canDeliver && allToolResults.length > 0) {
    webContents.send('chat:status', taskFrameFollowUpActivityLabel(userTaskFrame))
    const deliveryToolResults = mergeToolResultsForDelivery(allToolResults)
    const taskPlanHonesty =
      finalProgress?.allPassed === true ? buildTaskPlanFollowUpHonestyBlock(finalProgress) : undefined
    const desktopSuffix = buildDesktopAgentFollowUpSuffix(deliveryToolResults)
    const suffix = [taskPlanHonesty, desktopSuffix].filter(Boolean).join('\n\n')
    const followMsgs = buildToolFollowUpMessages(ctxMsgsEarly, deliveryToolResults, userTaskFrame)
    if (suffix) {
      const last = followMsgs[followMsgs.length - 1]
      if (last?.role === 'user') last.content = `${last.content}\n\n${suffix}`
    }
    const { system: fs, messages: fm } = openAiMessagesToAnthropic(followMsgs as unknown[])
    try {
      assistantAcc = await anthropicMessagesJson({
        settings,
        messages: (fs
          ? [{ role: 'system' as const, content: fs }, ...fm]
          : fm) as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        temperature: 0.6,
        max_tokens: Math.max(INVESTIGATION_SYNTHESIZE_MIN_TOKENS, 1800)
      })
    } catch {
      assistantAcc = buildToolResultsFallback(deliveryToolResults)
    }
    if (taskPlan && finalProgress?.allPassed) {
      clearPersistedTaskPlan(dataRoot, sessionId)
      emitTaskPlanProgress(webContents, taskPlan, 'delivering', undefined, taskPlanAudit)
    }
  } else if (taskPlan && finalProgress?.allPassed) {
    clearPersistedTaskPlan(dataRoot, sessionId)
  } else if (taskPlan && finalProgress) {
    savePersistedTaskPlan(dataRoot, sessionId, taskPlan, finalProgress)
  }

  if (!assistantAcc.trim()) {
    assistantAcc = round1Text || t('chat.error.emptyReply')
  }

  const otherToolResults = mergeToolResultsForDelivery(allToolResults)
  if (otherToolResults.some((tr) => tr.name === 'use_computer')) {
    assistantAcc = mergeDesktopAgentDelivery(assistantAcc, otherToolResults)
  }

  if (background) {
    if (taskPlan) clearTaskPlanProgress(webContents)
    deliverDesktopAgentTaskResult(webContents, {
      sessionId,
      taskPlanId: taskPlan?.id,
      goalSummary: taskPlan?.goalSummary ?? '电脑助手任务',
      allPassed: finalProgress?.allPassed === true,
      text: assistantAcc
    })
    return
  }

  webContents.send('chat:replace', assistantAcc)
  if (taskPlan) clearTaskPlanProgress(webContents)

  webContents.send('chat:done', { memoryWrites: writes, assistantText: assistantAcc, turnId })
  notifyUiChatBubble({ text: assistantAcc, role: 'assistant' })
  void finalizeTurnAfterStream({ turnId, dataRoot, assistantText: assistantAcc, settings })
}

export async function runAnthropicDesktopAgentJobBackground(opts: {
  webContents: WebContents
  body: Record<string, unknown>
  dataRoot: string
  signal: AbortSignal
}): Promise<void> {
  return runAnthropicDesktopAgentLoop(opts.webContents, opts.body, opts.dataRoot, {
    background: true,
    signal: opts.signal
  })
}
