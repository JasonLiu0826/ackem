import type { WebContents } from 'electron'
import type { AppSettings } from './settings'
import { finalizeTurnAfterStream } from './postChatTurn'
import { buildLlmHeaders, resolveChatCompletionsUrl, shouldSendTools } from './llmEndpoint'
import { buildToolFollowUpRequestBody, buildToolResultsFallback } from './toolFollowUp'
import { detectImageIntent } from './agnesImage'
import { streamAnthropicMessages } from './anthropicMessages'
import {
  lastUserMessageFromContext,
  runKnowledgeAnswerChain
} from './extensions/plugins/builtin/knowledge-presentation/knowledgeAnswer'
import { runPlanDocumentViaSkill } from './extensions/skills/builtin/tool/plan-document/skillBridge'
import {
  getActiveSkillToolDefs,
  skillDefsToOpenAiTools
} from './chatSkillTools'
import { type ActionContext } from './engine/actionExecutor'
import { patchLatestTurnL5 } from './engine/tracer'
import type { PrefetchedFact } from './memory/ingest'
import { peekPendingTurn, updatePendingTurn, clearPendingTurn } from './turnPending'
import { createLogger } from './logger'
import { setOpenAiToolChoice } from './llmToolChoice'
import { t } from './i18n'
import { isDesktopAgentToolingActive } from '../shared/desktopAgent'
import { useComputerOpenAiTool, USE_COMPUTER_TOOL_NAME } from './desktop-agent/toolDef'
import {
  appendDesktopAgentRoundMessages,
  DESKTOP_AGENT_MAX_TOOL_ROUNDS
} from './desktop-agent/agentLoopMessages'
import {
  executeOpenAiToolBatch,
  shouldContinueDesktopAgentLoop
} from './desktop-agent/openAiToolRound'
import { notifyUiChatBubble } from './uiWindow'
import { runForcedWebSearchTurn } from './extensions/plugins/builtin/knowledge-presentation/presentation/webSearchPresentation'
import { isLlmMockMode } from './llmMockMode'
import { mockChatStreamText } from './llmMockResponses'
import { taskFrameFollowUpActivityLabel, taskFrameWorkingActivityLabel, skillToolActivityLabel } from './chatStatusLabels'
import { finalizePaperCardCompanionReply } from './paperCard/finalizeCompanionReply'
import {
  parseUserTaskFrameFromBody,
  runWebSearchWithTaskFrame
} from './taskFrame'
import { streamChatWaves } from './chat/waveChat'
import { readOpenAiChatCompletionStream, notifyChatStreamStart, type ToolCallAcc } from './openAiSseStream'
import { tryHandleInvestigationChatTurn } from './desktop-agent/investigation/investigationChatTurn'
import { INVESTIGATION_SYNTHESIZE_MIN_TOKENS } from '../shared/investigation'
import {
  shouldOfferSkillToolsInDesktopAgentSession,
  shouldForceWebSearchInDesktopAgentSession
} from './desktop-agent/modePolicy'
import { evaluateTaskPlanProgress } from './desktop-agent/task-plan/verifyTaskPlan'
import {
  gateAgentLoopExit,
  shouldForceTaskPlanContinuation,
  buildPostToolTaskPlanNudge
} from './desktop-agent/task-plan/taskPlanLoop'
import { injectTaskPlanSystemHint } from './desktop-agent/task-plan/injectTaskPlan'
import {
  buildTaskPlanIncompleteDelivery,
  buildTaskPlanFollowUpHonestyBlock
} from './desktop-agent/task-plan/taskPlanPrompt'
import {
  resolveDesktopAgentTaskPlan,
  clearTaskPlanProgress,
  savePersistedTaskPlan,
  clearPersistedTaskPlan,
  readTaskPlanAudit,
  buildTaskPlanResumeUserHint
} from './desktop-agent/task-plan/resolveTaskPlan'
import {
  emitTaskPlanFromAudit,
  emitTaskPlanProgress
} from './desktop-agent/task-plan/taskPlanProgress'
import type { TaskPlanProgress } from '../shared/desktopAgentTaskPlan'
import { isDesktopAgentPipelineOpen } from '../shared/desktopAgentFeature'
import {
  isBackgroundAgentJobRunning,
  startBackgroundAgentJob
} from './desktop-agent/agentJobManager'
import {
  buildDesktopAgentFollowUpSuffix,
  mergeDesktopAgentDelivery,
  mergeToolResultsForDelivery
} from './desktop-agent/desktopAgentDelivery'
import {
  shouldRouteDesktopAgentToBackgroundJob,
  DESKTOP_AGENT_TASK_START_ACK
} from './desktop-agent/agentJobRouting'
import { isContinueTaskPlanIntent } from './desktop-agent/task-plan/taskPlanStore'

