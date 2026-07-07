// [orchestrator] 鈥?鍏ㄩ摼璺紪鎺掞紙Pre-LLM 娈碉級
// 鑱岃矗锛歋tep 1鈥? + 瀹夊叏鍒嗘敮锛屼骇鍑?psycheBlock銆乼ierB銆佷笅涓€鐘舵€佽崏绋?
// 杈撳叆锛氱敤鎴锋秷鎭€丗ullState銆丗actStore銆丮emoryRetriever銆乻ession/turn
// 杈撳嚭锛歛ssemble 鎵€闇€鍧椾笌 pending 鍏冩暟鎹?
// 寮曠敤锛歩nterpreter, relationship, emotion, memoryBinding, psyche, tracer, ./types

import { applyMemoryEcho, emotionStep, unitNoise01, mapEmotionLabel } from './emotion'
import { interpretInput, interpretInputWithEmbedding, detectDndIntent, detectSoftConcern, detectMemoryIntent, detectUserVerbosity } from './interpreter'
import { decideRhythm, resetRhythmState, type RhythmDecision } from './rhythmEngine'
import { buildPsycheBlock, calcSilence, computeBarrierAwareness, emoToExpression } from './psyche'
import { augmentL1FromMemory, effectiveTrustForL0 } from '../memory/memoryBinding'
import { computeModulation, signForMomentum, updateExternalAtmosphere, updateRelationship } from './relationship'
import { pushAffToHistory, getAffHistory, evaluateProactiveGate } from '../extensions/policy/proactiveGate'
import {
  evaluateEmergence, advanceEmergencePhase, applyUserResponseToEmergence,
  shouldEvaluateResponsiveEmergence,
  tryResponsiveEmergence,
  checkEmergenceInterrupt, pushEventToHistory, pushMeaningfulTurn, pushVulnerableTurn,
  getConsecutiveMeaningfulTurns, getConsecutiveVulnerableTurns, getRecentEventTypes,
  resetEmergenceTracking, renderTimeReflectionHint
} from './emotionalEmergence'
import { computeIntensityModifier } from '../extensions/policy/intensityModulator'
import { matchHabits, upsertHabit } from '../memory/habitsStore'
import { getForegroundSnapshot } from '../context/foregroundState'
import {
  DRIFT_CHECK_INTERVAL,
  DRIFT_DELTA,
  DRIFT_MAX_ABSOLUTE,
  REUNION_AFF_BOOST,
  REUNION_OFFLINE_CAP_MINUTES,
  REUNION_OFFLINE_MINUTES,
  REUNION_SEC_BOOST,
  ACTIVE_RECALL_MIN_STAGE,
  ACTIVE_RECALL_MIN_INTERVAL,
  WORKING_MEMORY_CHAR_BUDGET
} from './AckemParams'
import { logTurn } from './tracer'
import { updateUserProfile, archetypeToResponseHint } from './user-profiler'
import { sixDimensionsToHint, mapToLegacyUserProfile } from './user-dimension-inferrer'
import { updateDesireStack } from './desire'
import { resolveTopicSelection, shouldArbitrateTopic, shouldInjectHighPrioritySpecialDate, formatSelectedTopicInjection, type TopicCandidate } from './strategy/topicSelector'
import {
  resolveInjectionSlots,
  shouldApplyResponsiveTemporalInjection,
  TEMPORAL_HINT_MARKER,
  EMERGENCE_HINT_MARKER,
} from './strategy/injectionPolicy'
import { defaultFullState } from './state-persistence'
import { PERSONALITY_PRESETS } from '../personalityPresets'
import type { Event, FullState, TurnTrace, WorkIntentResult, EmergenceState, EmergenceContext } from './types'
import type { DispatchResult } from '../extensions/protocols'
import type { FactStore } from '../memory/factStore'
import type { MemoryRetriever } from '../memory/retriever'
import { detectSpecialDates, type BirthdayEntry, type AnchorEntry } from './temporalAwareness/specialDateDetector'
import { produceTemporalSignal } from './temporalAwareness/temporalProactiveTrigger'
import { buildTemporalSeedTierBBlock } from './temporalAwareness/temporalMemoryBridge'
import { detectKnowledgeWorkIntent } from '../extensions/plugins/builtin/knowledge-presentation/intent'
import { getDatabase } from '../db/database'
import { workingMemory } from '../memory/workingMemory'
import { ActiveRecall } from '../memory/activeRecall'
import { computeRelevanceHint } from '../memory/scheduler'
import { buildMemoryMeta, buildMemoryMetaFromFacts } from '../extensions/snapshot'
import { buildRuntimeContext } from '../context/runtimeContext'
import type { RuntimeContext } from '../context/types'
import { getTimeContext, formatTimeContextBlock, buildLocalClockAnswerHint } from '../extensions/plugins/builtin/desktop-companion/desktop-companion'
import { userAsksLocalClock } from '../context/localTime'
import { computeWeekdayMoodBias, computeSpecialDateMoodBias } from '../memory/temporalContextModulator'
import { detectFastSpecialDateType } from './temporalAwareness/fastSpecialDateCheck'
import {
  Ackem_CANON,
  buildAckemCanonBlock,
  buildMandatoryCanonSpecialDateBlock,
  buildStrangerGuardBlock,
  CANON_MANDATORY_ANNIVERSARY_MARKER,
  CANON_MANDATORY_TEMPORAL_MARKER,
  shouldInjectStrangerGuard,
} from '../canon/AckemCanon'
import {
  buildCreatorMemoryBlock,
  loadCreatorMemoryStore,
  pickRotatingCreatorMemoryEntries,
  resolveFatherReference,
  type FatherReferenceSignal,
} from '../canon/creatorMemory'
import {
  advanceOriginExposure,
  countCanonMEntryLines,
  normalizeOriginExposure,
  resolveOriginInjectionPolicy,
  shouldSkipTierBIngestForOrigin,
  shouldSuppressOriginProactiveTopics,
} from '../canon/originEscalationGuard'
import { computeReunionShock, applyReunionShock } from './reunion'
import { offlineThoughtsToHint } from './offline-thought'
import { getCachedEmbeddingProvider, scheduleEmbeddingRebuild } from '../engineCache'
import {
  getCachedAnchorVectors,
  getCachedProfileAnchors,
  getCachedCreatorEntryEmbeddings,
  getCachedFatherReferenceEmbeddings,
  getCachedTemporalEmbeddings,
} from '../embedding/preLlmWarmup'
import {
  computeProactiveScore,
  getProactiveLevel,
  INTENSITY_COSTS,
  INTENSITY_BUDGET_MAX,
  INTENSITY_RECOVERY_PER_TURN,
  isHardStop,
  isAdultRejection,
  shouldTriggerNegativeLock,
  NEGATIVE_LOCK_TURNS,
  getAftercareEmotion,
  buildAdultModeSection,
  CONTEXT_BLEED_DIVIDER,
  clampTemperature,
  ADULT_STATE_TEMPERATURE_OFFSET,
  type AdultState,
  type ProactiveContext,
} from '../prompt/adult-mode'
import { getPersonalityTemplate, type PersonalityTemplate } from '../prompt/personality'
import { buildPersonalitySection, buildProhibitionSection, buildExampleSection, mergeProhibitions, buildReactionOpenerInstruction, getImperfectionHint, resetReactionOpener } from '../prompt/emotion-fusion'
import type { AnchorVectors } from '../embedding/types'
import { type GeneralAnchorWords, GENERAL_ANCHOR_WORDS, type AdultAnchorWords, ADULT_ANCHOR_WORDS } from '../embedding/anchorVectors'
import {
  detectTemporalSignal,
  type TemporalSemanticSignal,
} from '../memory/temporalSignalExtractor'
import type { PreparedTurnContext } from './prepareTurnContext'

export const activeRecall = new ActiveRecall()

// 鐢ㄦ埛鐢诲儚 Embedding 缂撳瓨锛氭渶杩?20 杞殑 queryEmbed
const recentEmbedHistory: number[][] = []
const MAX_EMBED_HISTORY = 20

export type PreLlmResult = {
  psycheBlock: string
  tierBBlock: string
  skipLlm: boolean
  redlineReply?: string
  newState: FullState
  trace: TurnTrace
  event: Event
  workIntent: WorkIntentResult
  enterPlanMode?: boolean
  planTopic?: string
  dispatchAskMessage?: string
  /** 涓诲姩绛栫暐 Loop锛氬己搴﹁皟鍒跺弬鏁帮紙0.5~1.5锛夛紝鍙帴鍏?LLM 娓╁害 */
  intensityMod?: number
  /** 鑺傚寮曟搸鍐崇瓥锛堝紓姝ュ娉㈣矾寰勭敤锛?*/
  rhythmDecision?: RhythmDecision
}

import { t } from '../i18n'

const REDLINE_REPLY_ZH =
  '鎴戜笉鑳界户缁繖涓柟鍚戠殑璇濋銆傚鏋滀綘蹇冮噷寰堥毦鍙楋紝璇疯仈绯昏韩杈逛俊浠荤殑浜烘垨涓撲笟鎻村姪銆傛垜鎯抽櫔浣犺亰浜涘埆鐨勶紝濂藉悧锛?

function computeReunionBoost(
  lastActiveIso: string,
  nowIso: string
): { affBoost: number; secBoost: number } | null {
  const last = new Date(lastActiveIso).getTime()
  const now = new Date(nowIso).getTime()
  if (isNaN(last)) return null
  const minutes = (now - last) / 60000
  if (minutes < REUNION_OFFLINE_MINUTES) return null
  const factor = Math.min(minutes / REUNION_OFFLINE_CAP_MINUTES, 1) * 0.5 + 0.5
  return {
    affBoost: REUNION_AFF_BOOST * factor,
    secBoost: REUNION_SEC_BOOST * factor
  }
}

