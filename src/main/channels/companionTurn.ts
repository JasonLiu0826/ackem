import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { assembleMessages } from '../context'
import { streamChatCompletion } from '../chat'
import { isEmbeddingReadyForChat } from '../embedding/embeddingReadiness'
import { runPreLlmTurn, activeRecall } from '../engine/orchestrator'
import { prepareTurnContext } from '../engine/prepareTurnContext'
import { loadState, saveState, defaultFullState } from '../engine/state-persistence'
import { getOrCreateEngineCache, getOrInitEmbeddingProvider, ensureFactEmbeddingsReady } from '../engineCache'
import { buildUserInfoBlock } from '../memory/userDossier'
import { workingMemory } from '../memory/workingMemory'
import { setPendingTurn } from '../turnPending'
import { registerAndFinalizeSkipTurn } from '../postChatTurn'
import { shouldSkipTierBIngestForOrigin } from '../canon/originEscalationGuard'
import { defaultPersonalitySlice } from '../personalityPresets'
import { loadSettings } from '../settings'
import { resolveDataRoot } from '../paths'
import { ensureDataLayout } from '../layout'
import { getOrRebuildIndex } from '../ipc/shared'
import type { AppSettings } from '../settings'
import type { FullState } from '../engine/types'
import { createHeadlessChatSink } from './headlessChatSink'
import { CompanionTurnError, type CompanionTurnInput, type CompanionTurnResult } from './types'
import { createLogger } from '../logger'
import { buildWeixinPsycheHint } from './weixin/deliveryProfiles'
import { buildQqPsycheHint } from './qq/psyche'
import {
  resolveWeixinStructuredIntent,
  runWeixinStructuredTurn
} from './weixin/structuredTurn'
import { finalizeTurnAfterStream } from '../postChatTurn'
import { getLastActivatedAssociationIds } from '../memory/retriever'
import { maybeRunCodeTask } from '../ackemcode/dispatch'
import { getExtensionsCoordinator } from '../extensions/runtime'
import { preExecuteWeatherQuery } from '../extensions/skills/builtin/tool/weather-sense/weatherPreExecute'
import { preExecuteWebSearch } from '../extensions/skills/builtin/tool/web-search/preExecute'

const log = createLogger('companion-turn')

function mergeEngineStateForSession(
  root: string,
  settings: AppSettings,
  sessionId: string
): FullState {
  const pers = defaultPersonalitySlice(settings)
  const loaded = loadState(root, sessionId)
  if (!loaded) return defaultFullState(pers)
  const s = { ...loaded }
  if (!s.counters) s.counters = { totalTurns: 0, sharedEventsCount: 0, consecutiveMeaningfulTurns: 0 }
  if (!s.personality || s.personality.presetId !== settings.personalityPresetId) {
    s.personality = pers
    s.personalityBaseline = { T: pers.T, I: pers.I, S: pers.S, O: pers.O, R: pers.R }
  }
  if (!s.userProfile) s.userProfile = defaultFullState(pers).userProfile
  if (!s.externalAtmosphere) s.externalAtmosphere = { level: 0, label: 'neutral' }
  if (!s.desireStack) s.desireStack = { slots: [null, null, null, null, null] }
  return s
}

function resolveTurnIndex(state: FullState, explicit?: number): number {
  if (typeof explicit === 'number') return explicit
  return state.counters?.totalTurns ?? 0
}

