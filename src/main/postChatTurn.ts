import { saveState, loadState } from './engine/state-persistence'
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
import { getLastActivatedAssociationIds } from './memory/retriever'
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
    activatedAssociationIds: getLastActivatedAssociationIds()
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
  } catch (e) {
    // 落盘/记忆写入失败不再静默丢失：5 秒后重试一次，仍失败才放弃并告警
    log.error('finalize failed, will retry once', {
      turnId,
      error: e instanceof Error ? e.message : String(e)
    })
    setTimeout(() => {
      void finalizeTurnSyncPhase({ p, dataRoot, assistantText, settings })
        .then((syncFactIds) => {
          enqueueMemoryWrite({ pending: p, dataRoot, assistantText, settings, syncFactIds })
        })
        .catch((e2) => {
          log.error('finalize retry failed — turn state/memory write lost', {
            turnId,
            error: e2 instanceof Error ? e2.message : String(e2)
          })
        })
    }, 5000)
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
}): Promise<string[]> {
  const { p, dataRoot, assistantText, settings } = args

  const sid = p.sessionId ?? 'default'
  const recentExchanges = workingMemory.getRecent(sid)
  const lastExchange = recentExchanges[recentExchanges.length - 1]
  if (lastExchange && !lastExchange.assistantText) {
    lastExchange.assistantText = assistantText
  }

  // 流式期间可能有其它更新（桌面并发消息 / desire 操作）已落盘：以最新状态为准，
  // 避免用 turn 开始前的旧快照整包覆写造成回滚。
  const fresh = loadState(dataRoot, sid)
  if (fresh && fresh.lastActive > p.newState.lastActive) {
    saveState(dataRoot, fresh, sid)
  } else {
    saveState(dataRoot, p.newState, sid)
  }

  const activatedIds = p.activatedAssociationIds ?? []
  const assocIndex = getAssociationIndex(dataRoot)

  const eventType = p.trace?.l0?.type
  if ((eventType === 'cold' || eventType === 'hurtful') && activatedIds.length > 0) {
    for (const assocId of activatedIds) {
      assocIndex.weaken(assocId, 0.7)
    }
    log.info('implicit correction', { eventType, weakened: activatedIds.length })
  }

  const isExplicitCorrection = CORRECTION_TRIGGERS.some(t => p.userMsg.includes(t))
  if (isExplicitCorrection && activatedIds.length > 0) {
    for (const assocId of activatedIds) {
      assocIndex.weaken(assocId, 0.3)
    }
    log.info('explicit correction', { userMsg: p.userMsg.slice(0, 50), weakened: activatedIds.length })
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
