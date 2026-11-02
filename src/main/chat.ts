import { executeOpenAiToolBatch } from './chat/executeOpenAiTools'
import { openAiOutputTokenParams } from '../shared/outputTokens'
import {contextPublicationFence} from './chat/contextPublicationFence'
import { readOpenAiReplyWithContinuation } from './openAiReplyContinuation'
import type { WebContents } from 'electron'
import type { AppSettings } from './settings'
import { finalizeTurnAfterStream } from './postChatTurn'
import { sendChatDone } from './chatDonePayload'
import { buildLlmHeaders, resolveChatCompletionsUrl, shouldSendTools } from './llmEndpoint'
import { buildToolFollowUpRequestBody, buildToolResultsFallback } from './toolFollowUp'
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
import { t } from './i18n'

import { notifyUiChatBubble } from './uiWindow'
import { runForcedWebSearchTurn } from './extensions/plugins/builtin/knowledge-presentation/presentation/webSearchPresentation'
import { isLlmMockMode } from './llmMockMode'
import { mockChatStreamText } from './llmMockResponses'
import { taskFrameFollowUpActivityLabel, taskFrameWorkingActivityLabel } from './chatStatusLabels'
import {
  parseUserTaskFrameFromBody,
  runWebSearchWithTaskFrame
} from './taskFrame'
import { streamChatWaves } from './chat/waveChat'
import { notifyChatStreamStart, type ToolCallAcc } from './openAiSseStream'

import { outputGuard } from './channel/outputGuard'
import { peekChannelPlan } from './channel/lastPlan'

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
}

export function toolsPayload(opts?: ToolsPayloadOptions): unknown[] {
  void opts
  return [appendMemoryTool, readFileTool, extractFactsTool, ...skillDefsToOpenAiTools(getActiveSkillToolDefs())]
}

export function toolNames(opts?: ToolsPayloadOptions): string[] {
  void opts
  return ['append_memory', 'read_file', 'extract_facts', ...getActiveSkillToolDefs().map(d => d.name)]
}

export async function streamChatCompletion(webContents:WebContents,body:Record<string,unknown>,dataRoot:string,externalSignal?:AbortSignal):Promise<void>{
  const guard=contextPublicationFence(dataRoot,body)
  if(!guard&&!body.useWaveChat)return streamChatCompletionCore(webContents,body,dataRoot,externalSignal)
  const guards=guard?[guard]:[]
  if(body.waveContext&&typeof body.waveContext==='object')body.waveContext={...body.waveContext,trustedContextChecks:guards}
  const controller=new AbortController()
  const abort=()=>controller.abort()
  if(externalSignal?.aborted)abort()
  externalSignal?.addEventListener('abort',abort,{once:true})
  let invalidated=false
  const current=()=>{try{return guards.every(check=>check())}catch{return false}}
  const invalidate=()=>{
    if(invalidated)return
    invalidated=true;controller.abort()
    if(!webContents.isDestroyed()){
      webContents.send('chat:replace','')
      webContents.send('chat:error','任务要求或授权已更新，这条旧回复已停止。')
    }
  }
  const guarded=new Proxy(webContents,{get(target,name){if(name==='send')return(channel:string,...args:unknown[])=>{if(!current()){invalidate();return}if(!invalidated)target.send(channel,...args)};const value=Reflect.get(target,name);return typeof value==='function'?value.bind(target):value}})
  const timer=setInterval(()=>{if(!current())invalidate()},50);timer.unref()
  try{if(!current()){invalidate();return}await streamChatCompletionCore(guarded,body,dataRoot,controller.signal)}
  finally{clearInterval(timer);externalSignal?.removeEventListener('abort',abort)}
}

