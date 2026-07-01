/**
 * OpenAI 电脑助手后台任务 — 与 chat 流式管线隔离
 */
import type { WebContents } from 'electron'
import type { AppSettings } from '../settings'
import { buildLlmHeaders, resolveChatCompletionsUrl, shouldSendTools } from '../llmEndpoint'
import { buildToolFollowUpRequestBody, buildToolResultsFallback } from '../toolFollowUp'
import { lastUserMessageFromContext } from '../extensions/plugins/builtin/knowledge-presentation/knowledgeAnswer'
import { type ActionContext } from '../engine/actionExecutor'
import { patchLatestTurnL5 } from '../engine/tracer'
import type { PrefetchedFact } from '../memory/ingest'
import { peekPendingTurn, updatePendingTurn } from '../turnPending'
import { setOpenAiAgentToolChoice, isToolChoiceCompatibilityError } from '../llmToolChoice'
import { createLogger } from '../logger'
import { t } from '../i18n'
import { isDesktopAgentToolingActive } from '../../shared/desktopAgent'
import {
  appendDesktopAgentRoundMessages,
  DESKTOP_AGENT_MAX_TOOL_ROUNDS
} from './agentLoopMessages'
import { executeOpenAiToolBatch, shouldContinueDesktopAgentLoop } from './openAiToolRound'
import { taskFrameFollowUpActivityLabel } from '../chatStatusLabels'
import { parseUserTaskFrameFromBody } from '../taskFrame'
import { readOpenAiChatCompletionStream, type ToolCallAcc } from '../openAiSseStream'
import { INVESTIGATION_SYNTHESIZE_MIN_TOKENS } from '../../shared/investigation'
import { evaluateTaskPlanProgress } from './task-plan/verifyTaskPlan'
import {
  gateAgentLoopExit,
  shouldForceTaskPlanContinuation,
  buildPostToolTaskPlanNudge
} from './task-plan/taskPlanLoop'
import { injectTaskPlanSystemHint } from './task-plan/injectTaskPlan'
import {
  buildTaskPlanIncompleteDelivery,
  buildTaskPlanFollowUpHonestyBlock
} from './task-plan/taskPlanPrompt'
import {
  resolveDesktopAgentTaskPlan,
  clearTaskPlanProgress,
  savePersistedTaskPlan,
  clearPersistedTaskPlan,
  readTaskPlanAudit,
  buildTaskPlanResumeUserHint
} from './task-plan/resolveTaskPlan'
import { emitTaskPlanFromAudit, emitTaskPlanProgress } from './task-plan/taskPlanProgress'
import type { TaskPlanProgress } from '../../shared/desktopAgentTaskPlan'
import { deliverDesktopAgentTaskResult } from './deliveryCoordinator'
import {
  buildDesktopAgentFollowUpSuffix,
  mergeDesktopAgentDelivery,
  mergeToolResultsForDelivery
} from './desktopAgentDelivery'
import { finalizePaperCardCompanionReply } from '../paperCard/finalizeCompanionReply'
import type { ToolsPayloadOptions } from '../chat'

const log = createLogger('openai-agent-job')

function sendJobStatus(webContents: WebContents, sessionId: string, label: string): void {
  webContents.send('desktop-agent:job-status', { sessionId, label })
}

