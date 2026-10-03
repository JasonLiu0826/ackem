import { saveState } from './engine/state-persistence'
import { FactStore, defaultFactsPath } from './memory/factStore'
import { KnowledgeGraph, defaultKgPath } from './memory/knowledgeGraph'
import { workingMemory } from './memory/workingMemory'
import type { AppSettings } from './settings'
import { readPendingSurface, setPendingTurn, takePendingTurn, type PendingChatTurn } from './turnPending'
import { finalizeChatTurn } from './chat/turnCoordinator'
import type { Event, FullState, TurnTrace } from './engine/types'
import { writeSyncLightFacts } from './memory/syncLightWrite'
import { finalizeNewFacts } from './memory/finalizeNewFacts'
import { resolveTierBIngestSkip } from './memory/tierBIngestPolicy'
import { getAssociationIndex } from './engineCache'
import { createLogger } from './logger'
import { resolveAdultMemoryPrivacyLevel } from './prompt/adult-mode'
import { mirrorAssistantToWeixin } from './channels/weixin/mirrorOutbound'
import { buildTurnStateDelta } from './engine/stateDelta'
import { broadcastToRenderers } from './rendererBroadcast'
import { mirrorFactToCompanionStore } from './memory/companionFactStore'
import { withAgentContext } from './social/agents/withAgentContext'
import { agentIdFromSessionId } from './social/agents/agentPaths'
import {
  channelToInteractionSurface,
  type InteractionSurface
} from './memory/provenance'

const log = createLogger('postChatTurn')

function resolvePendingOwnerAndSurface(p: PendingChatTurn): {
  ownerAgentId: string
  interactionSurface: InteractionSurface
} {
  const ownerAgentId =
    p.ownerAgentId ?? agentIdFromSessionId(p.sessionId ?? 'default')
  const interactionSurface = channelToInteractionSurface(
    readPendingSurface(p),
    p.interactionSurface,
    ownerAgentId
  )
  return { ownerAgentId, interactionSurface }
}

/** skipLlm / 红线 / dispatch 短路：登记 pending 并 finalize（记忆 ingest + working memory） */
export async function registerAndFinalizeSkipTurn(args: {
  turnId: string
  dataRoot: string
  sessionId: string
  turnIndex: number
  userMsg: string
  assistantText: string
  newState: FullState
  prevState?: FullState
  trace: TurnTrace
  event: Event
  settings: AppSettings
  skipIngest?: boolean
  surface?: 'desktop' | 'weixin'
  interactionSurface?: InteractionSurface
  ownerAgentId?: string
}): Promise<void> {
  const {
    turnId,
    dataRoot,
    sessionId,
    turnIndex,
    userMsg,
    assistantText,
    newState,
    prevState,
    trace,
    event,
    settings,
    skipIngest = false,
  } = args

  const recent = workingMemory.getRecent(sessionId)
  const last = recent[recent.length - 1]
  if (!last || last.turnIndex !== turnIndex || last.userText !== userMsg) {
    workingMemory.push(sessionId, { turnIndex, userText: userMsg, assistantText: '' })
  }

  const surface = args.surface ?? 'desktop'
  const ownerAgentId = args.ownerAgentId ?? agentIdFromSessionId(sessionId)
  const interactionSurface = channelToInteractionSurface(
    surface,
    args.interactionSurface,
    ownerAgentId
  )

  setPendingTurn(turnId, {
    dataRoot,
    sessionId,
    turnId,
    turnIndex,
    userMsg,
    newState,
    prevState,
    skipIngest,
    trace,
    event,
    surface,
    interactionSurface,
    ownerAgentId,
  })

  await finalizeTurnAfterStream({ turnId, dataRoot, assistantText, settings })
}

const CORRECTION_TRIGGERS = [
  '搞错了', '不对', '不是这个', '我没说过', '你怎么会想到',
  '别乱说', '胡说', '瞎说', '莫名其妙', '跟这个有什么关系'
]

export async function finalizeTurnAfterStream(args: {
  turnId?: string
  dataRoot: string
  assistantText: string
  settings: AppSettings
}): Promise<void> {
  const { turnId, dataRoot, assistantText, settings } = args
  if (!turnId) return
  const p = takePendingTurn(turnId)
  if (!p) return

  finalizeChatTurn({
    dataRoot,
    sessionId: p.sessionId,
    turnId,
    userText: p.userMsg,
    assistantText,
    surface: readPendingSurface(p),
    deriveContext: {
      turnIndex: p.turnIndex,
      skipIngest: p.skipIngest,
      skipLlmExtraction: p.skipLlmExtraction,
      surface: readPendingSurface(p),
      ownerAgentId: p.ownerAgentId ?? agentIdFromSessionId(p.sessionId),
      l0Event: {
        type: p.event.type,
        intensity: p.event.intensity,
        sincerity: p.event.sincerity,
        isExtremeRedline: p.event.isExtremeRedline,
        isAdultContent: p.event.isAdultContent,
        adultSubtype: p.event.adultSubtype
      },
      prefetchedFacts: p.prefetchedFacts?.map((f) => ({
        domain: f.domain,
        subcategory: f.subcategory,
        subject: f.subject,
        summary: f.summary
      })),
      stateSnapshot: {
        relationship: p.newState.relationship as unknown as Record<string, unknown>,
        emotion: p.newState.emotion as unknown as Record<string, unknown>,
        totalTurns: p.newState.counters.totalTurns
      }
    }
  })

  try {
    const { ownerAgentId, interactionSurface } = resolvePendingOwnerAndSurface(p)
    const syncFactIds = await withAgentContext(
      ownerAgentId,
      () => finalizeTurnSyncPhase({ p, dataRoot, assistantText, settings, turnId }),
      { interactionSurface }
    )
    const { nudgeMemoryJobRunner } = await import('./memory/jobs/memoryJobRunnerRegistry.js')
    nudgeMemoryJobRunner(dataRoot)
  } finally {
    void triggerVoiceTtsAfterTurn({
      assistantText,
      emotionLabel: p.newState.emotion.primaryLabel,
      personalityPresetId: settings.personalityPresetId
    })
  }
}