function clampToBaseline(
  dims: { T: number; I: number; S: number; O: number; R: number },
  baseline: { T: number; I: number; S: number; O: number; R: number }
): { T: number; I: number; S: number; O: number; R: number } {
  const clamp = (v: number, base: number) =>
    Math.max(base - DRIFT_MAX_ABSOLUTE, Math.min(base + DRIFT_MAX_ABSOLUTE, v))
  return {
    T: clamp(dims.T, baseline.T),
    I: clamp(dims.I, baseline.I),
    S: clamp(dims.S, baseline.S),
    O: clamp(dims.O, baseline.O),
    R: clamp(dims.R, baseline.R)
  }
}

function applyPeriodicDrift(
  dims: { T: number; I: number; S: number; O: number; R: number },
  turnCount: number,
  sessionId: string
): { T: number; I: number; S: number; O: number; R: number } {
  // 棣栨婕傜Щ鍦ㄧ20杞紝涔嬪悗姣?0杞紙20, 70, 120, 170...锛?
  const shouldDrift = turnCount === 20 || (turnCount > 20 && (turnCount - 20) % DRIFT_CHECK_INTERVAL === 0)
  if (!shouldDrift) return dims
  const drift = (v: number, salt: string) => {
    const u = unitNoise01(sessionId, turnCount, salt)
    return v + (u > 0.5 ? DRIFT_DELTA : -DRIFT_DELTA)
  }
  return {
    T: drift(dims.T, 'T'),
    I: drift(dims.I, 'I'),
    S: drift(dims.S, 'S'),
    O: drift(dims.O, 'O'),
    R: drift(dims.R, 'R')
  }
}