export async function runOpenAiDesktopAgentJob(opts: {
  webContents: WebContents
  body: Record<string, unknown>
  dataRoot: string
  background: boolean
  signal: AbortSignal
}): Promise<void> {
  const { webContents, body, dataRoot, signal } = opts
  const settings = body.settings as AppSettings
  const messages = body.messages as unknown[]
  const url = resolveChatCompletionsUrl(settings)
  const desktopAgentChatMode = body.desktopAgentChatMode === true
  const agentActive = isDesktopAgentToolingActive(settings, desktopAgentChatMode)
  if (!agentActive) return

  const chatSessionId = typeof body.sessionId === 'string' ? body.sessionId : 'default'
  const allMsgsEarly = messages as Array<{ role: string; content: unknown }>
  const userMsg = lastUserMessageFromContext(allMsgsEarly)
  const turnId = typeof body.turnId === 'string' ? body.turnId : undefined
  const userTaskFrame = parseUserTaskFrameFromBody(body)
  const sendTools = shouldSendTools(settings)
  const { toolsPayload, toolNames } = await import('../chat')
  const toolsOpts: ToolsPayloadOptions = { settings, desktopAgentChatMode }
  const toolAcc = new Map<number, ToolCallAcc>()

  const reqBody: Record<string, unknown> = {
    model: settings.model,
    messages,
    stream: true,
    max_tokens: Math.min(2048, settings.anthropicMaxTokens ?? 1024),
    temperature: 0.6
  }
  if (sendTools) {
    reqBody.tools = toolsPayload(toolsOpts)
    reqBody.tool_choice = 'auto'
    log.info('agent-job.tools', { tools: toolNames(toolsOpts) })
  }

  const streamLlmRound = async (): Promise<string> => {
    const post = () =>
      fetch(url, {
        method: 'POST',
        headers: buildLlmHeaders(settings),
        body: JSON.stringify(reqBody),
        signal
      })

    let res = await post()
    if (!res.ok || !res.body) {
      let errText = await res.text().catch(() => res.statusText)
      if (isToolChoiceCompatibilityError(res.status, errText)) {
        setOpenAiAgentToolChoice(reqBody, settings)
        res = await post()
        if (!res.ok || !res.body) {
          errText = await res.text().catch(() => res.statusText)
        }
      }
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 500)}`)
      }
    }
    return readOpenAiChatCompletionStream(webContents, res, {
      streamToUi: false,
      pacedSentences: false,
      signal,
      toolAcc
    })
  }

  let assistantAcc = ''
  let round1Text = ''
  let webSearchCompanionReply: string | null = null
  let toolResults: Array<{ name: string; content: string }> = []
  const allToolResults: Array<{ name: string; content: string }> = []
  const writes: string[] = []

  const pending = turnId ? peekPendingTurn(turnId) : undefined
  const actionCtx: ActionContext | null = pending
    ? { dataRoot, l1: pending.newState.relationship, l2: pending.newState.emotion }
    : null
  const prefetchedFacts: PrefetchedFact[] = []
  let skipLlmExtraction = false

  const maxAgentRounds = DESKTOP_AGENT_MAX_TOOL_ROUNDS
  let loopMessages = allMsgsEarly
  let sorted: Array<[number, ToolCallAcc]> = []
  let zeroToolRetried = false

  const planResult = userMsg
    ? await resolveDesktopAgentTaskPlan({
        settings,
        userText: userMsg,
        webContents,
        signal,
        dataRoot,
        sessionId: chatSessionId
      })
    : { plan: null, resumed: false }
  const taskPlan = planResult.plan
  let taskPlanProgress: TaskPlanProgress | null = null
  let taskPlanDeliveredEarly = false

  if (taskPlan) {
    loopMessages = injectTaskPlanSystemHint(loopMessages, taskPlan)
    if (planResult.resumed) {
      const hint = buildTaskPlanResumeUserHint(
        { settings, userText: userMsg, webContents, signal, dataRoot, sessionId: chatSessionId },
        taskPlan
      )
      if (hint) loopMessages = [...loopMessages, { role: 'user', content: hint }]
    }
    sendJobStatus(webContents, chatSessionId, `执行：${taskPlan.goalSummary}`)
  }

  const readPlanAudit = () => (taskPlan ? readTaskPlanAudit(dataRoot, taskPlan) : [])

  for (let agentRound = 0; agentRound < maxAgentRounds; agentRound++) {
    if (signal.aborted) throw new Error('任务已取消')
    reqBody.messages = loopMessages
    if (agentRound > 0) {
      sendJobStatus(
        webContents,
        chatSessionId,
        `电脑助手工作中…（第 ${agentRound + 1}/${maxAgentRounds} 步）`
      )
    }

    toolAcc.clear()
    round1Text = await streamLlmRound()
    if (!round1Text.trim() && toolAcc.size === 0 && agentRound === 0 && !zeroToolRetried && sendTools) {
      zeroToolRetried = true
      setOpenAiAgentToolChoice(reqBody, settings)
      loopMessages = [
        ...loopMessages,
        {
          role: 'user',
          content:
            '【系统】你必须先调用 use_computer 获取本机证据，禁止未调查就回答。若用户要求列出/查找/扫描，务必使用 list_folder 或 search_files。'
        }
      ]
      continue
    }

    sorted = [...toolAcc.entries()].sort((a, b) => a[0] - b[0])
    if (sorted.length === 0) {
      if (taskPlan) {
        const audit = readPlanAudit()
        const gate = gateAgentLoopExit({
          plan: taskPlan,
          audit,
          agentRound,
          maxRounds: maxAgentRounds,
          sortedToolCount: 0,
          round1Text
        })
        taskPlanProgress = gate.progress
        savePersistedTaskPlan(dataRoot, chatSessionId, taskPlan, gate.progress)
        if (gate.action === 'continue') {
          emitTaskPlanProgress(webContents, taskPlan, 'executing', undefined, audit)
          setOpenAiAgentToolChoice(reqBody, settings)
          loopMessages = [
            ...loopMessages,
            ...(round1Text.trim() ? [{ role: 'assistant', content: round1Text }] : []),
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
          clearPersistedTaskPlan(dataRoot, chatSessionId)
          emitTaskPlanProgress(webContents, taskPlan, 'delivering', undefined, audit)
          break
        }
        if (gate.action === 'deliver' && !gate.progress.allPassed) {
          setOpenAiAgentToolChoice(reqBody, settings)
          loopMessages = [
            ...loopMessages,
            ...(round1Text.trim() ? [{ role: 'assistant', content: round1Text }] : []),
            {
              role: 'user',
              content: buildPostToolTaskPlanNudge(taskPlan, audit) ?? gate.continuationUserMessage
            }
          ]
          continue
        }
        assistantAcc = round1Text
        break
      }
      assistantAcc = round1Text
      break
    }

    const batch = await executeOpenAiToolBatch({
      sorted,
      settings,
      dataRoot,
      webContents,
      sessionId: chatSessionId,
      allMsgs: allMsgsEarly,
      userMsg,
      userTaskFrame,
      actionCtx,
      taskPlanId: taskPlan?.id,
      background: true
    })
    toolResults = batch.toolResults
    allToolResults.push(...batch.toolResults)
    writes.push(...batch.writes)
    prefetchedFacts.push(...batch.prefetchedFacts)
    if (batch.skipLlmExtraction) skipLlmExtraction = true
    if (batch.webSearchCompanionReply) webSearchCompanionReply = batch.webSearchCompanionReply

    if (pending?.trace?.turn != null && batch.invoked.length > 0) {
      patchLatestTurnL5(pending.trace.turn, batch.invoked)
    }

    if (taskPlan) {
      const turnAudit = readPlanAudit()
      taskPlanProgress = emitTaskPlanFromAudit(webContents, taskPlan, turnAudit, 'executing')
      savePersistedTaskPlan(dataRoot, chatSessionId, taskPlan, taskPlanProgress)
    }

    const willContinueToolLoop = shouldContinueDesktopAgentLoop(
      true,
      agentRound,
      maxAgentRounds,
      sorted
    )

    if (
      taskPlan &&
      shouldForceTaskPlanContinuation(
        taskPlan,
        readPlanAudit(),
        agentRound,
        maxAgentRounds,
        willContinueToolLoop
      )
    ) {
      const nudge = buildPostToolTaskPlanNudge(taskPlan, readPlanAudit())
      loopMessages = appendDesktopAgentRoundMessages(loopMessages, round1Text, toolResults, {
        taskPlanActive: true,
        taskPlanNudge: nudge
      })
      setOpenAiAgentToolChoice(reqBody, settings)
      continue
    }

    if (willContinueToolLoop) {
      loopMessages = appendDesktopAgentRoundMessages(loopMessages, round1Text, toolResults)
      continue
    }
    break
  }

  if (turnId && (prefetchedFacts.length > 0 || skipLlmExtraction)) {
    updatePendingTurn(turnId, {
      prefetchedFacts: prefetchedFacts.length > 0 ? prefetchedFacts : undefined,
      skipLlmExtraction
    })
  }

  const finalTaskProgress =
    taskPlan && !taskPlanDeliveredEarly
      ? evaluateTaskPlanProgress(taskPlan, readPlanAudit())
      : taskPlanProgress

  const taskPlanAudit = readPlanAudit()
  const canDeliverTaskPlan =
    !taskPlan || (finalTaskProgress?.allPassed === true && !taskPlanDeliveredEarly)

  if (taskPlan && finalTaskProgress && !finalTaskProgress.allPassed && !taskPlanDeliveredEarly) {
    assistantAcc = buildTaskPlanIncompleteDelivery(finalTaskProgress)
    savePersistedTaskPlan(dataRoot, chatSessionId, taskPlan, finalTaskProgress)
    emitTaskPlanProgress(webContents, taskPlan, 'incomplete', undefined, taskPlanAudit)
  } else if (taskPlan && finalTaskProgress?.allPassed) {
    clearPersistedTaskPlan(dataRoot, chatSessionId)
    emitTaskPlanProgress(webContents, taskPlan, 'delivering', undefined, taskPlanAudit)
  } else if (taskPlan && finalTaskProgress) {
    savePersistedTaskPlan(dataRoot, chatSessionId, taskPlan, finalTaskProgress)
  }

  const otherToolResults = mergeToolResultsForDelivery(allToolResults)
  const followUpMaxTokens = Math.max(INVESTIGATION_SYNTHESIZE_MIN_TOKENS, 1800)

  if (webSearchCompanionReply) {
    assistantAcc = finalizePaperCardCompanionReply(webSearchCompanionReply)
  } else if (canDeliverTaskPlan && otherToolResults.length > 0) {
    sendJobStatus(webContents, chatSessionId, taskFrameFollowUpActivityLabel(userTaskFrame) ?? '整理结果…')
    const taskPlanHonesty =
      finalTaskProgress?.allPassed === true
        ? buildTaskPlanFollowUpHonestyBlock(finalTaskProgress)
        : undefined
    const desktopSuffix = buildDesktopAgentFollowUpSuffix(otherToolResults)
    const extraSuffix = [taskPlanHonesty, desktopSuffix].filter(Boolean).join('\n\n')
    try {
      const followReq = buildToolFollowUpRequestBody(
        settings,
        allMsgsEarly,
        otherToolResults,
        followUpMaxTokens,
        userTaskFrame,
        extraSuffix || undefined
      )
      const followRes = await fetch(url, {
        method: 'POST',
        headers: buildLlmHeaders(settings),
        body: JSON.stringify(followReq),
        signal
      })
      if (followRes.ok && followRes.body) {
        const streamed = await readOpenAiChatCompletionStream(webContents, followRes, {
          streamToUi: false,
          pacedSentences: false,
          signal
        })
        if (streamed) assistantAcc = streamed.trim()
      }
    } catch (e) {
      log.warn('follow-up.fail', { err: e instanceof Error ? e.message : String(e) })
    }
  }

  if (otherToolResults.length > 0 && !assistantAcc.trim()) {
    assistantAcc = buildToolResultsFallback(otherToolResults)
  } else if (!assistantAcc.trim() && round1Text && canDeliverTaskPlan) {
    assistantAcc = round1Text
  }

  if (otherToolResults.some((tr) => tr.name === 'use_computer')) {
    assistantAcc = mergeDesktopAgentDelivery(assistantAcc, otherToolResults)
  }

  if (taskPlan) clearTaskPlanProgress(webContents)
  if (!assistantAcc.trim()) assistantAcc = t('chat.error.emptyReply')

  deliverDesktopAgentTaskResult(webContents, {
    sessionId: chatSessionId,
    taskPlanId: taskPlan?.id,
    goalSummary: taskPlan?.goalSummary ?? '电脑助手任务',
    allPassed: finalTaskProgress?.allPassed === true,
    text: assistantAcc
  })
}