/** 外部通道与桌面 IPC 共用的「跑一轮陪伴对话」 */
export async function runCompanionTurn(input: CompanionTurnInput): Promise<CompanionTurnResult> {
  const userImages = (input.userImages ?? []).filter((u) => typeof u === 'string' && u.length > 0)
  // 纯图片消息没有文字是合法的：给一句占位文案，由多模态片段承载真正的信息
  let userText = input.userText.trim() || (userImages.length > 0 ? '[发来了一张图片]' : '')
  if (!userText) {
    throw new CompanionTurnError('empty input', 'EMPTY_INPUT')
  }

  // 三端统一：QQ / 微信里也先判断是不是代码任务，是就交给 Ackem Code
  if (userImages.length === 0) {
    const codeDispatch = await maybeRunCodeTask({
      chatSessionId: input.sessionId,
      text: userText,
      channel: input.channel
    })
    if (codeDispatch.handled) {
      const assistantText = codeDispatch.ok
        ? codeDispatch.text
        : `这个代码任务没跑完：${codeDispatch.error ?? '未知错误'}`
      return { assistantText, turnId: randomUUID() }
    }
  }

  // 渠道远程电脑助手必须显式点名（/电脑 …），否则普通聊天不该触发本机操作
  const REMOTE_AGENT_PREFIX = /^\s*[\/／](?:电脑|pc|agent)\s*/i
  const remoteAgentRequested = REMOTE_AGENT_PREFIX.test(userText)
  if (remoteAgentRequested) {
    userText = userText.replace(REMOTE_AGENT_PREFIX, '').trim() || userText
  }

  const settings = loadSettings()
  if (!isLlmApiConfigured(settings)) {
    throw new CompanionTurnError('llm api not configured', 'NO_API')
  }

  const root = resolveDataRoot(settings)
  ensureDataLayout(root)
  activeRecall.setPersistencePath(join(root, 'memory', 'recall-history.json'))

  const sessionId = input.sessionId
  const snap = getOrRebuildIndex()
  let state = mergeEngineStateForSession(root, settings, sessionId)
  // 预热期不再整轮拒绝：provider 未就绪最多等 30 秒，随后用 FTS/触发词降级检索继续聊天
  await Promise.race([
    getOrInitEmbeddingProvider(root),
    new Promise<void>((resolve) => setTimeout(resolve, 30_000))
  ])
  const cache = getOrCreateEngineCache(root, snap)
  const { store, retriever } = cache
  await ensureFactEmbeddingsReady(cache)

  const turnIndex = resolveTurnIndex(state, input.turnIndex)
  const recentMessages = input.recentMessages ?? []

  const preparedTurn = await prepareTurnContext({
    msg: userText,
    state,
    factStore: store,
    retriever,
    sessionId,
    turnIndex,
    memoryBudgetChars: settings.memoryBudgetChars,
    recentUserMessages: recentUserMsgsFrom(recentMessages),
    dataRoot: root,
    index: snap,
    adultMode: settings.adultContentMode && settings.ageConfirmed18
  })

  const pre = await runPreLlmTurn({
    msg: userText,
    prev: state,
    factStore: store,
    retriever,
    sessionId,
    dataRoot: root,
    turnIndex,
    memoryBudgetChars: settings.memoryBudgetChars,
    adultMode: settings.adultContentMode && settings.ageConfirmed18,
    recentUserMessages: recentUserMsgsFrom(recentMessages),
    recentMessages,
    preparedTurn,
    lite: input.channel === 'weixin'
  })

  const turnId = randomUUID()
  // 进程刚启动时缓冲区是空的：先用持久化的对话历史把它填回来，
  // 否则重启后前几轮没有素材可抽情节摘要，她会显得"断片"。
  workingMemory.hydrate(sessionId, recentMessages)
  workingMemory.push(sessionId, { turnIndex, userText, assistantText: '' })

  if (pre.skipLlm) {
    const assistantText = pre.redlineReply ?? ''
    saveState(root, pre.newState, sessionId)
    if (assistantText) {
      await registerAndFinalizeSkipTurn({
        turnId,
        dataRoot: root,
        sessionId,
        turnIndex,
        userMsg: userText,
        assistantText,
        newState: pre.newState,
        trace: pre.trace,
        event: pre.event,
        settings,
        skipIngest: shouldSkipTierBIngestForOrigin(pre.trace)
      })
    }
    return {
      assistantText,
      turnId,
      skipLlm: true,
      deliveryHints: {
        presetId: settings.personalityPresetId,
        aro: pre.newState.emotion.aro,
        aff: pre.newState.emotion.aff,
        intensity: pre.trace?.l0?.intensity
      }
    }
  }

  saveState(root, pre.newState, sessionId)
  state = pre.newState

  setPendingTurn(turnId, {
    dataRoot: root,
    sessionId,
    turnIndex,
    userMsg: userText,
    newState: pre.newState,
    skipIngest: shouldSkipTierBIngestForOrigin(pre.trace),
    trace: pre.trace,
    event: pre.event,
    activatedAssociationIds: getLastActivatedAssociationIds()
  })

  const userInfoBlock = buildUserInfoBlock(root, store)
  let psycheBlock = pre.psycheBlock
  if (input.channel === 'weixin') {
    psycheBlock += buildWeixinPsycheHint(settings.personalityPresetId)
  } else if (input.channel === 'qq') {
    psycheBlock += buildQqPsycheHint(settings.personalityPresetId, userText)
  }
  // 渠道里没有聊天工具：天气这类需要联网的能力先预执行一次，把结果注入上下文
  try {
    const extCoordinator = getExtensionsCoordinator()
    if (extCoordinator) {
      const weatherBlock = await preExecuteWeatherQuery(extCoordinator, userText)
      if (weatherBlock) psycheBlock += `\n\n${weatherBlock}`
    }
  } catch (e) {
    log.warn('weather pre-execute failed', { error: e instanceof Error ? e.message : String(e) })
  }

  // 结构化意图（搜索/知识卡/计划卡）：微信与 QQ 共用同一套管线
  const structuredIntent =
    input.channel === 'weixin' || input.channel === 'qq'
      ? resolveWeixinStructuredIntent({
          userText,
          sessionId,
          recentMessages,
          workIntent: pre.workIntent
        })
      : null

  // QQ 没有结构化搜索分支时：明确要联网查的请求在这里预执行并注入结果
  if (input.channel === 'qq' && !structuredIntent) {
    try {
      const extCoordinator = getExtensionsCoordinator()
      if (extCoordinator) {
        const webBlock = await preExecuteWebSearch(extCoordinator, userText, recentMessages)
        if (webBlock) psycheBlock += `\n\n${webBlock}`
      }
    } catch (e) {
      log.warn('web search pre-execute failed', { error: e instanceof Error ? e.message : String(e) })
    }
  }

  // 记忆链路可观测性：把"这一轮到底检索到了什么"记下来，
  // 否则永远无法判断她是不是真的想起来了。
  const traceB = (pre.tierBBlock ?? '').trim()
  if (traceB.length > 0) {
    log.info('memory retrieved', {
      sessionId,
      turnIndex,
      chars: traceB.length,
      preview: traceB.slice(0, 80).replace(/\n/g, ' ')
    })
  } else {
    log.info('memory empty', { sessionId, turnIndex })
  }

  const messages = assembleMessages({
    userText,
    channel: input.channel,
    userImages,
    recentMessages,
    index: snap,
    settings,
    psycheBlock,
    tierBBlock: pre.tierBBlock,
    userInfoBlock
  })

  const deliveryHints = {
    presetId: settings.personalityPresetId,
    aro: pre.newState.emotion.aro,
    aff: pre.newState.emotion.aff,
    intensity: pre.trace?.l0?.intensity
  }

  if (structuredIntent) {
    try {
        const structured = await runWeixinStructuredTurn({
          intent: structuredIntent,
          settings,
          messages,
          userText
        })

        const recent = workingMemory.getRecent(sessionId)
        const last = recent[recent.length - 1]
        if (last && !last.assistantText) {
          last.assistantText = structured.companionReply
        }

        void finalizeTurnAfterStream({
          turnId,
          dataRoot: root,
          assistantText: structured.companionReply,
          settings
        })

        log.info('weixin structured turn', {
          kind: structured.kind,
          title: structured.displayTitle
        })

        return {
          assistantText: structured.companionReply,
          turnId,
          skipLlm: false,
          deliveryHints,
          documentDelivery: {
            cardBody: structured.cardBody,
            displayTitle: structured.displayTitle,
            kind: structured.kind
          }
        }
      } catch (e) {
        log.error('weixin structured turn failed, fallback chat', e)
      }
  }

  const streamTurn = async (desktopAgent: boolean): Promise<string> => {
    const sink = createHeadlessChatSink()
    const chatPromise = sink.getAssistantText()
    await streamChatCompletion(
      sink.webContents,
      {
        messages,
        settings: {
          ...settings,
          disableChatTools: desktopAgent ? false : true,
          asyncMultiMessageEnabled: false
        },
        turnId,
        intensityMod: pre.intensityMod ?? 1,
        sessionId,
        desktopAgentChatMode: desktopAgent ? true : undefined,
        deferAgentTaskPlan: desktopAgent ? true : undefined
      },
      root
    )
    return chatPromise
  }

  // 渠道远程电脑助手：需在设置里显式开启（默认关），且仍需桌面端逐次确认
  const remoteDesktopAgent =
    (input.channel === 'qq' || input.channel === 'weixin') &&
    remoteAgentRequested &&
    settings.desktopAgentRemoteChannelsEnabled === true &&
    settings.desktopAgentEnabled === true &&
    settings.desktopAgentRiskAccepted === true

  let assistantText: string
  try {
    assistantText = (await streamTurn(remoteDesktopAgent)).trim()
  } catch (e) {
    log.error('stream failed', e)
    if (remoteDesktopAgent) {
      // 电脑助手回路在渠道里不可用时，自动降级为普通聊天，绝不把内部错误甩给用户
      try {
        assistantText = (await streamTurn(false)).trim()
        log.warn('agent turn failed, degraded to plain chat')
      } catch (e2) {
        log.error('degraded stream failed', e2)
        assistantText = ''
      }
    } else {
      assistantText = ''
    }
    if (!assistantText) assistantText = '抱歉，我这边刚才没处理好，你再发一次好吗？'
  }

  if (!assistantText) {
    assistantText = '…'
  }

  const recent = workingMemory.getRecent(sessionId)
  const last = recent[recent.length - 1]
  if (last && !last.assistantText) last.assistantText = assistantText

  // 记忆巩固：抽取事实、生成情节摘要、更新索引。
  // 之前这一步只在 weixin 结构化分支里调用，QQ 渠道整段漏掉——
  // 等于聊完什么都不记，facts/episodes 全靠历史遗留。
  void finalizeTurnAfterStream({
    turnId,
    dataRoot: root,
    assistantText,
    settings
  }).catch((e) => log.warn('finalize turn failed', { error: String(e) }))

  return {
    assistantText,
    turnId,
    skipLlm: false,
    deliveryHints
  }
}

function recentUserMsgsFrom(recent: Array<{ role: string; content: string }>): string[] {
  return recent.filter((m) => m.role === 'user').map((m) => m.content)
}

function isLlmApiConfigured(settings: AppSettings): boolean {
  const provider = settings.llmProvider ?? 'openai'
  if (provider === 'anthropic') return Boolean(settings.anthropicBaseUrl?.trim())
  return Boolean(settings.openaiBaseUrl?.trim())
}