const log = createLogger('chat')

export type ChatStreamRequest = {
  messages: unknown[]
  settings: AppSettings
}

const appendMemoryTool = {
  type: 'function' as const,
  function: {
    name: 'append_memory',
    description:
      'Append or overwrite allowed markdown/text under the data root. Paths must start with memory/, preferences/, portrait/, diary/, companion/, or staging/.',
    parameters: {
      type: 'object',
      properties: {
        path_rel: { type: 'string', description: 'Relative path from data root, posix slashes' },
        content: { type: 'string' },
        mode: { type: 'string', enum: ['append', 'overwrite'] }
      },
      required: ['path_rel', 'content', 'mode']
    }
  }
}

const readFileTool = {
  type: 'function' as const,
  function: {
    name: 'read_file',
    description:
      '读取用户数据目录中的文件内容。路径相对于 data root，用 posix 斜杠。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件相对路径，如 memory/notes.md' },
        max_lines: { type: 'number', description: '最大读取行数，默认 200' }
      },
      required: ['path']
    }
  }
}

const extractFactsTool = {
  type: 'function' as const,
  function: {
    name: 'extract_facts',
    description:
      '从对话中提取用户事实（名字、偏好、习惯等）。仅在对话有有意义内容时调用，闲聊时不调用。',
    parameters: {
      type: 'object',
      properties: {
        facts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              subject: { type: 'string', description: '主语，如"用户"' },
              summary: { type: 'string', description: '事实摘要' },
              domain: { type: 'string', description: '域：IDENTITY/PREFERENCE/RELATIONSHIP/MOOD/HEALTH/COMMITMENT' },
              subcategory: { type: 'string', description: '子类：NAME/AGE/FOOD/HOBBY 等' }
            },
            required: ['subject', 'summary']
          }
        }
      },
      required: ['facts']
    }
  }
}

export type ToolsPayloadOptions = {
  settings: AppSettings
  desktopAgentChatMode?: boolean
}

export function toolsPayload(opts?: ToolsPayloadOptions): unknown[] {
  const agentActive =
    opts &&
    isDesktopAgentToolingActive(opts.settings, opts.desktopAgentChatMode === true)
  const skillTools = shouldOfferSkillToolsInDesktopAgentSession(agentActive === true)
    ? skillDefsToOpenAiTools(getActiveSkillToolDefs())
    : []
  const tools: unknown[] = [appendMemoryTool, readFileTool, extractFactsTool, ...skillTools]
  if (
    opts &&
    isDesktopAgentToolingActive(opts.settings, opts.desktopAgentChatMode === true)
  ) {
    tools.push(useComputerOpenAiTool())
  }
  return tools
}

export function toolNames(opts?: ToolsPayloadOptions): string[] {
  const agentActive =
    opts &&
    isDesktopAgentToolingActive(opts.settings, opts.desktopAgentChatMode === true)
  const skillNames = shouldOfferSkillToolsInDesktopAgentSession(agentActive === true)
    ? getActiveSkillToolDefs().map((d) => d.name)
    : []
  const names = ['append_memory', 'read_file', ...skillNames]
  if (
    opts &&
    isDesktopAgentToolingActive(opts.settings, opts.desktopAgentChatMode === true)
  ) {
    names.push(USE_COMPUTER_TOOL_NAME)
  }
  return names
}

