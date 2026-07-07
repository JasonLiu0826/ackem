import { saveState } from './engine/state-persistence'
import { FactStore, defaultFactsPath } from './memory/factStore'
import { KnowledgeGraph, defaultKgPath } from './memory/knowledgeGraph'
import { workingMemory } from './memory/workingMemory'
import type { AppSettings } from './settings'
import { setPendingTurn, takePendingTurn, type PendingChatTurn } from './turnPending'
import type { Event, FullState, TurnTrace } from './engine/types'
import { enqueueMemoryWrite } from './memory/memoryWriteJob'
import { writeSyncLightFacts } from './memory/syncLightWrite'
import { writeCompanionReplyLog } from './memory/companionReplyLog'
import { finalizeNewFacts } from './memory/finalizeNewFacts'
import { resolveTierBIngestSkip } from './memory/tierBIngestPolicy'
import { getAssociationIndex } from './engineCache'
import { createLogger } from './logger'
import { resolveAdultMemoryPrivacyLevel } from './prompt/adult-mode'

const log = createLogger('postChatTurn')

/** skipLlm / 红线 / dispatch 短路：登记 pending 并 finalize（记忆 ingest + working memory） */
export async function registerAndFinalizeSkipTurn(args: {
  turnId: string
  dataRoot: string
  sessionId: string
  turnIndex: number
  userMsg: string
  assistantText: string
  newState: FullState
  trace: TurnTrace
  event: Event
  settings: AppSettings
  skipIngest?: boolean
}): Promise<void> {
  const {
    turnId,
    dataRoot,
    sessionId,
    turnIndex,
    userMsg,
    assistantText,
    newState,
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

  setPendingTurn(turnId, {
    dataRoot,
    sessionId,
    turnIndex,
    userMsg,
    newState,
    skipIngest,
    trace,
    event,
  })

  void finalizeTurnAfterStream({ turnId, dataRoot, assistantText, settings })
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

  try {
    const syncFactIds = await finalizeTurnSyncPhase({ p, dataRoot, assistantText, settings })
    enqueueMemoryWrite({ pending: p, dataRoot, assistantText, settings, syncFactIds })
  } finally {
    void triggerVoiceTtsAfterTurn({
      assistantText,
      emotionLabel: p.newState.emotion.primaryLabel,
      personalityPresetId: settings.personalityPresetId
    })
    void triggerAutoImageAfterTurn({
      userMsg: p.userMsg,
      assistantText,
      dataRoot
    })
  }
}

async function finalizeTurnSyncPhase(args: {
  p: PendingChatTurn
  dataRoot: string
  assistantText: string
  settings: AppSettings
}): Promise<string[]> {
  const { p, dataRoot, assistantText, settings } = args

  const sid = p.sessionId ?? 'default'
  const recentExchanges = workingMemory.getRecent(sid)
  const lastExchange = recentExchanges[recentExchanges.length - 1]
  if (lastExchange && !lastExchange.assistantText) {
    lastExchange.assistantText = assistantText
  }

  saveState(dataRoot, p.newState, sid)

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

    const syncFactIds = [
      ...writeSyncLightFacts({
        dataRoot,
        sessionId: p.sessionId,
        turnIndex: p.turnIndex,
        userMsg: p.userMsg,
        l1: p.newState.relationship,
        l2: p.newState.emotion,
        store,
        kg,
        adultPrivacyLevel,
      }),
      ...writeCompanionReplyLog({
        dataRoot,
        sessionId: p.sessionId,
        turnIndex: p.turnIndex,
        userMsg: p.userMsg,
        assistantText,
        l1: p.newState.relationship,
        l2: p.newState.emotion,
        store,
        kg,
        adultPrivacyLevel,
      }),
    ]

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

async function triggerAutoImageAfterTurn(args: {
  userMsg: string
  assistantText: string
  dataRoot: string
}): Promise<void> {
  try {
    const { autoImageSkill } = await import(
      './extensions/skills/builtin/workflow/auto-image/skill'
    )
    const result = await autoImageSkill.execute({
      args: {
        userMsg: args.userMsg,
        assistantReply: args.assistantText,
        auto: true
      }
    })
    if (result.ok && result.data && !(result.data as any).skipped) {
      log.info('auto image generated', { path: (result.data as any).path })
    }
  } catch (e) {
    log.warn('auto image after turn failed', { error: String(e) })
  }
}