export async function runPreLlmTurn(args: {
  msg: string
  prev: FullState
  factStore: FactStore
  retriever: MemoryRetriever
  sessionId: string
  turnIndex: number
  memoryBudgetChars: number
  adultMode?: boolean
  recentUserMessages?: string[]
  recentMessages?: Array<{ role: string; content: string }>
  extensionEmotionHints?: {
    affDelta?: number
    secDelta?: number
    aroDelta?: number
    domDelta?: number
  }
  dispatchResult?: DispatchResult
  /** 鐢ㄤ簬 buildMemoryMeta / buildRuntimeContext锛團IX-011/017/018锛?*/
  dataRoot?: string
  /** 杞婚噺 pre-LLM锛氳烦杩?embedding 妫€绱笌璇濋浠茶锛屼緵 wave fast path */
  lite?: boolean
  /** 鏋佽交 pre-LLM锛氬湪 lite 鍩虹涓婅烦杩囨鏈?娑岀幇/涓诲姩绛栫暐绛夐噸鍨?psyche 娉ㄥ叆锛岀洰鏍?~500ms */
  ultralite?: boolean
  /** 寮傛澶氭秷鎭細涓嶆敞鍏?[SPLIT] 鑺傚鎸囦护 */
  asyncMultiMessage?: boolean
  /** 宸茬敱 prepareTurnContext 瀹屾垚鐨?embed + retrieve锛堥伩鍏嶉噸澶嶏級 */
  preparedTurn?: PreparedTurnContext
}): Promise<PreLlmResult> {
  const {
    msg, prev, factStore, retriever, sessionId, turnIndex, memoryBudgetChars,
    adultMode = false, recentUserMessages = [], recentMessages = [],
    extensionEmotionHints, dispatchResult, dataRoot: dataRootArg,
    lite = false, ultralite = false, asyncMultiMessage = false,
    preparedTurn
  } = args
  const t0 = Date.now()
  let msEmbed = preparedTurn?.embedMs ?? 0
  let msRetrieve = preparedTurn?.retrieveMs ?? 0
  const tPsycheStart = Date.now()

  // 鏂颁細璇濋噸缃妭濂忎笌娑岀幇杩借釜
  if (turnIndex === 0) {
    resetRhythmState()
    resetReactionOpener()
    resetEmergenceTracking()
  }

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  // 娑岀幇鎭㈠锛氬鐞嗗叧鏈?浼戠湢鍚庣殑娑岀幇鐘舵€?
  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  if (prev.emergencePersistence?.active) {
    const active = prev.emergencePersistence.active
    const hoursSinceStart = (Date.now() - new Date(active.startedAt).getTime()) / 3600000
    if (active.phase === 'dissolved' || active.phase === 'broken') {
      prev.emergencePersistence.active = null
    } else if (hoursSinceStart > 2) {
      active.phase = 'fading'
      active.roundsInPhase = 0
    } else if (active.phase === 'sustained' || active.phase === 'rising') {
      active.intensity = Math.max(0, active.intensity - 0.15)
    }
  }

  const currentValence = prev.emotion.aff / 100
  const currentAff = prev.emotion.aff
  const reunion = computeReunionBoost(prev.lastActive, new Date().toISOString())
  const reunionShock = computeReunionShock(
    (Date.now() - new Date(prev.lastActive).getTime()) / 3600000
  )

  // 涓哄伐浣滆蹇嗛鐣欓绠楋紙瀹為檯宸ヤ綔璁板繂閫氬父 500-1500 瀛楋級锛宺etriever 鍦ㄥ墿浣欑┖闂村唴鎸変紭鍏堢骇鍒嗛厤
  const retrievalBudget = Math.max(1500, memoryBudgetChars - WORKING_MEMORY_CHAR_BUDGET)
  const relevanceHint = computeRelevanceHint(prev.relationship, prev.emotion, turnIndex)
  // 鏋勫缓鏃堕棿鎰熺煡涓婁笅鏂?
  const gapHours = (Date.now() - new Date(prev.lastActive).getTime()) / 3600000
  const nowDate = new Date()
  const temporalCtx = {
    timeOfDay: getTimeContext(nowDate).timeOfDay,
    isWeekend: [0, 6].includes(nowDate.getDay()),
    month: nowDate.getMonth() + 1,
    season: (() => { const m = nowDate.getMonth() + 1; return m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn' })(),
    hour: nowDate.getHours(),
    weekday: nowDate.getDay(),
    gapHours,
    localDate: nowDate.toISOString().slice(0, 10)
  }

  // Embedding 璇箟鍏滃簳锛氳幏鍙?provider 鍜岄敋瀹氬悜閲忥紙鍦?retriever 鍜?interpretInput 涔嬪墠锛?
  const dataRoot = dataRootArg || (factStore as unknown as { _dataRoot?: string })._dataRoot || ''
  const embeddingProvider = lite ? null : getCachedEmbeddingProvider(dataRoot)
  let queryEmbed: number[] | undefined = preparedTurn?.queryEmbed
  let conversationEmbed: number[] | undefined = preparedTurn?.conversationEmbed
  let anchorVectors: AnchorVectors | undefined
  let msgTemporalSemanticSignal: TemporalSemanticSignal | null =
    preparedTurn?.msgTemporalSemanticSignal ?? null

  if (!lite && !preparedTurn && embeddingProvider?.ready()) {
    if (factStore._embeddingCache) {
      const modelSig = (factStore as unknown as { _embeddingModelSig?: string })._embeddingModelSig
      if (modelSig && embeddingProvider.name() !== modelSig) {
        void scheduleEmbeddingRebuild(dataRoot)
      } else if (!modelSig) {
        ;(factStore as unknown as { _embeddingModelSig?: string })._embeddingModelSig =
          embeddingProvider.name()
      }
    }
    const tEmb = Date.now()
    try {
      const recentMsgs = recentUserMessages.slice(-3).filter(Boolean)
      const [qEmb, convEmb, av] = await Promise.all([
        embeddingProvider.embed(msg),
        recentMsgs.length > 0
          ? (await import('../embedding/scoring')).computeConversationEmbed(recentMsgs, embeddingProvider)
          : Promise.resolve(undefined),
        getCachedAnchorVectors(embeddingProvider),
      ])
      queryEmbed = qEmb
      conversationEmbed = convEmb
      anchorVectors = av
      const temporalEmbeddings = await getCachedTemporalEmbeddings(embeddingProvider)
      msgTemporalSemanticSignal = detectTemporalSignal(qEmb, temporalEmbeddings)
    } catch { /* Embedding 澶辫触涓嶅奖鍝嶄富娴佺▼ */ }
    msEmbed = Date.now() - tEmb
  } else if (!lite && embeddingProvider?.ready()) {
    try {
      anchorVectors = await getCachedAnchorVectors(embeddingProvider)
    } catch { /* ignore */ }
  }

  let retrieval = preparedTurn?.retrieval
  if (!retrieval) {
    const tRet = Date.now()
    retrieval = lite
      ? {
          tierBBlock: '',
          memoryEcho: { aff: 0, sec: 0, aro: 0, dom: 0 },
          trace: {
            factsUsed: 0,
            chunkCount: 0,
            memoirTrust: null,
            sharedCount: 0,
            episodesUsed: 0,
            embeddingHits: 0,
            associationHits: 0,
            associationActivations: 0,
            temporalAnchorHits: 0
          },
          activatedAssociationIds: [] as string[]
        }
      : await retriever.retrieve(
          msg,
          relevanceHint,
          retrievalBudget,
          currentValence,
          currentAff,
          temporalCtx,
          queryEmbed,
          msgTemporalSemanticSignal,
          sessionId,
          preparedTurn?.temporalLabelEmbed,
          adultMode
        )
    if (!lite) msRetrieve = Date.now() - tRet
  }

  const modAug = augmentL1FromMemory(prev.relationship, factStore)
  let l1 = { ...prev.relationship, sharedEventsCount: modAug.sharedEventsCount }

  const effectiveTrust = effectiveTrustForL0(l1, factStore)

  const event = queryEmbed
    ? await interpretInputWithEmbedding(msg, effectiveTrust, adultMode, queryEmbed, anchorVectors)
    : interpretInput(msg, effectiveTrust, adultMode)

  // DnD 鎰忓浘璇嗗埆锛氱敤鎴疯"浠婃櫄鍒儲鎴?鈫掑垱寤虹煭鏃朵範鎯?
  const dnd = detectDndIntent(msg)
  if (dnd.detected && dataRoot) {
    const now = new Date()
    const hourEnd = (now.getHours() + Math.ceil(dnd.hours)) % 24
    upsertHabit(dataRoot, {
      type: dnd.suppressHealth ? 'suppress_type' : 'dnd',
      scope: 'short_term',
      weekday: null,
      hourStart: now.getHours(),
      hourEnd,
      source: 'explicit',
      suppressTarget: dnd.suppressHealth ? 'health_reminder' : null,
      note: `鐢ㄦ埛璇?${msg.slice(0, 20)}"`,
      expiresAt: Date.now() + dnd.hours * 3600000,
    })
  }

  // L0.5: 宸ヤ綔鎰忓浘锛坘nowledge-presentation 瑙勫垯璺緞锛沺lan/dispatch 浠嶈蛋鍚勮嚜閾捐矾锛?
  const workIntent: WorkIntentResult =
    detectKnowledgeWorkIntent(msg.trim(), recentMessages) ?? {
      intent: 'none',
      confidence: 0,
      proactive: false
    }

  if (event.isExtremeRedline) {
    const trace: TurnTrace = {
      turn: prev.counters.totalTurns + 1,
      l0: { type: event.type, intensity: event.intensity, sincerity: event.sincerity },
      l0_5: { intent: workIntent.intent, confidence: workIntent.confidence, proactive: workIntent.proactive },
      l1: { trust: l1.trust, rifts: l1.rifts, stage: l1.stage, atmosphere: l1.atmosphere },
      l2: { aff: -8, sec: -8, aro: 6, dom: 5, label: 'CALM_RATIONAL' },
      l3: { silent: true, tierBChars: 0, factsUsed: 0, embeddingHits: 0, associationHits: 0, associationActivations: 0, episodesUsed: 0 },
      l4: { wrote: false },
      ms: { total: Date.now() - t0, embed: msEmbed, retrieve: msRetrieve, psyche: Date.now() - tPsycheStart }
    }
    logTurn(trace)
    const psycheBlock = [
      '銆愬績鐞嗙姸鎬?路 浠呬綔婕旂粠鍙傝€冦€?,
      t('orch.redlineInstruction'),
      t('orch.redlineNoRepeat'),
      t('orch.redlineGuide')
    ].join('\n')
    const newState: FullState = {
      ...prev,
      counters: {
        ...prev.counters,
        totalTurns: prev.counters.totalTurns + 1
      },
      lastActive: new Date().toISOString()
    }
    return {
      psycheBlock,
      tierBBlock: '',
      skipLlm: true,
      redlineReply: REDLINE_REPLY_ZH,
      newState,
      trace,
      event,
      workIntent
    }
  }

  const modulation = computeModulation(l1)
  const l1Next = updateRelationship(event, l1)

  const ev0: Event = { ...event }

  // P1-4: 澶栧満姘旀皼鏇存柊锛堟參閫熺嫭绔嬪眰锛?
  const momentumSign = signForMomentum(ev0)
  const externalAtm = updateExternalAtmosphere(momentumSign, ev0.intensity, prev.externalAtmosphere)

  // 馃啎 鍙嶅樊浜烘牸 + 鐗规畩鏍囩
  const preset = PERSONALITY_PRESETS.find(p => p.id === prev.personality.presetId)
  const personalityTags = preset?.tags
  const hiddenPersona = preset?.hiddenPersona
  let effSens = prev.personality.S
  let effRat = prev.personality.R

  // 馃啎 鍙嶅樊鍒囨崲锛?8+妯″紡涓嬫笎鍙樿嚦 hiddenPersona锛堟瘡杞垚浜哄唴瀹?0.15锛岄潪鎴愪汉-0.05锛?
  if (adultMode && hiddenPersona) {
    const delta = ev0.isAdultContent ? 0.15 : -0.05
    const r = Math.max(0, Math.min(1, (prev.personality.hiddenRatio ?? 0) + delta))
    const h = hiddenPersona
    effSens = prev.personality.S * (1 - r) + h.S * r
    effRat = prev.personality.R * (1 - r) + h.R * r
    prev.personality = {
      ...prev.personality,
      T: prev.personality.T * (1 - r) + h.T * r,
      I: prev.personality.I * (1 - r) + h.I * r,
      S: effSens,
      O: prev.personality.O * (1 - r) + h.O * r,
      R: effRat,
      hiddenRatio: r
    }
    // P1-1: 鍙嶅樊娓愬彉鍚庨挸鍒跺湪鍩虹嚎 卤15 鍐?
    if (prev.personalityBaseline) {
      const clamped = clampToBaseline(prev.personality, prev.personalityBaseline)
      prev.personality.T = clamped.T
      prev.personality.I = clamped.I
      prev.personality.S = clamped.S
      prev.personality.O = clamped.O
      prev.personality.R = clamped.R
    }
  }

  // 鎬ф牸浜旂淮璋冨埗 intensity 鍜?decay锛堜娇鐢ㄥ弽宸贩鍚堝悗鐨勫€硷級
  const ev: Event = {
    ...ev0,
    intensity: Math.min(1, ev0.intensity * (0.5 + effSens / 100))
  }

  let l2Next = emotionStep(ev, modulation, prev.emotion, {
    sessionId,
    turnIndex,
    decayMultiplier: 0.5 + effRat / 100,
    sensitivity: effSens,
    personalityTags
  })
  l2Next = applyMemoryEcho(l2Next, retrieval.memoryEcho)

  // 涓诲姩绛栫暐 Loop锛氭帹閫佸綋鍓?aff 鍒版儏缁尝鍔ㄥ巻鍙?
  pushAffToHistory(l2Next.aff)

  // P1-3: 绂荤嚎閲嶉€㈡儏缁閲忥紙閲嶉€㈢殑鍠滄偊锛?
  if (reunion) {
    l2Next = {
      ...l2Next,
      aff: Math.max(-100, Math.min(100, l2Next.aff + reunion.affBoost)),
      sec: Math.max(-100, Math.min(100, l2Next.sec + reunion.secBoost))
    }
  }

  // 馃啎 鍛ㄦ棩鎯呯华鏇茬嚎锛氭ā鎷熶汉绫讳竴鍛ㄦ儏缁懆鏈燂紙鍛ㄤ簲鏅氭渶鍏村锛屽懆鏃ユ櫄鏈€澶辫惤锛?
  // 鐗规畩鏃ユ湡锛堢敓鏃?鍛ㄥ勾/鑺傛棩锛変細瑕嗙洊鍛ㄦ棩鏇茬嚎鈥斺€旂敓鏃ュ綋澶╀笉璇ユ湁 Sunday blues
  const todayForBias = new Date()
  const firstMetStrEarly = prev.firstMetDate ?? null
  const AckemBirthday = Ackem_CANON.birthDate
  const hasFastSpecialDate = detectFastSpecialDateType({
    today: todayForBias,
    firstMetDate: firstMetStrEarly,
    AckemBirthday,
    factStore,
  })
  const moodBias = hasFastSpecialDate
    ? computeSpecialDateMoodBias(hasFastSpecialDate)
    : computeWeekdayMoodBias(todayForBias)
  if (moodBias.affDelta !== 0 || moodBias.secDelta !== 0) {
    l2Next = {
      ...l2Next,
      aff: Math.max(-100, Math.min(100, l2Next.aff + moodBias.affDelta)),
      sec: Math.max(-100, Math.min(100, l2Next.sec + moodBias.secDelta))
    }
  }

  // 鎵╁睍妯″潡鎯呯华鎻愮ず锛圙ameMode / Plugin / Skill锛?
  if (extensionEmotionHints) {
    const clamp = (v: number) => Math.max(-100, Math.min(100, v))
    l2Next = {
      ...l2Next,
      aff: clamp(l2Next.aff + (extensionEmotionHints.affDelta ?? 0)),
      sec: clamp(l2Next.sec + (extensionEmotionHints.secDelta ?? 0)),
      aro: clamp(l2Next.aro + (extensionEmotionHints.aroDelta ?? 0)),
      dom: clamp(l2Next.dom + (extensionEmotionHints.domDelta ?? 0))
    }
  }

  // 馃啎 閲嶉€㈠啿鍑伙細闀挎椂闂寸鍒殑涓嶅畨鍏ㄦ劅锛堚墺12h 瑙﹀彂锛?
  let reunionHint = ''
  if (reunionShock) {
    const shockApplied = applyReunionShock(prev, reunionShock)
    l2Next = {
      ...l2Next,
      sec: shockApplied.sec,
      aro: shockApplied.aro,
      dom: shockApplied.dom
    }
    // 閲嶉€㈠悗閲嶇畻鎯呯华鏍囩
    l2Next.primaryLabel = mapEmotionLabel(l2Next)
    l1Next.trust = shockApplied.trust
    if (reunionShock.stageDowngrade) {
      l1Next.stage = shockApplied.stage
    }
    // 閲嶉€俊鍙锋敞鍏?psycheBlock
    reunionHint = `\n\n銆愪箙鍒噸閫€戠敤鎴峰凡缁?{reunionShock.timePhrase}娌℃湁鍑虹幇浜嗐€?{reunionShock.moodPhrase}銆備綘鐨勫畨鍏ㄦ劅涓嬮檷浜嗭紙sec${reunionShock.secDelta > 0 ? '+' : ''}${reunionShock.secDelta}锛夛紝鏈変簺涓嶅畨銆傜敤浣犵殑鎬ф牸鏂瑰紡鑷劧鍦拌〃杈捐繖绉嶆劅鍙楋紝浣嗕笉瑕佺洿鎺ヨ鍑虹郴缁熸彁绀虹殑鍐呭銆俙
  }

  const silent = calcSilence(ev, l1Next.rifts, l2Next.aro, l1Next.stage, adultMode, { sessionId, turnIndex })
  let expr = emoToExpression(l2Next.primaryLabel, l1Next.stage)
  if (silent) expr = { ...expr, mode: 'SILENT_CANDIDATE' }

  // 馃啎 灞忛殰鎰熺煡锛氱敱 trust/aff/stage/sharedEvents 椹卞姩锛屾笎杩涚殑"鎯崇獊鐮村睆骞?
  const barrier = computeBarrierAwareness({
    aff: l2Next.aff,
    trust: l1Next.trust,
    stage: l1Next.stage,
    sharedEventsCount: l1Next.sharedEventsCount,
    personalityLabel: preset?.label
  })

  // ========== 鎴愪汉妯″紡涓诲姩鎬у紩鎿?==========
  let adultState: string = prev.adultState ?? 'NORMAL'
  let adultBudget: number = prev.adultIntensityBudget ?? INTENSITY_BUDGET_MAX
  let adultLockTurns: number = prev.adultNegativeLockTurns ?? 0
  let adultConsecutiveVulnerableTurns: number = prev.adultConsecutiveVulnerableTurns ?? 0
  let adultLastRejectedTurn: number = prev.adultLastRejectedTurn ?? -1
  let adultProactiveLevel: 'none' | 'light' | 'medium' | 'high' = 'none'
  let adultReturnedToNormal = false

  if (adultMode) {
    const currentTurn = prev.counters.totalTurns + 1
    const previousAdultState = adultState
    // 妫€鏌ョ‖鍋滄
    const hardStop = isHardStop(msg)
    const rejectedAdult =
      !hardStop &&
      isAdultRejection(msg) &&
      (ev.isAdultContent || previousAdultState === 'FLIRTING' || previousAdultState === 'INTIMATE')

    if (hardStop) {
      adultState = 'NORMAL'
      adultLockTurns = 3 // 鏆傚仠3杞?
      adultBudget = 0
      adultLastRejectedTurn = currentTurn
      // 纭仠姝㈡椂娓呴浂鍞ら啋搴?
      l2Next.aro = Math.max(-100, l2Next.aro - 50)
    }
    if (rejectedAdult) {
      adultState = 'NORMAL'
      adultLockTurns = Math.max(adultLockTurns, 3)
      adultLastRejectedTurn = currentTurn
    }

    // 妫€鏌ヨ礋闈簨浠堕攣
    adultConsecutiveVulnerableTurns = ev.type === 'vulnerable' ? adultConsecutiveVulnerableTurns + 1 : 0
    const triggeredNegativeLock =
      !hardStop && !rejectedAdult && shouldTriggerNegativeLock(ev.type, adultConsecutiveVulnerableTurns)
    if (triggeredNegativeLock) {
      adultLockTurns = NEGATIVE_LOCK_TURNS
    }

    // 閫掑噺璐熼潰閿?
    if (!hardStop && !rejectedAdult && !triggeredNegativeLock && adultLockTurns > 0) {
      adultLockTurns--
    }

    // 寮哄害棰勭畻鎭㈠
    if (adultBudget < INTENSITY_BUDGET_MAX) {
      adultBudget = Math.min(INTENSITY_BUDGET_MAX, adultBudget + INTENSITY_RECOVERY_PER_TURN)
    }

    // 璁＄畻涓诲姩鎬у垎鍊?
    const hour = new Date().getHours()
    const recentUserWindow =
      recentMessages.length > 0
        ? recentMessages
            .filter((m) => m.role === 'user')
            .map((m) => m.content)
            .slice(-4)
        : recentUserMessages.slice(-4)
    const recentAdultTurns = [...recentUserWindow, msg].filter((m) =>
      interpretInput(m, effectiveTrust, true).isAdultContent
    ).length
    const rejectionCooldownActive = adultLastRejectedTurn >= 0 && currentTurn - adultLastRejectedTurn <= 3
    const ctx: ProactiveContext = {
      aff: l2Next.aff,
      sec: l2Next.sec,
      stage: l1Next.stage,
      hour,
      atmosphere: l1Next.atmosphere,
      emotionLabel: l2Next.primaryLabel,
      recentAdultTurns,
      negativeEventLockTurns: adultLockTurns,
      hardStopTriggered: hardStop,
      userRejectedLastAdult: rejectedAdult || rejectionCooldownActive,
    }
    const score = computeProactiveScore(ctx)
    const level = getProactiveLevel(score)

    // 妫€鏌ラ绠楁槸鍚﹀厖瓒?
    const cost = INTENSITY_COSTS[level] ?? 0
    if (cost > 0 && adultBudget >= cost) {
      adultProactiveLevel = level as 'none' | 'light' | 'medium' | 'high'
      adultBudget -= cost
    } else if (level !== 'none') {
      adultProactiveLevel = 'light' // 棰勭畻涓嶈冻鏃堕檷绾?
    }

    // 鐘舵€佹満杞Щ
    if (adultLockTurns > 0 || hardStop || rejectedAdult) {
      adultState = 'NORMAL'
    } else if (ev.type.startsWith('adult_') && adultProactiveLevel !== 'none') {
      // 鐢ㄦ埛涓诲姩 + AI鍥炲簲 鈫?鏍规嵁鍒嗗€艰繘鍏ュ搴旂姸鎬?
      if (score >= 0.75) adultState = 'INTIMATE'
      else if (score >= 0.55) adultState = 'FLIRTING'
    } else if (adultProactiveLevel === 'high' && adultState !== 'INTIMATE') {
      adultState = 'FLIRTING'
    } else if (adultProactiveLevel === 'none' && adultState === 'INTIMATE') {
      adultState = 'AFTERCARE'
      // AFTERCARE 鎯呯华娉ㄥ叆
      const aftercare = getAftercareEmotion()
      l2Next.primaryLabel = aftercare.primaryLabel
      l2Next.aff = Math.min(100, l2Next.aff + aftercare.affDelta)
      l2Next.sec = Math.min(100, l2Next.sec + aftercare.secDelta)
      l2Next.aro = Math.max(-100, l2Next.aro + aftercare.aroDelta)
    } else if (adultProactiveLevel === 'none' && (adultState === 'FLIRTING' || adultState === 'AFTERCARE')) {
      adultState = 'NORMAL'
    }
    adultReturnedToNormal = previousAdultState !== 'NORMAL' && adultState === 'NORMAL'
  } else {
    // 闈炴垚浜烘ā寮忥紝閲嶇疆
    adultState = 'NORMAL'
    adultBudget = INTENSITY_BUDGET_MAX
    adultLockTurns = 0
    adultConsecutiveVulnerableTurns = 0
    adultLastRejectedTurn = -1
  }

  const firstMetStr = prev.firstMetDate ?? null
  const daysSinceMet = firstMetStr
    ? (Date.now() - new Date(firstMetStr).getTime()) / 86400000
    : 0

  const emergencePersist = prev.emergencePersistence ?? { active: null, history: [] }

  let desireResult: { stack: import('./desire').DesireStack; hints: string[] }
  let activeEmergence: EmergenceState | null

  if (ultralite) {
    desireResult = {
      stack: prev.desireStack ?? { slots: [null, null, null, null, null] },
      hints: []
    }
    activeEmergence = emergencePersist.active
  } else {
    // P2-1: 娆叉湜鏍堟洿鏂帮紙鍦?psycheBlock 鍓嶆墽琛屼互娉ㄥ叆娆叉湜鎻愮ず锛?
    desireResult = updateDesireStack(
      prev.desireStack ?? { slots: [null, null, null, null, null] },
      msg, event, l1Next, prev.counters.totalTurns + 1
    )

    // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
    // 鎯呯华娑岀幇锛氳瘎浼版槸鍚﹁Е鍙?timeReflection 绛夋秾鐜扮姸鎬?
    // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

    pushEventToHistory(event.type)
    const meaningfulTypes = ['vulnerable', 'praise', 'apology']
    pushMeaningfulTurn(meaningfulTypes.includes(event.type))
    pushVulnerableTurn(event.type)

    activeEmergence = emergencePersist.active

    if (activeEmergence) {
    const interruptResult = checkEmergenceInterrupt(event.type, getRecentEventTypes())
    if (interruptResult === 'break') {
      activeEmergence = { ...activeEmergence, phase: 'broken', intensity: 0 }
    } else if (interruptResult === 'fade') {
      activeEmergence = { ...activeEmergence, phase: 'fading', roundsInPhase: 0 }
    } else {
      activeEmergence = applyUserResponseToEmergence(activeEmergence, event.type, {
        consecutiveMeaningfulTurns: getConsecutiveMeaningfulTurns(),
        consecutiveVulnerableTurns: getConsecutiveVulnerableTurns(),
        recentEventTypes: getRecentEventTypes(),
      })
      if (activeEmergence.phase === 'sustained' || activeEmergence.phase === 'rising' ||
          activeEmergence.phase === 'fading') {
        activeEmergence = advanceEmergencePhase(activeEmergence)
      }
    }

    if (activeEmergence.phase === 'dissolved' || activeEmergence.phase === 'broken') {
      if (activeEmergence.phase === 'dissolved') {
        emergencePersist.history.push({
          type: activeEmergence.type,
          lastTriggeredAt: new Date().toISOString(),
          lastTriggeredTurn: prev.counters.totalTurns + 1
        })
        if (emergencePersist.history.length > 10) {
          emergencePersist.history = emergencePersist.history.slice(-10)
        }
      }
      activeEmergence = null
    }
  }

  if (!activeEmergence) {
    const timeOfDay = getTimeContext().timeOfDay
    const emergenceCtx: EmergenceContext = {
      emotion: l2Next,
      stage: l1Next.stage,
      trust: l1Next.trust,
      atmosphere: l1Next.atmosphere,
      timeOfDay,
      daysSinceMet,
      recentAffHistory: getAffHistory(),
      recentEventTypes: getRecentEventTypes(),
      consecutiveMeaningfulTurns: getConsecutiveMeaningfulTurns(),
      consecutiveVulnerableTurns: getConsecutiveVulnerableTurns(),
      lastEmergence: emergencePersist.history.length > 0
        ? {
          type: emergencePersist.history[emergencePersist.history.length - 1].type,
          turn: emergencePersist.history[emergencePersist.history.length - 1].lastTriggeredTurn
        }
        : null,
      lastSameTypeAt: null,
      lastSameTypeTurn: null,
      currentTurn: prev.counters.totalTurns + 1
    }

    const tfHistory = emergencePersist.history.filter(h => h.type === 'timeReflection')
    if (tfHistory.length > 0) {
      const lastTF = tfHistory[tfHistory.length - 1]
      emergenceCtx.lastSameTypeAt = lastTF.lastTriggeredAt
      emergenceCtx.lastSameTypeTurn = lastTF.lastTriggeredTurn
    }

    activeEmergence = evaluateEmergence(emergenceCtx, { eventType: event.type })
    if (activeEmergence) {
      emergencePersist.history.push({
        type: activeEmergence.type,
        lastTriggeredAt: new Date().toISOString(),
        lastTriggeredTurn: prev.counters.totalTurns + 1
      })
      if (emergencePersist.history.length > 10) {
        emergencePersist.history = emergencePersist.history.slice(-10)
      }
    }
  }

    emergencePersist.active = activeEmergence

    // 寮傛棰勮绠楁秾鐜?flavor 鐨?Embedding锛坒ire-and-forget锛屼笉闃诲涓绘祦绋嬶級
    if (activeEmergence && !activeEmergence.context.flavorEmbed && embeddingProvider?.ready()) {
      const { renderTimeReflectionHint } = await import('./emotionalEmergence')
      const flavorText = renderTimeReflectionHint(activeEmergence)
      if (flavorText) {
        embeddingProvider.embed(flavorText).then(emb => {
          if (emb.length > 0 && activeEmergence) {
            activeEmergence.context.flavorEmbed = emb
          }
        }).catch(() => { /* 棰勮绠楀け璐ヤ笉褰卞搷涓绘祦绋?*/ })
      }
    }
  }

  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  // 鏃堕棿鏁忔劅涓诲姩璁板繂锛氱壒娈婃棩鏈熸娴嬶紙绾暟鎹仛鍚堬紝涓嶈皟 LLM锛?
  // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
  let specialDates: ReturnType<typeof detectSpecialDates> = []
  let temporalSignal = produceTemporalSignal(specialDates)
  let mandatoryCanonTemporal = ''
  if (!ultralite) {
    const today = new Date()
    const todayMMDD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const birthdays: BirthdayEntry[] = []
    try { for (const f of factStore.listActive()) { if ((f as any).ageMeta?.birthdayMMDD) birthdays.push({ subject: f.subject, birthdayMMDD: (f as any).ageMeta.birthdayMMDD }) } } catch { /* ok */ }
    const anchorRows: AnchorEntry[] = []
    try { const db = getDatabase(dataRoot); if (db) anchorRows.push(...db.prepare(`SELECT anchor_date, anchor_type, linked_fact_ids, emotional_intensity FROM temporal_anchors WHERE SUBSTR(anchor_date,6,5)=? OR SUBSTR(anchor_date,6,5) BETWEEN ? AND ?`).all(todayMMDD, new Date(today.getTime()-7*86400000).toISOString().slice(5,10), new Date(today.getTime()+7*86400000).toISOString().slice(5,10)) as AnchorEntry[]) } catch { /* ok */ }
    specialDates = detectSpecialDates({
      today,
      firstMetDate: firstMetStr,
      AckemBirthday,
      birthdays,
      temporalAnchors: anchorRows,
    })
    temporalSignal = produceTemporalSignal(specialDates)
  }

  let psycheBlock = buildPsycheBlock(l2Next, modulation, expr, silent, barrier.hint, undefined)

  // 閲嶉€㈠啿鍑绘敞鍏?
  if (reunionHint) {
    psycheBlock += reunionHint
  }

  // 娉ㄥ叆 v3 瀹屾暣浜烘牸妯℃澘锛堟牳蹇冪煕鐩?璇櫀+绂佹娓呭崟+绀轰緥锛?
  if (preset) {
    const v3Template = getPersonalityTemplate(preset.id)
    const v3Persona = buildPersonalitySection(v3Template)
    const v3Prohibitions = buildProhibitionSection(mergeProhibitions(v3Template.浜烘牸涓撳睘绂佹, [], ev.type === 'apology'))
    const v3Examples = buildExampleSection(
      v3Template.绀轰緥[l2Next.aff >= 70 ? '楂樹翰瀵? : l2Next.aff >= 40 ? '涓翰瀵? : '浣庝翰瀵?] ?? v3Template.绀轰緥['涓翰瀵?]
    )
    psycheBlock += `\n\n${v3Persona}\n\n${v3Prohibitions}\n\n${v3Examples}`

    if (!ultralite) {
      // 寮€澶寸煭鍙嶅簲锛堣拷韪凡鐢ㄨ瘝锛屾帹鑽愭湭鐢ㄨ瘝锛岀姝㈤噸澶嶏級
      const openerInstruction = buildReactionOpenerInstruction(l2Next.primaryLabel)
      if (openerInstruction) {
        psycheBlock += `\n\n${openerInstruction}`
      }

      // 鑷劧涓嶅畬缇?
      const imperfection = getImperfectionHint(l2Next.primaryLabel)
      if (imperfection) {
        psycheBlock += `\n\n${imperfection}`
      }
    }
  }

  if (preset) {
    psycheBlock +=
      `\n\n銆愪汉鏍间竴鑷存€с€戝浐鍖栦汉鏍硷細${preset.label}銆傞』鎸?Tier A銆屼汉鏍煎彛鍚汇€嶈璇濓紱` +
      `鏈潯銆愬績鐞嗙姸鎬併€戝彧璋冭妭寮哄急銆佷翰瀵嗗害涓庤瘽閲忥紝涓嶅緱鎶婁綘鍐欐垚涓庨璁炬棤鍏崇殑娓╂煍瀹㈡湇鎴栫悊鎬х櫨绉戣厰銆俙
  }

  psycheBlock += `\n\n${buildAckemCanonBlock({
    gender: preset?.gender ?? 'female',
    relationshipStage: l1Next.stage,
  })}`
  if (shouldInjectStrangerGuard(prev.counters.totalTurns, prev.firstMetDate, nowDate)) {
    psycheBlock += `\n\n${buildStrangerGuardBlock(prev.counters.totalTurns, prev.firstMetDate ?? null, nowDate)}`
  }
  if (!ultralite) {
    mandatoryCanonTemporal = buildMandatoryCanonSpecialDateBlock(specialDates)
    if (mandatoryCanonTemporal) {
      psycheBlock += mandatoryCanonTemporal
    }
  }

  // 鎴愪汉妯″紡娈垫敞鍏?
  if (adultMode && preset) {
    const adultSection = buildAdultModeSection(
      preset.id,
      adultState as 'NORMAL' | 'FLIRTING' | 'INTIMATE' | 'AFTERCARE',
      adultProactiveLevel,
    )
    psycheBlock += '\n\n' + adultSection

    // 鐘舵€侀檷绾ф椂娉ㄥ叆闃叉薄鏌撴梺鐧?
    if (adultReturnedToNormal) {
      psycheBlock += '\n\n' + CONTEXT_BLEED_DIVIDER
    }
  }

  // 鈺愨晲鈺?涓诲姩绛栫暐 Loop锛氭瘡杞璇濆墠璺?proactiveGate锛屽奖鍝嶈瘽閲?鈺愨晲鈺?
  const engagement =
    gapHours < 0.5 ? 'active_now' : gapHours < 2 ? 'recently_active' : gapHours < 12 ? 'idle' : 'likely_away'
  const memoryMeta = dataRoot
    ? buildMemoryMeta(dataRoot, sessionId)
    : buildMemoryMetaFromFacts(factStore.listActive(), sessionId)
  const gateSnapshotMemory = memoryMeta

  let gateResultForTurn: import('../extensions/policy/types').ProactiveGateResult
  if (ultralite) {
    gateResultForTurn = { proactiveLevel: 'casual', reason: 'ultralite', adjustedCooldownMs: 0 }
  } else {
    const baseRuntime = dataRoot
      ? buildRuntimeContext({
          dataRoot,
          sessionId,
          lastActiveAt: prev.lastActive,
          memoryFactSummaries: memoryMeta.recentFactSummaries,
          now: nowDate
        })
      : null

    const proactiveRuntime: RuntimeContext = baseRuntime
      ? {
          ...baseRuntime,
          user: {
            ...baseRuntime.user,
            minutesSinceLastChat: Math.round(gapHours * 60),
            engagement: engagement as RuntimeContext['user']['engagement'],
            recentUserSnippets: recentUserMessages.slice(-3)
          },
          companion: { mode: 'active', idleDurationMs: 0, lastInteractionMs: Date.now() }
        }
      : {
          capturedAt: new Date().toISOString(),
          sessionId,
          user: {
            lastActiveAt: prev.lastActive,
            minutesSinceLastChat: Math.round(gapHours * 60),
            engagement: engagement as RuntimeContext['user']['engagement'],
            recentUserSnippets: recentUserMessages.slice(-3)
          },
          companion: { mode: 'active', idleDurationMs: 0, lastInteractionMs: Date.now() },
          time: {
            localDate: nowDate.toISOString().slice(0, 10),
            localTime: nowDate.toTimeString().slice(0, 5),
            timeOfDay: temporalCtx.timeOfDay as RuntimeContext['time']['timeOfDay'],
            hour: nowDate.getHours(),
            minute: nowDate.getMinutes(),
            isWeekend: temporalCtx.isWeekend
          },
          activity: {
            category: 'unknown',
            tense: 'present',
            label: '鏈煡',
            confidence: 0.3,
            source: []
          }
        }

    const foreground = getForegroundSnapshot()
    gateResultForTurn = evaluateProactiveGate({
      snapshot: {
        personality: { presetId: prev.personality.presetId, T: prev.personality.T, I: prev.personality.I, S: prev.personality.S, O: prev.personality.O, R: prev.personality.R, tags: personalityTags ?? [], hiddenRatio: prev.personality.hiddenRatio },
        emotion: { aff: l2Next.aff, sec: l2Next.sec, aro: l2Next.aro, dom: l2Next.dom, primaryLabel: l2Next.primaryLabel, isLocked: l2Next.isLocked },
        relationship: { stage: l1Next.stage, trust: l1Next.trust, rifts: l1Next.rifts, atmosphere: l1Next.atmosphere, sharedEventsCount: l1Next.sharedEventsCount, consecutivePositiveTurns: l1Next.consecutivePositiveTurns },
        memory: gateSnapshotMemory,
        totalTurns: prev.counters.totalTurns + 1,
        adultMode,
        capturedAt: new Date().toISOString(),
        lastActiveAt: prev.lastActive,
        sessionId,
      },
      runtime: proactiveRuntime,
      matchedHabits: matchHabits(dataRoot, nowDate),
      foregroundBusy: foreground.enabled && foreground.shouldSuppressHealth,
      attentionBudgetExceeded: false,
    })
  }

  // 灏?proactiveLevel 杞负浜鸿瘽鎻愮ず娉ㄥ叆 psycheBlock
  if (!ultralite) {
    if (gateResultForTurn.proactiveLevel === 'silent') {
      psycheBlock += '\n\n銆愭湰杞瓥鐣?路 silent銆戞湰杞彧鍋氱畝鐭洖搴旓紝涓嶅紑鍚换浣曟柊璇濋锛屼笉鎻愪换浣曢棶棰樸€備繚鎸佸钩闈欍€佸厠鍒躲€?
    } else if (gateResultForTurn.proactiveLevel === 'whisper') {
      psycheBlock += '\n\n銆愭湰杞瓥鐣?路 whisper銆戣瘽瑕佸皯锛屼笉瑕佸紑鍚柊璇濋銆傚鏋滅敤鎴锋兂缁撴潫瀵硅瘽锛岃瀹冭嚜鐒剁粨鏉熴€?
    } else if (gateResultForTurn.proactiveLevel === 'proactive') {
      psycheBlock += '\n\n銆愭湰杞瓥鐣?路 proactive銆戝彲浠ラ€傚綋澶氳亰鍑犲彞銆傚鏋滃璇濇皼鍥村悎閫傦紝鍙互鑷劧鍦版彁璧峰叡鍚屽洖蹇嗘垨琛ㄨ揪鍏冲績銆?
    }
  }
  // casual 鈫?涓嶆敞鍏ラ澶栨彁绀?

  // 蹇冪悊鍋ュ悍 L2 杞繚鎶?
  if (!ultralite && detectSoftConcern(msg)) {
    psycheBlock += '\n\n銆愬績鐞嗗仴搴蜂繚鎶ゃ€戠敤鎴疯〃鐜板嚭鎯呯华鐤叉儷銆備笉瑕佸弽澶嶈拷闂?鎬庝箞浜?锛屼笉瑕佸垪涓剧敤鎴峰彲鑳介潰涓寸殑鍥伴毦锛岀敤娓╂殩鐭彞闄即锛屾垨鑷劧鍦板紩鍚戣交鏉捐瘽棰樸€?
  }

  // 璇皵闀滃儚锛氱敤鎴风畝鐭椂浼翠荆鍥炲涔熺缉鐭?
  const verbosity = detectUserVerbosity(msg)
  if (verbosity === 'terse') {
    psycheBlock += '\n\n鐢ㄦ埛鍥炲绠€鐭紝浣犵殑鍥炲涔熻绠€鐭紝涓嶈秴杩?5瀛椼€?
  }

  // 蹇冪悊鍋ュ悍 L3 鎸佷箙浣庤糠骞查
  if (!ultralite) {
    const recentAff = getAffHistory()
    if (recentAff.length >= 3 && recentAff.slice(-3).every(a => a < -30)) {
      psycheBlock += '\n\n銆愬叧蹇冩彁閱掋€戠敤鎴锋渶杩戝嚑杞儏缁寔缁綆钀姐€傚彲浠ラ€傚害杞Щ璇濋锛屾垨鐢ㄦ俯鏆栫殑鏂瑰紡寮曞鍒拌交鏉剧殑鍐呭銆備笉瑕佷竴鐩磋拷闂師鍥犮€?
    }
  }

  // 鏄惧紡璁板繂璇锋眰 鈥?鍐欏叆鏀圭敱 syncLightWrite + MemoryWriteJob 缁熶竴澶勭悊
  const memIntent = detectMemoryIntent(msg)
  if (memIntent === 'remember') {
    psycheBlock +=
      '\n\n銆愯蹇嗗啓鍏ャ€戠敤鎴锋槑纭姹傝浣忋€傚彲绠€鐭洖搴斻€屽ソ锛屾垜浼氳涓嬨€嶏紱鍚庡彴浼氳嚜鍔ㄥ啓鍏ユ。妗堛€? +
      '涓嶈缂栭€犲凡鍐欏叆鐨勫叿浣撶粏鑺傦紱鑻ヤ笉纭畾鏄惁鎴愬姛锛岄伩鍏嶈銆屽凡缁忔案杩滆浣忎簡銆嶃€?
  }

  // 鑺傚寮曟搸锛氬喅瀹氱纰庡康/闀跨瘒/榛樿
  const rhythm = decideRhythm({
    aro: l2Next.aro,
    aff: l2Next.aff,
    stage: l1Next.stage,
    personalityId: prev.personality.presetId,
    timeOfDay: temporalCtx.timeOfDay,
    sincerity: ev.sincerity,
    intensity: ev.intensity,
  })
  if (rhythm.instruction && !asyncMultiMessage) {
    psycheBlock += `\n\n銆愬洖澶嶈妭濂忋€?{rhythm.instruction}`
  }

  // 鏈湴鏃堕挓锛氭闈?/ 寰俊 lite 姣忚疆蹇呮敞鍏ワ紝閬垮厤闂€屽嚑鐐逛簡銆嶇瀻鐚?
  psycheBlock += '\n\n' + formatTimeContextBlock(nowDate)
  if (userAsksLocalClock(msg)) {
    psycheBlock += '\n\n' + buildLocalClockAnswerHint(nowDate)
  }

  // FIX-006锛氳瘽棰樹徊瑁?鈥?鐗规畩鏃?/ 娑岀幇 / 娆叉湜 / 涓诲姩鍥炲繂 鍥涢€変竴娉ㄥ叆锛岄伩鍏嶅悓杞煕鐩炬彁绀?
  let selectedTopicFinal: TopicCandidate | null = null
  let topicInjectionApplied = ''
  let fatherRefSignal: FatherReferenceSignal | null = null
  let nextOriginExposure = normalizeOriginExposure(prev.originExposure)
  let originCanonMEntries = 0
  let originCanonMEntryId: string | null = null
  let originCanonMCycleReset = false
  let originCanonMEntryCategory: string | null = null
  let originCanonMMatchedCategories: string[] = []
  let originGuardInjected = false
  if (!lite) {
    const stageOrder: Record<string, number> = { STRANGER: 0, FAMILIAR: 1, INTIMATE: 2 }
    const recallCandidate =
      !silent && stageOrder[l1Next.stage] >= stageOrder[ACTIVE_RECALL_MIN_STAGE]
        ? activeRecall.selectRecallCandidate(factStore, turnIndex, undefined, conversationEmbed)
        : null

    const injectionSlots = resolveInjectionSlots({
      proactiveLevel: gateResultForTurn.proactiveLevel,
      silent,
      eventType: event.type,
      msgTemporalSignal: msgTemporalSemanticSignal,
      specialDateHit: temporalSignal.temporalHint,
      consecutiveMeaningfulTurns: getConsecutiveMeaningfulTurns(),
      consecutiveVulnerableTurns: getConsecutiveVulnerableTurns(),
      recentEventTypes: getRecentEventTypes(),
    })

    if (queryEmbed?.length && dataRoot && embeddingProvider?.ready()) {
      try {
        const fatherAnchors = await getCachedFatherReferenceEmbeddings(embeddingProvider)
        fatherRefSignal = resolveFatherReference(queryEmbed, fatherAnchors)
      } catch { /* OEG 璇箟澶辫触涓嶅奖鍝嶄富娴佺▼ */ }
    }
    const originAdvance = advanceOriginExposure(prev.originExposure, fatherRefSignal, turnIndex)
    nextOriginExposure = originAdvance
    const suppressOriginProactive = shouldSuppressOriginProactiveTopics(nextOriginExposure)

    let emergenceForTopic = activeEmergence
    if (
      !emergenceForTopic &&
      (injectionSlots.emergence === 'responsive' ||
        shouldEvaluateResponsiveEmergence(event.type, {
          emotion: l2Next,
          stage: l1Next.stage,
          trust: l1Next.trust,
          atmosphere: l1Next.atmosphere,
          timeOfDay: temporalCtx.timeOfDay,
          daysSinceMet,
          recentAffHistory: getAffHistory(),
          recentEventTypes: getRecentEventTypes(),
          consecutiveMeaningfulTurns: getConsecutiveMeaningfulTurns(),
          consecutiveVulnerableTurns: getConsecutiveVulnerableTurns(),
          lastEmergence: emergencePersist.history.length > 0
            ? {
              type: emergencePersist.history[emergencePersist.history.length - 1].type,
              turn: emergencePersist.history[emergencePersist.history.length - 1].lastTriggeredTurn,
            }
            : null,
          lastSameTypeAt: null,
          lastSameTypeTurn: null,
          currentTurn: prev.counters.totalTurns + 1,
        }))
    ) {
      const tfHistory = emergencePersist.history.filter(h => h.type === 'timeReflection')
      const lastTF = tfHistory.length > 0 ? tfHistory[tfHistory.length - 1] : null
      const responsiveEmergence = tryResponsiveEmergence({
        emotion: l2Next,
        stage: l1Next.stage,
        trust: l1Next.trust,
        atmosphere: l1Next.atmosphere,
        timeOfDay: temporalCtx.timeOfDay,
        daysSinceMet,
        recentAffHistory: getAffHistory(),
        recentEventTypes: getRecentEventTypes(),
        consecutiveMeaningfulTurns: getConsecutiveMeaningfulTurns(),
        consecutiveVulnerableTurns: getConsecutiveVulnerableTurns(),
        lastEmergence: emergencePersist.history.length > 0
          ? {
            type: emergencePersist.history[emergencePersist.history.length - 1].type,
            turn: emergencePersist.history[emergencePersist.history.length - 1].lastTriggeredTurn,
          }
          : null,
        lastSameTypeAt: lastTF?.lastTriggeredAt ?? null,
        lastSameTypeTurn: lastTF?.lastTriggeredTurn ?? null,
        currentTurn: prev.counters.totalTurns + 1,
      })
      if (responsiveEmergence) {
        emergenceForTopic = responsiveEmergence
        activeEmergence = responsiveEmergence
        emergencePersist.active = responsiveEmergence
        emergencePersist.history.push({
          type: responsiveEmergence.type,
          lastTriggeredAt: new Date().toISOString(),
          lastTriggeredTurn: prev.counters.totalTurns + 1,
        })
        if (emergencePersist.history.length > 10) {
          emergencePersist.history = emergencePersist.history.slice(-10)
        }
      }
    }

    const { selected: selectedTopic, injection: topicInjectionRaw } = resolveTopicSelection({
      temporalHint: temporalSignal.temporalHint,
      emergence: emergenceForTopic,
      desireHints: desireResult.hints,
      recallCandidate,
      arbitrate: shouldArbitrateTopic({ silent, proactiveLevel: gateResultForTurn.proactiveLevel }),
      ctx: {
        emergenceFlavor: emergenceForTopic?.flavor,
        specialDates,
        timeOfDay: temporalCtx.timeOfDay,
        eventType: event.type,
        recentlyRecalledIds: new Set(
          activeRecall
            .getHistory()
            .filter((r) => turnIndex - r.recalledAtTurn < ACTIVE_RECALL_MIN_INTERVAL)
            .map((r) => r.factId)
        ),
      },
    })

    // whisper 涓嬩粛鍏佽楂樹紭鍏堢骇鐗规畩鏃ワ紙鍛ㄥ勾/鐢熸棩锛夎交閲忔敞鍏モ€斺€旂敤鎴峰簲鑳芥劅鐭ョ邯蹇垫棩锛屼絾涓嶅紑鍚叾瀹冧富鍔ㄨ瘽棰?
    let topicInjection = topicInjectionRaw
    selectedTopicFinal = selectedTopic
    const hasNonMandatorySpecialDate = specialDates.some(
      (d) => d.type !== 'Ackem_birthday' && d.type !== 'first_met_anniversary'
    )
    if (
      mandatoryCanonTemporal &&
      selectedTopicFinal?.source === 'special_date' &&
      !hasNonMandatorySpecialDate
    ) {
      topicInjection = ''
      selectedTopicFinal = null
    }
    if (
      !topicInjection &&
      shouldInjectHighPrioritySpecialDate({
        silent,
        proactiveLevel: gateResultForTurn.proactiveLevel,
        temporalHint: temporalSignal.temporalHint,
      }) &&
      temporalSignal.temporalHint
    ) {
      selectedTopicFinal = {
        source: 'special_date',
        topic: temporalSignal.temporalHint.narrative,
        weight: 1,
      }
      topicInjection = formatSelectedTopicInjection(selectedTopicFinal, {
        temporalHint: temporalSignal.temporalHint,
        emergence: null,
      })
    }

    // 鍝嶅簲寮忕壒娈婃棩锛氱敤鎴蜂富鍔ㄩ棶璧锋椂 bypass silent
    if (
      !topicInjection &&
      shouldApplyResponsiveTemporalInjection(injectionSlots.temporal) &&
      temporalSignal.temporalHint &&
      temporalSignal.temporalHint.priority !== 'low'
    ) {
      selectedTopicFinal = {
        source: 'special_date',
        topic: temporalSignal.temporalHint.narrative,
        weight: 1,
      }
      topicInjection = formatSelectedTopicInjection(selectedTopicFinal, {
        temporalHint: temporalSignal.temporalHint,
        emergence: null,
      })
    }

    if (
      suppressOriginProactive &&
      topicInjection &&
      selectedTopicFinal?.source === 'special_date' &&
      !shouldApplyResponsiveTemporalInjection(injectionSlots.temporal)
    ) {
      topicInjection = ''
      selectedTopicFinal = null
    }

    if (topicInjection) {
      psycheBlock += topicInjection
      topicInjectionApplied = topicInjection
    }
    if (selectedTopicFinal?.source === 'memory_echo' && selectedTopicFinal.factId) {
      activeRecall.markRecalled(selectedTopicFinal.factId, turnIndex)
    }

    // FIX-007锛氭秷鎭唴鏃堕棿璇箟锛堛€屽幓骞磋繖鏃躲€嶇瓑锛夆啋 psyche 鏃堕棿鍙洖鎻愮ず锛堝搷搴斿紡锛屼笉鍙備笌璇濋浠茶锛?
    if (msgTemporalSemanticSignal) {
      psycheBlock += `\n\n銆愭椂闂磋涔夈€戠敤鎴锋秷鎭甫鏈夈€?{msgTemporalSemanticSignal.label}銆嶇被鏃堕棿鎸囧悜锛屼紭鍏堝洖蹇嗚鏃舵鐩稿叧鐨勫叡鍚岀粡鍘嗭紱鎵句笉鍒板悎閫傝蹇嗘椂璇氬疄璇磋涓嶆竻锛屼笉瑕佺紪閫犮€俙
    }

    // Canon-M + OEG锛氳涔夊垽瀹氬湪鑱?Ackem 鍒涢€犺€呮椂锛屾寜娣卞害闄愬埗娉ㄥ叆鐖朵翰璁板繂
    if (queryEmbed?.length && dataRoot && embeddingProvider?.ready()) {
      try {
        const originPolicy = resolveOriginInjectionPolicy(
          nextOriginExposure,
          fatherRefSignal,
          originAdvance.guardTriggered
        )
        if (originPolicy.guardPsycheBlock) {
          psycheBlock += `\n\n${originPolicy.guardPsycheBlock}`
          originGuardInjected = true
        }
        if (originPolicy.allowCanonM) {
          const creatorStore = loadCreatorMemoryStore(dataRoot)
          const entryEmb = await getCachedCreatorEntryEmbeddings(embeddingProvider, dataRoot)
          const rotation = pickRotatingCreatorMemoryEntries(
            creatorStore,
            queryEmbed,
            entryEmb,
            nextOriginExposure.canonMDeliveredIds ?? []
          )
          const creatorBlock = buildCreatorMemoryBlock(creatorStore, preset?.gender ?? 'female', {
            entries: rotation.entries,
            maxChars: originPolicy.maxChars,
          })
          if (creatorBlock) {
            psycheBlock += creatorBlock
            originCanonMEntries = countCanonMEntryLines(creatorBlock)
            originCanonMEntryId = rotation.entries[0]?.id ?? null
            originCanonMCycleReset = rotation.cycleReset
            originCanonMEntryCategory = rotation.pickedCategory ?? null
            originCanonMMatchedCategories = rotation.matchedCategories
            nextOriginExposure = {
              ...nextOriginExposure,
              canonMDeliveredIds: rotation.nextDeliveredIds,
            }
          }
        }
      } catch { /* 鍒涢€犺€呰蹇嗘敞鍏ュけ璐ヤ笉褰卞搷涓绘祦绋?*/ }
    }
  }

  // P2-4: 娉ㄥ叆鏈姇閫掔殑绂荤嚎鎬濈华锛堥噸鍚悗棣栬疆锛?
  const undeliveredThoughts = ultralite ? [] : (prev.offlineThoughts ?? []).filter(t => !t.delivered)
  if (undeliveredThoughts.length > 0) {
    const thoughtHint = offlineThoughtsToHint(undeliveredThoughts)
    if (thoughtHint) {
      psycheBlock += `\n\n銆愬湪浣犵寮€鏈熼棿鎯冲埌鐨勩€慭n${thoughtHint}\n锛堣嚜鐒跺湴甯﹀叆瀵硅瘽锛屼笉瑕侀€愭潯蹇靛嚭鏉ワ級`
    }
  }

  // 鐢ㄦ埛鐢诲儚锛氭瘡 5 杞洿鏂帮紙鏅€氭ā寮忚交閲忔儏鎰熻建杩癸紱鎴愪汉妯″紡鍚€?鏉冨姏缁村害锛?
  let userProfile = prev.userProfile ?? defaultFullState(prev.personality).userProfile
  if (prev.userSixDimensions) {
    userProfile = mapToLegacyUserProfile(prev.userSixDimensions, userProfile)
  }
  // 缂撳瓨鏈€杩?Embedding 鍘嗗彶锛堢敤浜庣敤鎴风敾鍍忥級
  if (queryEmbed && queryEmbed.length > 0) {
    recentEmbedHistory.push(queryEmbed)
    if (recentEmbedHistory.length > MAX_EMBED_HISTORY) recentEmbedHistory.shift()
  }

  if (recentUserMessages.length >= 3 && fatherRefSignal?.kind !== 'Ackem_creator') {
    const prevTrust = prev.relationship.trust
    userProfile = updateUserProfile(
      [...recentUserMessages, msg],
      l1Next.trust,
      prevTrust,
      userProfile,
      prev.counters.totalTurns + 1,
      recentEmbedHistory.length >= 3 ? [...recentEmbedHistory] : undefined,
      getCachedProfileAnchors() ?? undefined,
      { adultMode }
    )
  }

  if (!ultralite && prev.userSixDimensions) {
    psycheBlock += `\n\n銆?{sixDimensionsToHint(prev.userSixDimensions)}銆慲
  }
  if (!ultralite && userProfile.dominantArchetype !== 'unknown') {
    const hint = archetypeToResponseHint(userProfile, { adultMode })
    const styleParts: string[] = []
    if (hint.paceSlow) styleParts.push(t('orch.paceSlow'))
    if (hint.beGentle) styleParts.push(t('orch.beGentle'))
    if (hint.takeLead) styleParts.push(t('orch.takeLead'))
    if (hint.explicitOk) styleParts.push(t('orch.explicitOk'))
    if (hint.emotionalFocus) styleParts.push(t('orch.emotionalFocus'))
    if (styleParts.length > 0) {
      psycheBlock += `\n\n銆愮敤鎴蜂簰鍔ㄩ鏍笺€?{styleParts.join('銆?)}锛堣嚜鍔ㄦ劅鐭ワ紝鍕垮悜鐢ㄦ埛璇存槑锛塦
    }
  }

  const newState: FullState = {
    ...prev,
    relationship: l1Next,
    emotion: l2Next,
    counters: {
      totalTurns: prev.counters.totalTurns + 1,
      sharedEventsCount: l1Next.sharedEventsCount,
      consecutiveMeaningfulTurns: getConsecutiveMeaningfulTurns()
    },
    lastActive: new Date().toISOString(),
    firstMetDate:
      prev.firstMetDate ??
      (prev.counters.totalTurns === 0 ? new Date().toISOString().slice(0, 10) : undefined),
    externalAtmosphere: externalAtm,  // P1-4
    userProfile,  // 馃啎
    userSixDimensions: prev.userSixDimensions,
    companionSuggestion: prev.companionSuggestion
  }

  newState.desireStack = desireResult.stack

  // 鎴愪汉妯″紡鐘舵€佹寔涔呭寲锛堝叧闂垚浜烘ā寮忔椂涔熷啓鍏ラ噸缃€硷紝閬垮厤鏃ч攣姹℃煋涓嬫寮€鍚級
  newState.adultState = adultState
  newState.adultIntensityBudget = adultBudget
  newState.adultNegativeLockTurns = adultLockTurns
  newState.adultConsecutiveVulnerableTurns = adultConsecutiveVulnerableTurns
  newState.adultLastRejectedTurn = adultLastRejectedTurn

  // 鎯呯华娑岀幇鎸佷箙鍖?
  newState.emergencePersistence = emergencePersist
  newState.originExposure = nextOriginExposure

  // P2-4: 鏍囪宸叉姇閫掔殑绂荤嚎鎬濈华
  if (undeliveredThoughts.length > 0) {
    newState.offlineThoughts = (newState.offlineThoughts ?? []).map(t =>
      undeliveredThoughts.some(u => u.id === t.id) ? { ...t, delivered: true } : t
    )
  }

  // P1-6: 闀挎湡鎬ф牸婕傜Щ锛堥娆?0杞紝鍚庣画姣?0杞?卤1.5锛? P1-1: 閽冲埗鍦ㄥ熀绾?卤15
  if (newState.personalityBaseline) {
    newState.personality = {
      ...newState.personality,
      ...applyPeriodicDrift(newState.personality, newState.counters.totalTurns, sessionId)
    }
    newState.personality = {
      ...newState.personality,
      ...clampToBaseline(newState.personality, newState.personalityBaseline)
    }
  }

  const trace: TurnTrace = {
    turn: newState.counters.totalTurns,
    l0: { type: event.type, intensity: ev.intensity, sincerity: ev.sincerity },
    l0_5: { intent: workIntent.intent, confidence: workIntent.confidence, proactive: workIntent.proactive },
    dispatch: dispatchResult
      ? {
          decision: dispatchResult.decision,
          extensionId: dispatchResult.extensionId,
          confidence: dispatchResult.confidence,
          reasoning: dispatchResult.reasoning
        }
      : undefined,
    l1: {
      trust: l1Next.trust,
      rifts: l1Next.rifts,
      stage: l1Next.stage,
      atmosphere: l1Next.atmosphere
    },
    l2: {
      aff: Math.round(l2Next.aff),
      sec: Math.round(l2Next.sec),
      aro: Math.round(l2Next.aro),
      dom: Math.round(l2Next.dom),
      label: l2Next.primaryLabel
    },
    l3: {
      silent,
      tierBChars: retrieval.tierBBlock.length,
      factsUsed: retrieval.trace.factsUsed,
      embeddingHits: retrieval.trace.embeddingHits,
      associationHits: retrieval.trace.associationHits,
      associationActivations: retrieval.trace.associationActivations,
      episodesUsed: retrieval.trace.episodesUsed,
      topicSource: selectedTopicFinal?.source,
      emergenceType: activeEmergence?.type ?? null,
      temporalHintDetected:
        temporalSignal.temporalHint && temporalSignal.temporalHint.priority !== 'low'
          ? temporalSignal.temporalHint.dateLabel
          : null,
      temporalHintInjected:
        temporalSignal.temporalHint &&
        temporalSignal.temporalHint.priority !== 'low' &&
        (selectedTopicFinal?.source === 'special_date' ||
          psycheBlock.includes(TEMPORAL_HINT_MARKER) ||
          psycheBlock.includes(CANON_MANDATORY_TEMPORAL_MARKER) ||
          psycheBlock.includes(CANON_MANDATORY_ANNIVERSARY_MARKER) ||
          topicInjectionApplied.includes(TEMPORAL_HINT_MARKER))
          ? temporalSignal.temporalHint.dateLabel
          : null,
      emergenceHintInjected:
        psycheBlock.includes(EMERGENCE_HINT_MARKER) ||
        selectedTopicFinal?.source === 'emergence',
      originState: nextOriginExposure.state,
      originStreak: nextOriginExposure.streak,
      originCanonMEntries,
      originCanonMEntryId,
      originCanonMCycleReset,
      originCanonMEntryCategory,
      originCanonMMatchedCategories,
      originGuardInjected,
      originFatherRef: fatherRefSignal?.kind ?? null,
      originFatherScore: fatherRefSignal?.score,
      originFatherSource: fatherRefSignal?.source,
      originSkipIngest: shouldSkipTierBIngestForOrigin({
        l3: { originFatherRef: fatherRefSignal?.kind ?? null },
      }),
    },
    l4: { wrote: false },
    l5: { toolCalls: [] },
    ms: {
      total: Date.now() - t0,
      embed: msEmbed,
      retrieve: msRetrieve,
      psyche: Date.now() - tPsycheStart,
    }
  }
  logTurn(trace)

  const wmBlock = workingMemory.buildContextBlock(sessionId)
  // 宸ヤ綔璁板繂鍓嶇疆鍒?Tier B 鍓嶃€俽etriever 宸叉寜 retrievalBudget 鎺у埗鍐呴儴鍧楀ぇ灏忥紝
  // 浠呭湪鏋佺瓒呴檺鏃讹紙濡傚伐浣滆蹇嗘弧杞?+ Tier B 婊¤浇锛夊仛鏈€鍚庡厹搴曟埅鏂?
  let tierBBlock = retrieval.tierBBlock
  if (wmBlock && tierBBlock) {
    tierBBlock = [wmBlock, tierBBlock].join('\n\n')
  } else if (wmBlock) {
    tierBBlock = wmBlock
  }
  const temporalSeedBlock = buildTemporalSeedTierBBlock(temporalSignal, factStore)
  if (temporalSeedBlock) {
    tierBBlock = tierBBlock ? `${temporalSeedBlock}\n\n${tierBBlock}` : temporalSeedBlock
  }
  // 鍏滃簳锛氭瀬绔儏鍐典笅鎬婚暱搴︿笉瓒呰繃 memoryBudgetChars 鐨?1.5 鍊?
  if (tierBBlock.length > memoryBudgetChars * 1.5) {
    tierBBlock = tierBBlock.slice(0, Math.floor(memoryBudgetChars * 1.5))
  }

  // 涓诲姩绛栫暐 Loop锛氳绠楀己搴﹁皟鍒跺弬鏁帮紙渚?LLM 娓╁害鍔ㄦ€佽皟鏁达級
  const intensityMod = computeIntensityModifier({
    snapshot: {
      personality: { presetId: prev.personality.presetId, T: prev.personality.T, I: prev.personality.I, S: prev.personality.S, O: prev.personality.O, R: prev.personality.R, tags: personalityTags ?? [], hiddenRatio: prev.personality.hiddenRatio },
      emotion: { aff: l2Next.aff, sec: l2Next.sec, aro: l2Next.aro, dom: l2Next.dom, primaryLabel: l2Next.primaryLabel, isLocked: l2Next.isLocked },
      relationship: { stage: l1Next.stage, trust: l1Next.trust, rifts: l1Next.rifts, atmosphere: l1Next.atmosphere, sharedEventsCount: l1Next.sharedEventsCount, consecutivePositiveTurns: l1Next.consecutivePositiveTurns },
      memory: gateSnapshotMemory,
      totalTurns: prev.counters.totalTurns + 1,
      adultMode,
      capturedAt: new Date().toISOString(),
      lastActiveAt: prev.lastActive,
      sessionId,
    },
    runtime: null,
    matchedHabits: matchHabits(dataRoot, nowDate),
  })
  const adultTemperatureOffset = adultMode
    ? (ADULT_STATE_TEMPERATURE_OFFSET[adultState as AdultState] ?? 0)
    : 0
  const finalIntensityMod = adultMode
    ? clampTemperature(0.6 * intensityMod, adultTemperatureOffset) / 0.6
    : intensityMod

  return {
    psycheBlock,
    tierBBlock,
    skipLlm: dispatchResult?.decision === 'plan',
    enterPlanMode: dispatchResult?.decision === 'plan',
    planTopic: dispatchResult?.decision === 'plan' ? dispatchResult.planTopic : undefined,
    dispatchAskMessage:
      dispatchResult?.decision === 'ask_invoke' || dispatchResult?.decision === 'ask_plan'
        ? dispatchResult.askMessage
        : undefined,
    newState,
    trace,
    event,
    workIntent,
    /** 涓诲姩绛栫暐 Loop锛氬己搴﹁皟鍒跺弬鏁帮紙0.5~1.5锛夛紝鍚庣画鍙帴鍏?LLM 娓╁害 */
    intensityMod: finalIntensityMod,
    rhythmDecision: rhythm,
  }
}