export async function streamChatCompletion(
  webContents: WebContents,
  body: Record<string, unknown>,
  dataRoot: string
): Promise<void> {
  const settings = body.settings as AppSettings
  if (body.useWaveChat && body.wavePlan && body.waveContext) {
    return streamChatWaves(webContents, body, dataRoot)
  }
  if ((settings.llmProvider ?? 'openai') === 'anthropic') {
    return streamAnthropicMessages(webContents, body, dataRoot)
  }
  const messages = body.messages as unknown[]
  const url = resolveChatCompletionsUrl(settings)
  const controller = new AbortController()
  const desktopAgentChatMode = body.desktopAgentChatMode === true
  const agentActive = isDesktopAgentToolingActive(settings, desktopAgentChatMode)
  const chatSessionId = typeof body.sessionId === 'string' ? body.sessionId : 'default'
  const agentTimeoutMs = agentActive ? 900_000 : settings.timeoutMs || 120_000
  const abortTimer = setTimeout(() => controller.abort(), agentTimeoutMs)
  const toolAcc = new Map<number, ToolCallAcc>()
  let assistantAcc = ''
  let round1Text = ''
  const knowledgeTopic = (
    (typeof body.knowledgeTopic === 'string' ? body.knowledgeTopic : '') ||
    (typeof body.suggestedSearchQuery === 'string' ? body.suggestedSearchQuery : '')
  ).trim()
  const useKnowledgeCard = knowledgeTopic.length > 0
  const planDocumentTopic = (
    typeof body.planDocumentTopic === 'string' ? body.planDocumentTopic : ''
  ).trim()
  const usePlanDocumentCard = !useKnowledgeCard && planDocumentTopic.length > 0
  const sendTools = shouldSendTools(settings)
  const toolsOpts: ToolsPayloadOptions = { settings, desktopAgentChatMode }
  const streamRound1ToUi = !useKnowledgeCard && !usePlanDocumentCard
  const reqBody: Record<string, unknown> = {
    model: settings.model,
    messages,
    stream: true,
    max_tokens: useKnowledgeCard ? undefined : Math.min(2048, settings.anthropicMaxTokens ?? 1024)
  }
  // 主动策略 Loop：intensityMod 调制温度（0.5~1.5 乘到基线 0.6）
  const intensityMod = typeof body.intensityMod === 'number' ? body.intensityMod : 1.0
  reqBody.temperature = Math.max(0.1, Math.min(1.5, 0.6 * intensityMod))
  if (reqBody.max_tokens == null) delete reqBody.max_tokens
  const allMsgsEarly = messages as Array<{ role: string; content: unknown }>
  const forcedWebSearchQueryRaw = (
    typeof body.forcedWebSearchQuery === 'string' ? body.forcedWebSearchQuery : ''
  ).trim()
  const forcedWebSearchQuery = shouldForceWebSearchInDesktopAgentSession(
    agentActive,
    forcedWebSearchQueryRaw || undefined
  )
  const turnIdEarly = typeof body.turnId === 'string' ? body.turnId : undefined
  const userTaskFrame = parseUserTaskFrameFromBody(body)
  const userMsgEarly = lastUserMessageFromContext(allMsgsEarly)

  /** 电脑助手 + 调查类问题：优先本机地图，不走联网 */
  if (
    agentActive &&
    (await tryHandleInvestigationChatTurn({
      webContents,
      settings,
      dataRoot,
      body,
      userMsg: userMsgEarly,
      turnId: turnIdEarly,
      signal: controller.signal
    }))
  ) {
    clearTimeout(abortTimer)
    return
  }

  if (forcedWebSearchQuery) {
    try {
      await runForcedWebSearchTurn(
        webContents,
        settings,
        allMsgsEarly,
        forcedWebSearchQuery,
        dataRoot,
        turnIdEarly,
        userTaskFrame
      )
    } catch (e) {
      webContents.send('chat:error', e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(abortTimer)
    }
    return
  }

  /** 知识整理：跳过首轮闲聊流，直接纸面卡 + 伴侣短评 */
  if (useKnowledgeCard) {
    const turnIdOnly = typeof body.turnId === 'string' ? body.turnId : undefined
    try {
      const companion = await runKnowledgeAnswerChain(
        webContents,
        settings,
        allMsgsEarly,
        {
          topic: knowledgeTopic,
          userQuestion: lastUserMessageFromContext(allMsgsEarly)
        },
        (text) => webContents.send('chat:status', text)
      )
      webContents.send('chat:replace', companion)
      webContents.send('chat:done', {
        memoryWrites: [`KNOWLEDGE 整理「${knowledgeTopic}」`],
        assistantText: companion,
        turnId: turnIdOnly
      })
      notifyUiChatBubble({ text: companion, role: 'assistant' })
      void finalizeTurnAfterStream({
        turnId: turnIdOnly,
        dataRoot,
        assistantText: companion,
        settings
      })
    } catch (e) {
      webContents.send('chat:error', e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(abortTimer)
    }
    return
  }

  /** 计划书：跳过首轮闲聊流，直接纸面卡 + 伴侣短评 */
  if (usePlanDocumentCard) {
    const turnIdOnly = typeof body.turnId === 'string' ? body.turnId : undefined
    try {
      const companion = await runPlanDocumentViaSkill(
        webContents,
        settings,
        allMsgsEarly,
        {
          topic: planDocumentTopic,
          userQuestion: lastUserMessageFromContext(allMsgsEarly)
        },
        (text) => webContents.send('chat:status', text)
      )
      webContents.send('chat:replace', companion)
      webContents.send('chat:done', {
        memoryWrites: [`PLAN 计划书「${planDocumentTopic}」`],
        assistantText: companion,
        turnId: turnIdOnly
      })
      notifyUiChatBubble({ text: companion, role: 'assistant' })
      void finalizeTurnAfterStream({
        turnId: turnIdOnly,
        dataRoot,
        assistantText: companion,
        settings
      })
    } catch (e) {
      webContents.send('chat:error', e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(abortTimer)
    }
    return
  }

  if (sendTools) {
    reqBody.tools = toolsPayload(toolsOpts)
    reqBody.tool_choice = 'auto'
    const offered = toolNames(toolsOpts)
    log.info('chat 工具列表', {
      hasWebSearch: offered.includes('web_search'),
      tools: offered
    })
  }

  if (isLlmMockMode()) {
    const turnId = typeof body.turnId === 'string' ? body.turnId : undefined
    const mockText = mockChatStreamText(allMsgsEarly)
    try {
      if (streamRound1ToUi) {
        notifyChatStreamStart(webContents)
        for (const ch of mockText) {
          webContents.send('chat:chunk', ch)
        }
      } else {
        webContents.send('chat:replace', mockText)
      }
      webContents.send('chat:done', {
        memoryWrites: [],
        assistantText: mockText,
        turnId
      })
      notifyUiChatBubble({ text: mockText, role: 'assistant' })
      void finalizeTurnAfterStream({
        turnId,
        dataRoot,
        assistantText: mockText,
        settings
      })
    } catch (e) {
      webContents.send('chat:error', e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(abortTimer)
    }
    return
  }

  try {
    const userMsgEarly = lastUserMessageFromContext(allMsgsEarly)
    const turnId = typeof body.turnId === 'string' ? body.turnId : undefined

    if (
      agentActive &&
      userMsgEarly &&
      shouldRouteDesktopAgentToBackgroundJob(userMsgEarly, dataRoot, chatSessionId)
    ) {
      notifyChatStreamStart(webContents)
      webContents.send('chat:replace', DESKTOP_AGENT_TASK_START_ACK)
      webContents.send('chat:done', {
        memoryWrites: [],
        assistantText: DESKTOP_AGENT_TASK_START_ACK,
        turnId
      })
      notifyUiChatBubble({ text: DESKTOP_AGENT_TASK_START_ACK, role: 'assistant' })
      void finalizeTurnAfterStream({
        turnId,
        dataRoot,
        assistantText: DESKTOP_AGENT_TASK_START_ACK,
        settings
      })
      startBackgroundAgentJob({
        provider: 'openai',
        webContents,
        body,
        dataRoot,
        sessionId: chatSessionId,
        userText: userMsgEarly
      })
      return
    }

    let runAgentLoop = agentActive
    if (
      agentActive &&
      userMsgEarly &&
      isBackgroundAgentJobRunning(dataRoot, chatSessionId) &&
      !isContinueTaskPlanIntent(userMsgEarly)
    ) {
      runAgentLoop = false
      if (sendTools) {
        reqBody.tools = toolsPayload({ settings, desktopAgentChatMode: false })
      }
    }

    const workingLabel = taskFrameWorkingActivityLabel(userTaskFrame)
    if (workingLabel) {
      webContents.send('chat:status', workingLabel)
    }

    const streamLlmRound = async (streamToUi: boolean): Promise<string> => {
      const res = await fetch(url, {
        method: 'POST',
        headers: buildLlmHeaders(settings),
        body: JSON.stringify(reqBody),
        signal: controller.signal
      })
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => res.statusText)
        webContents.send('chat:error', `HTTP ${res.status}: ${errText.slice(0, 500)}`)
        return ''
      }
      return readOpenAiChatCompletionStream(webContents, res, {
        streamToUi,
        pacedSentences: streamToUi,
        signal: controller.signal,
        toolAcc
      })
    }

    const userMsg = userMsgEarly ?? lastUserMessageFromContext(allMsgsEarly)
    const turnIdLoop = turnId
    const writes: string[] = []

    let webSearchCompanionReply: string | null = null
    let toolResults: Array<{ name: string; content: string }> = []
    const allToolResults: Array<{ name: string; content: string }> = []

    const pending = turnIdLoop ? peekPendingTurn(turnIdLoop) : undefined
    const actionCtx: ActionContext | null = pending
      ? { dataRoot, l1: pending.newState.relationship, l2: pending.newState.emotion }
      : null
    const prefetchedFacts: PrefetchedFact[] = []
    let skipLlmExtraction = false

    const maxAgentRounds = runAgentLoop ? DESKTOP_AGENT_MAX_TOOL_ROUNDS : 1
    let loopMessages = allMsgsEarly as Array<{ role: string; content: unknown }>
    let sorted: Array<[number, ToolCallAcc]> = []
    let zeroToolRetried = false

    const planResult =
      runAgentLoop && userMsg
        ? await resolveDesktopAgentTaskPlan({
            settings,
            userText: userMsg,
            webContents,
            signal: controller.signal,
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
          {
            settings,
            userText: userMsg,
            webContents,
            signal: controller.signal,
            dataRoot,
            sessionId: chatSessionId
          },
          taskPlan
        )
        if (hint) {
          loopMessages = [...loopMessages, { role: 'user', content: hint }]
        }
      }
      log.info('desktop-agent.task-plan', {
        id: taskPlan.id,
        planner: taskPlan.planner,
        goal: taskPlan.goalSummary,
        resumed: planResult.resumed,
        steps: taskPlan.steps.map((s) => s.id)
      })
    }

    const readPlanAudit = () =>
      taskPlan ? readTaskPlanAudit(dataRoot, taskPlan) : []

    for (let agentRound = 0; agentRound < maxAgentRounds; agentRound++) {
      reqBody.messages = loopMessages
      if (agentRound > 0) {
        webContents.send('chat:status', `电脑助手工作中…（第 ${agentRound + 1}/${maxAgentRounds} 步）`)
      }

      const streamUi = streamRound1ToUi && agentRound === 0 && !runAgentLoop
      for (let attempt = 0; attempt < 2; attempt++) {
        toolAcc.clear()
        round1Text = await streamLlmRound(streamUi)
        if (round1Text.trim() || toolAcc.size > 0) break
        if (attempt === 0 && streamUi) {
          log.warn('llm.empty_reply_retry')
          await new Promise((r) => setTimeout(r, 300))
        } else {
          break
        }
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
            setOpenAiToolChoice(reqBody, 'required', settings)
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
            setOpenAiToolChoice(reqBody, 'required', settings)
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
        if (runAgentLoop && agentRound === 0 && !zeroToolRetried && sendTools) {
          zeroToolRetried = true
          webContents.send('chat:status', '调查未启动，正在重试…')
          setOpenAiToolChoice(reqBody, 'required', settings)
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
        assistantAcc = round1Text
        break
      }

      // 强制生图拦截：当用户意图是生图但模型未调用 agnes_image 时，自动补一次工具调用
      if (sorted.length === 0 && userMsg && sendTools) {
        const intent = detectImageIntent(userMsg)
        if (intent) {
          log.info('强制生图拦截：模型未调用工具，自动补调 agnes_image', { prompt: intent.prompt })
          sorted = [[0, { name: 'agnes_image', arguments: JSON.stringify({ prompt: intent.prompt, size: '1024x1024' }) }]]
          webContents.send('chat:status', '正在生成图片…')
        }
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
        taskPlanId: taskPlan?.id
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

      const turnAudit = readPlanAudit()
      if (taskPlan) {
        taskPlanProgress = emitTaskPlanFromAudit(webContents, taskPlan, turnAudit, 'executing')
        savePersistedTaskPlan(dataRoot, chatSessionId, taskPlan, taskPlanProgress)
      }

      const willContinueToolLoop = shouldContinueDesktopAgentLoop(
        runAgentLoop,
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
        setOpenAiToolChoice(reqBody, 'required', settings)
        continue
      }

      if (willContinueToolLoop) {
        loopMessages = appendDesktopAgentRoundMessages(loopMessages, round1Text, toolResults, {
          taskPlanActive: !!taskPlan
        })
        continue
      }

      if (taskPlan && taskPlanProgress && !taskPlanProgress.allPassed) {
        if (agentRound < maxAgentRounds - 1) {
          const gate = gateAgentLoopExit({
            plan: taskPlan,
            audit: turnAudit,
            agentRound,
            maxRounds: maxAgentRounds,
            sortedToolCount: sorted.length,
            round1Text
          })
          if (gate.action === 'continue' && gate.continuationUserMessage) {
            loopMessages = appendDesktopAgentRoundMessages(loopMessages, round1Text, toolResults, {
              taskPlanActive: true,
              taskPlanNudge: gate.continuationUserMessage
            })
            setOpenAiToolChoice(reqBody, 'required', settings)
            continue
          }
        }
        assistantAcc = buildTaskPlanIncompleteDelivery(taskPlanProgress)
        taskPlanDeliveredEarly = true
        emitTaskPlanProgress(webContents, taskPlan, 'incomplete', undefined, turnAudit)
        break
      }
      break
    }

    if (turnIdLoop && (prefetchedFacts.length > 0 || skipLlmExtraction)) {
      updatePendingTurn(turnIdLoop, {
        prefetchedFacts: prefetchedFacts.length > 0 ? prefetchedFacts : undefined,
        skipLlmExtraction
      })
    }

    if (sendTools) {
      const invoked = sorted.map(([, tc]) => tc.name).filter(Boolean) as string[]
      log.info('web_search 本轮是否被调用', {
        offered: toolNames(toolsOpts).includes('web_search'),
        called: invoked.includes('web_search'),
        toolCalls: invoked,
        agentRounds: runAgentLoop ? 'multi' : 'single'
      })
    }

    const allMsgs = allMsgsEarly

    const otherToolResults = mergeToolResultsForDelivery(allToolResults)
    const followUpMaxTokens = runAgentLoop
      ? Math.max(INVESTIGATION_SYNTHESIZE_MIN_TOKENS, 1800)
      : 600

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
      webContents.send('chat:replace', assistantAcc)
    } else if (taskPlan && finalTaskProgress?.allPassed) {
      clearPersistedTaskPlan(dataRoot, chatSessionId)
      emitTaskPlanProgress(webContents, taskPlan, 'delivering', undefined, taskPlanAudit)
    } else if (taskPlan && finalTaskProgress) {
      savePersistedTaskPlan(dataRoot, chatSessionId, taskPlan, finalTaskProgress)
    }

    if (webSearchCompanionReply) {
      assistantAcc = finalizePaperCardCompanionReply(webSearchCompanionReply)
      webContents.send('chat:replace', assistantAcc)
    } else if (canDeliverTaskPlan && otherToolResults.length > 0) {
      webContents.send('chat:status', taskFrameFollowUpActivityLabel(userTaskFrame))
      const followUpPaced = !runAgentLoop
      const taskPlanHonesty =
        finalTaskProgress?.allPassed === true
          ? buildTaskPlanFollowUpHonestyBlock(finalTaskProgress)
          : undefined
      const desktopSuffix = buildDesktopAgentFollowUpSuffix(otherToolResults)
      const extraSuffix = [taskPlanHonesty, desktopSuffix].filter(Boolean).join('\n\n')
      try {
        const followReq = buildToolFollowUpRequestBody(
          settings,
          allMsgs,
          otherToolResults,
          followUpMaxTokens,
          userTaskFrame,
          extraSuffix || undefined
        )
        const followRes = await fetch(url, {
          method: 'POST',
          headers: buildLlmHeaders(settings),
          body: JSON.stringify(followReq),
          signal: controller.signal
        })
        if (followRes.ok && followRes.body) {
          const streamed = await readOpenAiChatCompletionStream(webContents, followRes, {
            streamToUi: true,
            pacedSentences: followUpPaced,
            signal: controller.signal
          })
          if (streamed) {
            assistantAcc = runAgentLoop ? streamed.trim() : finalizePaperCardCompanionReply(streamed)
            if (!followUpPaced) {
              webContents.send('chat:replace', assistantAcc)
            }
          }
        } else if (!followRes.ok) {
          const errBody = await followRes.text().catch(() => '')
          console.error('[chat] follow-up LLM call failed', followRes.status, errBody.slice(0, 300))
        }
      } catch (e) {
        console.error('[chat] follow-up LLM error', e)
      }
    }

    if (otherToolResults.length > 0 && !assistantAcc) {
      assistantAcc = buildToolResultsFallback(otherToolResults)
      webContents.send('chat:replace', assistantAcc)
    } else if (!assistantAcc.trim() && round1Text && canDeliverTaskPlan) {
      assistantAcc = round1Text
      if (!streamRound1ToUi || runAgentLoop) {
        webContents.send('chat:replace', round1Text)
      }
    } else if (assistantAcc.trim() && runAgentLoop && !streamRound1ToUi && canDeliverTaskPlan) {
      webContents.send('chat:replace', assistantAcc)
    }

    if (otherToolResults.some((tr) => tr.name === 'use_computer')) {
      assistantAcc = mergeDesktopAgentDelivery(assistantAcc, otherToolResults)
      if (runAgentLoop && !streamRound1ToUi) {
        webContents.send('chat:replace', assistantAcc)
      }
    }

    if (taskPlan) {
      clearTaskPlanProgress(webContents)
    }

    if (!assistantAcc.trim()) {
      assistantAcc = t('chat.error.emptyReply')
      webContents.send('chat:replace', assistantAcc)
    }

    webContents.send('chat:done', {
      memoryWrites: writes,
      assistantText: assistantAcc,
      turnId: turnIdLoop
    })
    notifyUiChatBubble({ text: assistantAcc, role: 'assistant' })
    void finalizeTurnAfterStream({
      turnId: turnIdLoop,
      dataRoot,
      assistantText: assistantAcc,
      settings
    })
  } catch (e) {
    if (turnIdEarly) clearPendingTurn(turnIdEarly)
    webContents.send('chat:error', e instanceof Error ? e.message : String(e))
  } finally {
    clearTimeout(abortTimer)
  }
}
