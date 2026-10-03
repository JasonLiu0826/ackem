import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { assembleMessages } from '../context'
import { assembleSocialMemberMessages } from '../context/promptAssembly'
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
import {
  resolveWeixinStructuredIntent,
  runWeixinStructuredTurn
} from './weixin/structuredTurn'
import { finalizeTurnAfterStream } from '../postChatTurn'
import { PRIMARY_AGENT_ID, sessionIdForAgent } from '../social/agents/agentPaths'
import { isPrimaryCompanion, isSocialMember } from '../social/agents/guards'
import { withAgentContext } from '../social/agents/withAgentContext'
import { getRegisteredAgent } from '../social/agents/agentRegistry'
import { channelToInteractionSurface } from '../memory/provenance'

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
  const userText = input.userText.trim()
  if (!userText) {
    throw new CompanionTurnError('empty input', 'EMPTY_INPUT')
  }
  if (!isEmbeddingReadyForChat()) {
    throw new CompanionTurnError('embedding warming', 'EMBEDDING_WARMING')
  }

  const settings = loadSettings()
  if (!isLlmApiConfigured(settings)) {
    throw new CompanionTurnError('llm api not configured', 'NO_API')
  }

  const root = resolveDataRoot(settings)
  ensureDataLayout(root)

  const targetAgentId =
    typeof input.targetAgentId === 'string' && input.targetAgentId.trim()
      ? input.targetAgentId.trim()
      : PRIMARY_AGENT_ID
  const sessionId = sessionIdForAgent(targetAgentId)
  const interactionSurface = channelToInteractionSurface(
    input.channel === 'weixin' ? 'weixin' : 'desktop',
    undefined,
    targetAgentId
  )

  return withAgentContext(
    targetAgentId,
    () => runCompanionTurnInner({ ...input, sessionId, userText }, targetAgentId, root, settings),
    { interactionSurface }
  )
}

async function runCompanionTurnInner(
  input: CompanionTurnInput & { userText: string },
  targetAgentId: string,
  root: string,
  settings: AppSettings
): Promise<CompanionTurnResult> {
  const userText = input.userText
  const sessionId = input.sessionId
  const social = isSocialMember(targetAgentId, root)
  const interactionSurface = channelToInteractionSurface(
    input.channel === 'weixin' ? 'weixin' : 'desktop',
    undefined,
    targetAgentId
  )

  if (isPrimaryCompanion(targetAgentId)) {
    activeRecall.setPersistencePath(join(root, 'memory', 'recall-history.json'))
  } else {
    activeRecall.setPersistencePath(join(root, 'agents', targetAgentId, 'recall-history.json'))
  }

  const snap = getOrRebuildIndex()
  let state = mergeEngineStateForSession(root, settings, sessionId)
  await getOrInitEmbeddingProvider(root)
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
  const prevState = structuredClone(state)

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
        prevState,
        trace: pre.trace,
        event: pre.event,
        settings,
        skipIngest: shouldSkipTierBIngestForOrigin(pre.trace),
        surface: input.channel === 'weixin' ? 'weixin' : 'desktop',
        interactionSurface,
        ownerAgentId: targetAgentId
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

  workingMemory.push(sessionId, { turnIndex, userText, assistantText: '' })

  saveState(root, pre.newState, sessionId)
  state = pre.newState

  setPendingTurn(turnId, {
    dataRoot: root,
    sessionId,
    turnIndex,
    userMsg: userText,
    newState: pre.newState,
    prevState,
    skipIngest: shouldSkipTierBIngestForOrigin(pre.trace),
    trace: pre.trace,
    event: pre.event,
    surface: input.channel === 'weixin' ? 'weixin' : 'desktop',
    interactionSurface,
    ownerAgentId: targetAgentId
  })

  const agentRow = social ? getRegisteredAgent(root, targetAgentId) : null
  let messages: unknown[]
  if (social && agentRow) {
    messages = assembleSocialMemberMessages({
      agentId: targetAgentId,
      displayName: agentRow.name,
      psycheBlock: pre.psycheBlock,
      tierBBlock: pre.tierBBlock,
      recentMessages,
      userText,
      settings
    })
  } else {
    const userInfoBlock = buildUserInfoBlock(root, store)
    let psycheBlock = pre.psycheBlock
    if (input.channel === 'weixin') {
      psycheBlock += buildWeixinPsycheHint(settings.personalityPresetId)
    }
    messages = assembleMessages({
      userText,
      recentMessages,
      index: snap,
      settings,
      psycheBlock,
      tierBBlock: pre.tierBBlock,
      userInfoBlock
    })
  }

  const deliveryHints = {
    presetId: settings.personalityPresetId,
    aro: pre.newState.emotion.aro,
    aff: pre.newState.emotion.aff,
    intensity: pre.trace?.l0?.intensity
  }

  // 结构化知识/Plan 仅 Ackem；社会成员走普通对话
  if (input.channel === 'weixin' && !social) {
    const structuredIntent = resolveWeixinStructuredIntent({
      userText,
      sessionId,
      recentMessages,
      workIntent: pre.workIntent
    })

    if (structuredIntent) {
      try {
        const structured = await runWeixinStructuredTurn({
          intent: structuredIntent,
          settings,
          messages: messages as Parameters<typeof runWeixinStructuredTurn>[0]['messages'],
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
  }

  const sink = createHeadlessChatSink()
  const chatPromise = sink.getAssistantText()

  await streamChatCompletion(
    sink.webContents,
    {
      messages,
      settings: { ...settings, disableChatTools: true, asyncMultiMessageEnabled: false },
      turnId,
      intensityMod: pre.intensityMod ?? 1,
      sessionId,
      targetAgentId: social ? targetAgentId : undefined,
      interactionSurface
    },
    root
  )

  let assistantText: string
  try {
    assistantText = (await chatPromise).trim()
  } catch (e) {
    log.error('stream failed', e)
    assistantText = '抱歉，我这边刚才没处理好，你再发一次好吗？'
  }

  if (!assistantText) {
    assistantText = '…'
  }

  const recent = workingMemory.getRecent(sessionId)
  const last = recent[recent.length - 1]
  if (last && !last.assistantText) last.assistantText = assistantText

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