async function finalizeTurnSyncPhase(args: {
  p: PendingChatTurn
  dataRoot: string
  assistantText: string
  settings: AppSettings
  turnId?: string
}): Promise<string[]> {
  const { p, dataRoot, assistantText, settings, turnId } = args

  const sid = p.sessionId ?? 'default'
  const recentExchanges = workingMemory.getRecent(sid)
  const lastExchange = recentExchanges[recentExchanges.length - 1]
  if (lastExchange && !lastExchange.assistantText) {
    lastExchange.assistantText = assistantText
  }

  saveState(dataRoot, p.newState, sid)
  const surface = readPendingSurface(p)

  if (p.prevState) {
    const stateDelta = buildTurnStateDelta(p.prevState, p.newState, p.event)
    broadcastToRenderers('chat:state-delta', { sessionId: sid, stateDelta })
  }

  if (surface === 'desktop' && settings.weixinMirrorEnabled !== false && turnId) {
    void mirrorAssistantToWeixin({
      dataRoot,
      text: assistantText,
      turnId,
      presetId: settings.personalityPresetId,
    })
  }

  const { lastActivatedAssociationIds } = await import('./memory/retriever')
  const assocIndex = getAssociationIndex(dataRoot)

  const eventType = p.trace?.l0?.type
  if ((eventType === 'cold' || eventType === 'hurtful') && lastActivatedAssociationIds.length > 0) {
    for (const assocId of lastActivatedAssociationIds) {
      assocIndex.weaken(assocId, 0.7)
    }
    log.info('implicit correction', { eventType, weakened: lastActivatedAssociationIds.length })
  }

  const isExplicitCorrection = CORRECTION_TRIGGERS.some(t => p.userMsg.includes(t))
  if (isExplicitCorrection && lastActivatedAssociationIds.length > 0) {
    for (const assocId of lastActivatedAssociationIds) {
      assocIndex.weaken(assocId, 0.3)
    }
    log.info('explicit correction', { userMsg: p.userMsg.slice(0, 50), weakened: lastActivatedAssociationIds.length })
  }

  const tierBSkip = resolveTierBIngestSkip({
    skipIngest: p.skipIngest,
    userMsg: p.userMsg,
    trace: p.trace,
  })
  if (tierBSkip) {
    return []
  }

  try {
    const store = new FactStore(defaultFactsPath(dataRoot))
    const kg = new KnowledgeGraph(defaultKgPath(dataRoot))
    kg.load()
    const adultPrivacyLevel = resolveAdultMemoryPrivacyLevel({
      adultMode: Boolean(settings.adultContentMode && settings.ageConfirmed18),
      eventType: p.event.type,
      adultSubtype: p.event.adultSubtype,
      userMsg: p.userMsg,
      assistantText
    })

    const syncFactIds = writeSyncLightFacts({
      dataRoot,
      sessionId: p.sessionId,
      turnIndex: p.turnIndex,
      userMsg: p.userMsg,
      l1: p.newState.relationship,
      l2: p.newState.emotion,
      store,
      kg,
      adultPrivacyLevel,
    })

    const uniqueSyncIds = [...new Set(syncFactIds)]
    if (uniqueSyncIds.length > 0) {
      store.load()
      const facts = store
        .listActive()
        .filter((f) => uniqueSyncIds.includes(f.id))
        .map((f) => ({ id: f.id, subcategory: f.subcategory }))

      await finalizeNewFacts({
        dataRoot,
        sessionId: p.sessionId,
        turnIndex: p.turnIndex,
        newFactIds: uniqueSyncIds,
        facts,
      })

      store.load()
      for (const id of uniqueSyncIds) {
        const fact = store.listActive().find((f) => f.id === id)
        if (fact) {
          mirrorFactToCompanionStore(dataRoot, fact, {
            channel: readPendingSurface(p),
            memorySide: fact.subcategory.includes('companion') ? 'ackem' : 'user',
            occurredAt: fact.occurredAt ?? fact.createdAt,
          })
        }
      }
    }

    return uniqueSyncIds
  } catch (e) {
    log.warn('sync light write failed', { error: String(e) })
    return []
  }
}

async function triggerVoiceTtsAfterTurn(args: {
  assistantText: string
  emotionLabel: string
  personalityPresetId?: string
}): Promise<void> {
  try {
    const { speakAssistantReplyIfVoiceActive } = await import(
      './extensions/plugins/builtin/tool/tts-voice/voiceManager'
    )
    await speakAssistantReplyIfVoiceActive(args)
  } catch (e) {
    log.warn('voice TTS after turn failed', { error: String(e) })
  }
}
