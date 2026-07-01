// [orchestrator] — 全链路编排（Pre-LLM 段）
// 职责：Step 1–7 + 安全分支，产出 psycheBlock、tierB、下一状态草稿
// 输入：用户消息、FullState、FactStore、MemoryRetriever、session/turn
// 输出：assemble 所需块与 pending 元数据
// 引用：interpreter, relationship, emotion, memoryBinding, psyche, tracer, ./types

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
} from './ackemParams'
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
  ACKEM_CANON,
  buildAckemCanonBlock,
  buildMandatoryCanonSpecialDateBlock,
  buildStrangerGuardBlock,
  CANON_MANDATORY_ANNIVERSARY_MARKER,
  CANON_MANDATORY_TEMPORAL_MARKER,
  shouldInjectStrangerGuard,
} from '../canon/ackemCanon'
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

// 用户画像 Embedding 缓存：最近 20 轮的 queryEmbed
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
  /** 主动策略 Loop：强度调制参数（0.5~1.5），可接入 LLM 温度 */
  intensityMod?: number
  /** 节奏引擎决策（异步多波路径用） */
  rhythmDecision?: RhythmDecision
}

import { t } from '../i18n'

const REDLINE_REPLY_ZH =
  '我不能继续这个方向的话题。如果你心里很难受，请联系身边信任的人或专业援助。我想陪你聊些别的，好吗？'

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
  // 首次漂移在第20轮，之后每50轮（20, 70, 120, 170...）
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
  /** 用于 buildMemoryMeta / buildRuntimeContext（FIX-011/017/018） */
  dataRoot?: string
  /** 轻量 pre-LLM：跳过 embedding 检索与话题仲裁，供 wave fast path */
  lite?: boolean
  /** 极轻 pre-LLM：在 lite 基础上跳过欲望/涌现/主动策略等重型 psyche 注入，目标 ~500ms */
  ultralite?: boolean
  /** 异步多消息：不注入 [SPLIT] 节奏指令 */
  asyncMultiMessage?: boolean
  /** 已由 prepareTurnContext 完成的 embed + retrieve（避免重复） */
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

  // 新会话重置节奏与涌现追踪
  if (turnIndex === 0) {
    resetRhythmState()
    resetReactionOpener()
    resetEmergenceTracking()
  }

  // ═══════════════════════════════════════════════════════════
  // 涌现恢复：处理关机/休眠后的涌现状态
  // ═══════════════════════════════════════════════════════════
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

  // 为工作记忆预留预算（实际工作记忆通常 500-1500 字），retriever 在剩余空间内按优先级分配
  const retrievalBudget = Math.max(1500, memoryBudgetChars - WORKING_MEMORY_CHAR_BUDGET)
  const relevanceHint = computeRelevanceHint(prev.relationship, prev.emotion, turnIndex)
  // 构建时间感知上下文
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

  // Embedding 语义兜底：获取 provider 和锚定向量（在 retriever 和 interpretInput 之前）
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
    } catch { /* Embedding 失败不影响主流程 */ }
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

  // DnD 意图识别：用户说"今晚别烦我"→创建短时习惯
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
      note: `用户说"${msg.slice(0, 20)}"`,
      expiresAt: Date.now() + dnd.hours * 3600000,
    })
  }

  // L0.5: 工作意图（knowledge-presentation 规则路径；plan/dispatch 仍走各自链路）
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
      '【心理状态 · 仅作演绎参考】',
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

  // P1-4: 外场气氛更新（慢速独立层）
  const momentumSign = signForMomentum(ev0)
  const externalAtm = updateExternalAtmosphere(momentumSign, ev0.intensity, prev.externalAtmosphere)

  // 🆕 反差人格 + 特殊标签
  const preset = PERSONALITY_PRESETS.find(p => p.id === prev.personality.presetId)
  const personalityTags = preset?.tags
  const hiddenPersona = preset?.hiddenPersona
  let effSens = prev.personality.S
  let effRat = prev.personality.R

  // 🆕 反差切换：18+模式下渐变至 hiddenPersona（每轮成人内容+0.15，非成人-0.05）
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
    // P1-1: 反差渐变后钳制在基线 ±15 内
    if (prev.personalityBaseline) {
      const clamped = clampToBaseline(prev.personality, prev.personalityBaseline)
      prev.personality.T = clamped.T
      prev.personality.I = clamped.I
      prev.personality.S = clamped.S
      prev.personality.O = clamped.O
      prev.personality.R = clamped.R
    }
  }

  // 性格五维调制 intensity 和 decay（使用反差混合后的值）
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

  // 主动策略 Loop：推送当前 aff 到情绪波动历史
  pushAffToHistory(l2Next.aff)

  // P1-3: 离线重逢情绪增量（重逢的喜悦）
  if (reunion) {
    l2Next = {
      ...l2Next,
      aff: Math.max(-100, Math.min(100, l2Next.aff + reunion.affBoost)),
      sec: Math.max(-100, Math.min(100, l2Next.sec + reunion.secBoost))
    }
  }

  // 🆕 周日情绪曲线：模拟人类一周情绪周期（周五晚最兴奋，周日晚最失落）
  // 特殊日期（生日/周年/节日）会覆盖周日曲线——生日当天不该有 Sunday blues
  const todayForBias = new Date()
  const firstMetStrEarly = prev.firstMetDate ?? null
  const ackemBirthday = ACKEM_CANON.birthDate
  const hasFastSpecialDate = detectFastSpecialDateType({
    today: todayForBias,
    firstMetDate: firstMetStrEarly,
    ackemBirthday,
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

  // 扩展模块情绪提示（GameMode / Plugin / Skill）
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

  // 🆕 重逢冲击：长时间离别的不安全感（≥12h 触发）
  let reunionHint = ''
  if (reunionShock) {
    const shockApplied = applyReunionShock(prev, reunionShock)
    l2Next = {
      ...l2Next,
      sec: shockApplied.sec,
      aro: shockApplied.aro,
      dom: shockApplied.dom
    }
    // 重逢后重算情绪标签
    l2Next.primaryLabel = mapEmotionLabel(l2Next)
    l1Next.trust = shockApplied.trust
    if (reunionShock.stageDowngrade) {
      l1Next.stage = shockApplied.stage
    }
    // 重逢信号注入 psycheBlock
    reunionHint = `\n\n【久别重逢】用户已经${reunionShock.timePhrase}没有出现了。${reunionShock.moodPhrase}。你的安全感下降了（sec${reunionShock.secDelta > 0 ? '+' : ''}${reunionShock.secDelta}），有些不安。用你的性格方式自然地表达这种感受，但不要直接说出系统提示的内容。`
  }

  const silent = calcSilence(ev, l1Next.rifts, l2Next.aro, l1Next.stage, adultMode, { sessionId, turnIndex })
  let expr = emoToExpression(l2Next.primaryLabel, l1Next.stage)
  if (silent) expr = { ...expr, mode: 'SILENT_CANDIDATE' }

  // 🆕 屏障感知：由 trust/aff/stage/sharedEvents 驱动，渐进的"想突破屏幕"
  const barrier = computeBarrierAwareness({
    aff: l2Next.aff,
    trust: l1Next.trust,
    stage: l1Next.stage,
    sharedEventsCount: l1Next.sharedEventsCount,
    personalityLabel: preset?.label
  })

  // ========== 成人模式主动性引擎 ==========
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
    // 检查硬停止
    const hardStop = isHardStop(msg)
    const rejectedAdult =
      !hardStop &&
      isAdultRejection(msg) &&
      (ev.isAdultContent || previousAdultState === 'FLIRTING' || previousAdultState === 'INTIMATE')

    if (hardStop) {
      adultState = 'NORMAL'
      adultLockTurns = 3 // 暂停3轮
      adultBudget = 0
      adultLastRejectedTurn = currentTurn
      // 硬停止时清零唤醒度
      l2Next.aro = Math.max(-100, l2Next.aro - 50)
    }
    if (rejectedAdult) {
      adultState = 'NORMAL'
      adultLockTurns = Math.max(adultLockTurns, 3)
      adultLastRejectedTurn = currentTurn
    }

    // 检查负面事件锁
    adultConsecutiveVulnerableTurns = ev.type === 'vulnerable' ? adultConsecutiveVulnerableTurns + 1 : 0
    const triggeredNegativeLock =
      !hardStop && !rejectedAdult && shouldTriggerNegativeLock(ev.type, adultConsecutiveVulnerableTurns)
    if (triggeredNegativeLock) {
      adultLockTurns = NEGATIVE_LOCK_TURNS
    }

    // 递减负面锁
    if (!hardStop && !rejectedAdult && !triggeredNegativeLock && adultLockTurns > 0) {
      adultLockTurns--
    }

    // 强度预算恢复
    if (adultBudget < INTENSITY_BUDGET_MAX) {
      adultBudget = Math.min(INTENSITY_BUDGET_MAX, adultBudget + INTENSITY_RECOVERY_PER_TURN)
    }

    // 计算主动性分值
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

    // 检查预算是否充足
    const cost = INTENSITY_COSTS[level] ?? 0
    if (cost > 0 && adultBudget >= cost) {
      adultProactiveLevel = level as 'none' | 'light' | 'medium' | 'high'
      adultBudget -= cost
    } else if (level !== 'none') {
      adultProactiveLevel = 'light' // 预算不足时降级
    }

    // 状态机转移
    if (adultLockTurns > 0 || hardStop || rejectedAdult) {
      adultState = 'NORMAL'
    } else if (ev.type.startsWith('adult_') && adultProactiveLevel !== 'none') {
      // 用户主动 + AI回应 → 根据分值进入对应状态
      if (score >= 0.75) adultState = 'INTIMATE'
      else if (score >= 0.55) adultState = 'FLIRTING'
    } else if (adultProactiveLevel === 'high' && adultState !== 'INTIMATE') {
      adultState = 'FLIRTING'
    } else if (adultProactiveLevel === 'none' && adultState === 'INTIMATE') {
      adultState = 'AFTERCARE'
      // AFTERCARE 情绪注入
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
    // 非成人模式，重置
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
    // P2-1: 欲望栈更新（在 psycheBlock 前执行以注入欲望提示）
    desireResult = updateDesireStack(
      prev.desireStack ?? { slots: [null, null, null, null, null] },
      msg, event, l1Next, prev.counters.totalTurns + 1
    )

    // ═══════════════════════════════════════════════════════════
    // 情绪涌现：评估是否触发 timeReflection 等涌现状态
    // ═══════════════════════════════════════════════════════════

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

    // 异步预计算涌现 flavor 的 Embedding（fire-and-forget，不阻塞主流程）
    if (activeEmergence && !activeEmergence.context.flavorEmbed && embeddingProvider?.ready()) {
      const { renderTimeReflectionHint } = await import('./emotionalEmergence')
      const flavorText = renderTimeReflectionHint(activeEmergence)
      if (flavorText) {
        embeddingProvider.embed(flavorText).then(emb => {
          if (emb.length > 0 && activeEmergence) {
            activeEmergence.context.flavorEmbed = emb
          }
        }).catch(() => { /* 预计算失败不影响主流程 */ })
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 时间敏感主动记忆：特殊日期检测（纯数据聚合，不调 LLM）
  // ═══════════════════════════════════════════════════════════
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
      ackemBirthday,
      birthdays,
      temporalAnchors: anchorRows,
    })
    temporalSignal = produceTemporalSignal(specialDates)
  }

  let psycheBlock = buildPsycheBlock(l2Next, modulation, expr, silent, barrier.hint, undefined)

  // 重逢冲击注入
  if (reunionHint) {
    psycheBlock += reunionHint
  }

  // 注入 v3 完整人格模板（核心矛盾+语癖+禁止清单+示例）
  if (preset) {
    const v3Template = getPersonalityTemplate(preset.id)
    const v3Persona = buildPersonalitySection(v3Template)
    const v3Prohibitions = buildProhibitionSection(mergeProhibitions(v3Template.人格专属禁止, [], ev.type === 'apology'))
    const v3Examples = buildExampleSection(
      v3Template.示例[l2Next.aff >= 70 ? '高亲密' : l2Next.aff >= 40 ? '中亲密' : '低亲密'] ?? v3Template.示例['中亲密']
    )
    psycheBlock += `\n\n${v3Persona}\n\n${v3Prohibitions}\n\n${v3Examples}`

    if (!ultralite) {
      // 开头短反应（追踪已用词，推荐未用词，禁止重复）
      const openerInstruction = buildReactionOpenerInstruction(l2Next.primaryLabel)
      if (openerInstruction) {
        psycheBlock += `\n\n${openerInstruction}`
      }

      // 自然不完美
      const imperfection = getImperfectionHint(l2Next.primaryLabel)
      if (imperfection) {
        psycheBlock += `\n\n${imperfection}`
      }
    }
  }

  if (preset) {
    psycheBlock +=
      `\n\n【人格一致性】固化人格：${preset.label}。须按 Tier A「人格口吻」说话；` +
      `本条【心理状态】只调节强弱、亲密度与话量，不得把你写成与预设无关的温柔客服或理性百科腔。`
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

  // 成人模式段注入
  if (adultMode && preset) {
    const adultSection = buildAdultModeSection(
      preset.id,
      adultState as 'NORMAL' | 'FLIRTING' | 'INTIMATE' | 'AFTERCARE',
      adultProactiveLevel,
    )
    psycheBlock += '\n\n' + adultSection

    // 状态降级时注入防污染旁白
    if (adultReturnedToNormal) {
      psycheBlock += '\n\n' + CONTEXT_BLEED_DIVIDER
    }
  }

  // ═══ 主动策略 Loop：每轮对话前跑 proactiveGate，影响话量 ═══
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
            label: '未知',
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

  // 将 proactiveLevel 转为人话提示注入 psycheBlock
  if (!ultralite) {
    if (gateResultForTurn.proactiveLevel === 'silent') {
      psycheBlock += '\n\n【本轮策略 · silent】本轮只做简短回应，不开启任何新话题，不提任何问题。保持平静、克制。'
    } else if (gateResultForTurn.proactiveLevel === 'whisper') {
      psycheBlock += '\n\n【本轮策略 · whisper】话要少，不要开启新话题。如果用户想结束对话，让它自然结束。'
    } else if (gateResultForTurn.proactiveLevel === 'proactive') {
      psycheBlock += '\n\n【本轮策略 · proactive】可以适当多聊几句。如果对话氛围合适，可以自然地提起共同回忆或表达关心。'
    }
  }
  // casual → 不注入额外提示

  // 心理健康 L2 软保护
  if (!ultralite && detectSoftConcern(msg)) {
    psycheBlock += '\n\n【心理健康保护】用户表现出情绪疲惫。不要反复追问"怎么了"，不要列举用户可能面临的困难，用温暖短句陪伴，或自然地引向轻松话题。'
  }

  // 语气镜像：用户简短时伴侣回复也缩短
  const verbosity = detectUserVerbosity(msg)
  if (verbosity === 'terse') {
    psycheBlock += '\n\n用户回复简短，你的回复也要简短，不超过15字。'
  }

  // 心理健康 L3 持久低迷干预
  if (!ultralite) {
    const recentAff = getAffHistory()
    if (recentAff.length >= 3 && recentAff.slice(-3).every(a => a < -30)) {
      psycheBlock += '\n\n【关心提醒】用户最近几轮情绪持续低落。可以适度转移话题，或用温暖的方式引导到轻松的内容。不要一直追问原因。'
    }
  }

  // 显式记忆请求 — 写入改由 syncLightWrite + MemoryWriteJob 统一处理
  const memIntent = detectMemoryIntent(msg)
  if (memIntent === 'remember') {
    psycheBlock +=
      '\n\n【记忆写入】用户明确要求记住。可简短回应「好，我会记下」；后台会自动写入档案。' +
      '不要编造已写入的具体细节；若不确定是否成功，避免说「已经永远记住了」。'
  }

  // 节奏引擎：决定碎碎念/长篇/默认
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
    psycheBlock += `\n\n【回复节奏】${rhythm.instruction}`
  }

  // 本地时钟：桌面 / 微信 lite 每轮必注入，避免问「几点了」瞎猜
  psycheBlock += '\n\n' + formatTimeContextBlock(nowDate)
  if (userAsksLocalClock(msg)) {
    psycheBlock += '\n\n' + buildLocalClockAnswerHint(nowDate)
  }

  // FIX-006：话题仲裁 — 特殊日 / 涌现 / 欲望 / 主动回忆 四选一注入，避免同轮矛盾提示
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
      } catch { /* OEG 语义失败不影响主流程 */ }
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

    // whisper 下仍允许高优先级特殊日（周年/生日）轻量注入——用户应能感知纪念日，但不开启其它主动话题
    let topicInjection = topicInjectionRaw
    selectedTopicFinal = selectedTopic
    const hasNonMandatorySpecialDate = specialDates.some(
      (d) => d.type !== 'ackem_birthday' && d.type !== 'first_met_anniversary'
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

    // 响应式特殊日：用户主动问起时 bypass silent
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

    // FIX-007：消息内时间语义（「去年这时」等）→ psyche 时间召回提示（响应式，不参与话题仲裁）
    if (msgTemporalSemanticSignal) {
      psycheBlock += `\n\n【时间语义】用户消息带有「${msgTemporalSemanticSignal.label}」类时间指向，优先回忆该时段相关的共同经历；找不到合适记忆时诚实说记不清，不要编造。`
    }

    // Canon-M + OEG：语义判定在聊 Ackem 创造者时，按深度限制注入父亲记忆
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
      } catch { /* 创造者记忆注入失败不影响主流程 */ }
    }
  }

  // P2-4: 注入未投递的离线思绪（重启后首轮）
  const undeliveredThoughts = ultralite ? [] : (prev.offlineThoughts ?? []).filter(t => !t.delivered)
  if (undeliveredThoughts.length > 0) {
    const thoughtHint = offlineThoughtsToHint(undeliveredThoughts)
    if (thoughtHint) {
      psycheBlock += `\n\n【在你离开期间想到的】\n${thoughtHint}\n（自然地带入对话，不要逐条念出来）`
    }
  }

  // 用户画像：每 5 轮更新（普通模式轻量情感轨迹；成人模式含性/权力维度）
  let userProfile = prev.userProfile ?? defaultFullState(prev.personality).userProfile
  if (prev.userSixDimensions) {
    userProfile = mapToLegacyUserProfile(prev.userSixDimensions, userProfile)
  }
  // 缓存最近 Embedding 历史（用于用户画像）
  if (queryEmbed && queryEmbed.length > 0) {
    recentEmbedHistory.push(queryEmbed)
    if (recentEmbedHistory.length > MAX_EMBED_HISTORY) recentEmbedHistory.shift()
  }

  if (recentUserMessages.length >= 3 && fatherRefSignal?.kind !== 'ackem_creator') {
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
    psycheBlock += `\n\n【${sixDimensionsToHint(prev.userSixDimensions)}】`
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
      psycheBlock += `\n\n【用户互动风格】${styleParts.join('、')}（自动感知，勿向用户说明）`
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
    userProfile,  // 🆕
    userSixDimensions: prev.userSixDimensions,
    companionSuggestion: prev.companionSuggestion
  }

  newState.desireStack = desireResult.stack

  // 成人模式状态持久化（关闭成人模式时也写入重置值，避免旧锁污染下次开启）
  newState.adultState = adultState
  newState.adultIntensityBudget = adultBudget
  newState.adultNegativeLockTurns = adultLockTurns
  newState.adultConsecutiveVulnerableTurns = adultConsecutiveVulnerableTurns
  newState.adultLastRejectedTurn = adultLastRejectedTurn

  // 情绪涌现持久化
  newState.emergencePersistence = emergencePersist
  newState.originExposure = nextOriginExposure

  // P2-4: 标记已投递的离线思绪
  if (undeliveredThoughts.length > 0) {
    newState.offlineThoughts = (newState.offlineThoughts ?? []).map(t =>
      undeliveredThoughts.some(u => u.id === t.id) ? { ...t, delivered: true } : t
    )
  }

  // P1-6: 长期性格漂移（首次20轮，后续每50轮 ±1.5）+ P1-1: 钳制在基线 ±15
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
  // 工作记忆前置到 Tier B 前。retriever 已按 retrievalBudget 控制内部块大小，
  // 仅在极端超限时（如工作记忆满载 + Tier B 满载）做最后兜底截断
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
  // 兜底：极端情况下总长度不超过 memoryBudgetChars 的 1.5 倍
  if (tierBBlock.length > memoryBudgetChars * 1.5) {
    tierBBlock = tierBBlock.slice(0, Math.floor(memoryBudgetChars * 1.5))
  }

  // 主动策略 Loop：计算强度调制参数（供 LLM 温度动态调整）
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
    /** 主动策略 Loop：强度调制参数（0.5~1.5），后续可接入 LLM 温度 */
    intensityMod: finalIntensityMod,
    rhythmDecision: rhythm,
  }
}