async function streamChatCompletionCore(
  webContents: WebContents,
  body: Record<string, unknown>,
  dataRoot: string,
  externalSignal?: AbortSignal
): Promise<void> {
  const settings = body.settings as AppSettings
  if (body.useWaveChat && body.wavePlan && body.waveContext) {
    return streamChatWaves(webContents, body, dataRoot, externalSignal)
  }
  if ((settings.llmProvider ?? 'openai') === 'anthropic') {
    return streamAnthropicMessages(webContents, body, dataRoot, externalSignal)
  }
  const messages = body.messages as unknown[]
  const url = resolveChatCompletionsUrl(settings)
  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()
  if (externalSignal?.aborted) controller.abort()
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true })
  const chatSessionId = typeof body.sessionId === 'string' ? body.sessionId : 'default'
  const timeoutMs = settings.timeoutMs || 120_000
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs)
  const toolAcc = new Map<number, ToolCallAcc>()
  let assistantAcc = ''
  let round1Text = ''
  let responseTruncated = false
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
  const toolsOpts: ToolsPayloadOptions = { settings }
  const streamRound1ToUi = !useKnowledgeCard && !usePlanDocumentCard
  const reqBody: Record<string, unknown> = {
    model: settings.model,
    messages,
    stream: true,
    ...openAiOutputTokenParams(settings)
  }
  // 主动策略 Loop：intensityMod 调制温度（0.5~1.5 乘到基线 0.6）
  const intensityMod = typeof body.intensityMod === 'number' ? body.intensityMod : 1.0
  reqBody.temperature = Math.max(0.1, Math.min(1.5, 0.6 * intensityMod))
  if (reqBody.max_tokens == null) delete reqBody.max_tokens
  const allMsgsEarly = messages as Array<{ role: string; content: unknown }>
  const forcedWebSearchQueryRaw = (
    typeof body.forcedWebSearchQuery === 'string' ? body.forcedWebSearchQuery : ''
  ).trim()
  const forcedWebSearchQuery = forcedWebSearchQueryRaw || undefined
  const turnIdEarly = typeof body.turnId === 'string' ? body.turnId : undefined
  const userTaskFrame = parseUserTaskFrameFromBody(body)

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
      if (!externalSignal?.aborted) webContents.send('chat:error', e instanceof Error ? e.message : String(e))
    } finally {
      externalSignal?.removeEventListener('abort', onExternalAbort)
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
      if (externalSignal?.aborted) return
    sendChatDone(webContents, {
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
      if (!externalSignal?.aborted) webContents.send('chat:error', e instanceof Error ? e.message : String(e))
    } finally {
      externalSignal?.removeEventListener('abort', onExternalAbort)
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
      if (externalSignal?.aborted) return
    sendChatDone(webContents, {
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
      if (!externalSignal?.aborted) webContents.send('chat:error', e instanceof Error ? e.message : String(e))
    } finally {
      externalSignal?.removeEventListener('abort', onExternalAbort)
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
      if (externalSignal?.aborted) return
    sendChatDone(webContents, {
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
      if (!externalSignal?.aborted) webContents.send('chat:error', e instanceof Error ? e.message : String(e))
    } finally {
      externalSignal?.removeEventListener('abort', onExternalAbort)
      clearTimeout(abortTimer)
    }
    return
  }

  try {
    const userMsgEarly = lastUserMessageFromContext(allMsgsEarly)
    const turnId = typeof body.turnId === 'string' ? body.turnId : undefined

    const workingLabel = taskFrameWorkingActivityLabel(userTaskFrame)
    if (workingLabel) {
      webContents.send('chat:status', workingLabel)
    }

    const streamLlmRound = async (streamToUi: boolean): Promise<string> => {
      const result = await readOpenAiReplyWithContinuation(webContents, url, reqBody, {
        headers: buildLlmHeaders(settings), signal: controller.signal, streamToUi, toolAcc
      })
      responseTruncated = result.truncated
      return result.text
    }

    const userMsg = userMsgEarly ?? lastUserMessageFromContext(allMsgsEarly)
    const turnIdLoop = turnId
    const writes: string[] = []

    let webSearchCompanionReply: string | null = null
    const allToolResults: Array<{ name: string; content: string }> = []

    const pending = turnIdLoop ? peekPendingTurn(turnIdLoop) : undefined
    const actionCtx: ActionContext | null = pending
      ? { dataRoot, l1: pending.newState.relationship, l2: pending.newState.emotion }
      : null
    const prefetchedFacts: PrefetchedFact[] = []
    let skipLlmExtraction = false

    for (let attempt = 0; attempt < 2; attempt++) {
      toolAcc.clear()
      round1Text = await streamLlmRound(streamRound1ToUi)
      if (externalSignal?.aborted) return
      if (round1Text.trim() || toolAcc.size > 0) break
      if (attempt === 0 && streamRound1ToUi) {
        log.warn('llm.empty_reply_retry')
        await new Promise(resolve => setTimeout(resolve, 300))
      } else break
    }
    const sorted = [...toolAcc.entries()].sort((a, b) => a[0] - b[0])
    if (sorted.length === 0) assistantAcc = round1Text
    else {
      const batch = await executeOpenAiToolBatch({
        sorted, settings, dataRoot, webContents, sessionId: chatSessionId,
        allMsgs: allMsgsEarly, userMsg, userTaskFrame, actionCtx
      })
      allToolResults.push(...batch.toolResults)
      writes.push(...batch.writes)
      prefetchedFacts.push(...batch.prefetchedFacts)
      skipLlmExtraction = batch.skipLlmExtraction
      webSearchCompanionReply = batch.webSearchCompanionReply
      if (pending?.trace?.turn != null && batch.invoked.length > 0) patchLatestTurnL5(pending.trace.turn, batch.invoked)
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
        toolCalls: invoked
      })
    }

    const allMsgs = allMsgsEarly

    const otherToolResults = allToolResults.filter(result => result.name !== 'append_memory')

    if (webSearchCompanionReply) {
      assistantAcc = webSearchCompanionReply.trim()
      webContents.send('chat:replace', assistantAcc)
    } else if (otherToolResults.length > 0) {
      webContents.send('chat:status', taskFrameFollowUpActivityLabel(userTaskFrame))
      let followUpPartial = ''
      try {
        const followReq = buildToolFollowUpRequestBody(
          settings,
          allMsgs,
          otherToolResults,
          600,
          userTaskFrame
        )
        const result = await readOpenAiReplyWithContinuation(webContents, url, followReq, {
          headers: buildLlmHeaders(settings), signal: controller.signal, streamToUi: true,
          toolAcc: new Map(), onTextDelta: text => { followUpPartial += text }
        })
        responseTruncated = result.truncated
        if (result.text) {
          // Ordinary tool replies are full answers, not the paper-card companion's short aside.
          assistantAcc = result.text.trim()
          webContents.send('chat:replace', assistantAcc)
        }
      } catch (e) {
        responseTruncated = true
        if (followUpPartial) assistantAcc = followUpPartial
        webContents.send('chat:status', '回答连接中断，已保留收到的内容。')
        console.error('[chat] follow-up LLM error', e)
      }
    }

    if (externalSignal?.aborted) return
    if (otherToolResults.length > 0 && !assistantAcc) {
      assistantAcc = buildToolResultsFallback(otherToolResults, settings)
      webContents.send('chat:replace', assistantAcc)
    } else if (!assistantAcc.trim() && round1Text) {
      assistantAcc = round1Text
      if (!streamRound1ToUi) webContents.send('chat:replace', round1Text)
    }

    if (!assistantAcc.trim()) {
      assistantAcc = t('chat.error.emptyReply')
      webContents.send('chat:replace', assistantAcc)
    }

    const rememberedPlan = peekChannelPlan(chatSessionId, turnIdEarly)
    if (rememberedPlan) {
      const guarded = outputGuard(assistantAcc, rememberedPlan.plan, rememberedPlan.executed, rememberedPlan.policy)
      if (guarded !== assistantAcc) {
        assistantAcc = guarded
        webContents.send('chat:replace', assistantAcc)
      }
    }

    if (externalSignal?.aborted) return
    sendChatDone(webContents, {
      memoryWrites: writes,
      assistantText: assistantAcc,
      ...(responseTruncated ? { generationState: 'incomplete' as const } : {}),
      turnId: turnIdLoop
    })
    notifyUiChatBubble({ text: assistantAcc, role: 'assistant' })
    void finalizeTurnAfterStream({
      turnId: turnIdLoop,
      dataRoot,
      assistantText: assistantAcc,
      ...(responseTruncated ? { generationState: 'incomplete' as const } : {}),
      settings
    })
  } catch (e) {
    if (turnIdEarly) clearPendingTurn(turnIdEarly)
    if (!externalSignal?.aborted) webContents.send('chat:error', e instanceof Error ? e.message : String(e))
  } finally {
    externalSignal?.removeEventListener('abort', onExternalAbort)
    if (externalSignal?.aborted && turnIdEarly) clearPendingTurn(turnIdEarly)
    clearTimeout(abortTimer)
  }
}
