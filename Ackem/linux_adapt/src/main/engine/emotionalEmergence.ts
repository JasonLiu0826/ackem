// [emotionalEmergence] — 情绪涌现模块
// 职责：当情绪强度越过阈值，涌现出时间感慨等超越基础情绪的高维表达状态
// 硬约束：不回写L2。不调LLM做判决。
// 设计文档：docs/plan/心系统_情绪涌现模块设计_6_11.md

import type { EmergenceState, EmergenceContext, EmotionState } from './types'
import { t } from '../i18n'

// ═══════════════════════════════════════════════════════════
// 参数常量
// ═══════════════════════════════════════════════════════════

const EMERGENCE_INTENSITY_THRESHOLD = 20
const EMERGENCE_COOLDOWN_TURNS = 10
/** 响应式脆弱倾诉：允许紧接上一段涌现 dissolve 后再次触发 */
const RESPONSIVE_EMERGENCE_COOLDOWN_TURNS = 1
const SAME_TYPE_COOLDOWN_TURNS = 50
const SAME_TYPE_COOLDOWN_HOURS = 72
const RISING_MAX_ROUNDS = 3
const SUSTAINED_MAX_ROUNDS = 10
const SUSTAINED_MIN_ROUNDS = 3
const FADING_MAX_ROUNDS = 5
const ANTI_REPETITION_SIMILARITY_THRESHOLD = 0.65

// ═══════════════════════════════════════════════════════════
// 事件追踪（模块级状态）
// ═══════════════════════════════════════════════════════════

let recentEventTypes: string[] = []
let consecutiveMeaningfulCount = 0
let consecutiveVulnerableCount = 0

const MEANINGFUL_EVENT_TYPES = ['vulnerable', 'praise', 'apology'] as const

/** 每轮推送事件类型到历史窗口 */
export function pushEventToHistory(eventType: string): void {
  recentEventTypes.push(eventType)
  if (recentEventTypes.length > 10) {
    recentEventTypes = recentEventTypes.slice(-10)
  }
}

/** 获取最近N轮事件类型 */
export function getRecentEventTypes(): string[] {
  return [...recentEventTypes]
}

/** 标记本轮是有意义事件 */
export function pushMeaningfulTurn(isMeaningful: boolean): void {
  if (isMeaningful) {
    consecutiveMeaningfulCount++
  } else {
    consecutiveMeaningfulCount = 0
  }
}

/** 获取连续有意义轮数 */
export function getConsecutiveMeaningfulTurns(): number {
  return consecutiveMeaningfulCount
}

/** 连续脆弱倾诉计数（沉默/闲聊不打断，伤害类清零） */
export function pushVulnerableTurn(eventType: string): void {
  if (eventType === 'vulnerable') {
    consecutiveVulnerableCount++
  } else if (eventType === 'hurtful' || eventType === 'cold' || eventType === 'extreme_redline') {
    consecutiveVulnerableCount = 0
  }
}

export function getConsecutiveVulnerableTurns(): number {
  return consecutiveVulnerableCount
}

/** 最近窗口内有意义事件数（允许中间穿插沉默/闲聊） */
export function countMeaningfulInRecent(events: string[], window = 6): number {
  return events.slice(-window).filter(t => MEANINGFUL_EVENT_TYPES.includes(t as typeof MEANINGFUL_EVENT_TYPES[number])).length
}

/** 重置事件追踪（新会话） */
export function resetEmergenceTracking(): void {
  recentEventTypes = []
  consecutiveMeaningfulCount = 0
  consecutiveVulnerableCount = 0
}

// ═══════════════════════════════════════════════════════════
// 时间→人话映射
// ═══════════════════════════════════════════════════════════

/** 模糊体感标签——日常涌现用，不含任何数字。
 *  标签格式设计为直接嵌入 "已经和ta认识____了" 模板中。
 *  末尾不要带"了"字（模板已提供）。 */
export function humanizeFeltDuration(days: number): string {
  if (days < 30) return t('feltDuration.short')
  if (days < 90) return t('feltDuration.medium')
  if (days < 180) return t('feltDuration.half')
  if (days < 365) return t('feltDuration.long')
  return t('feltDuration.veryLong')
}

// ═══════════════════════════════════════════════════════════
// 主判决函数
// ═══════════════════════════════════════════════════════════

export type EvaluateEmergenceOptions = {
  /** 当前轮 L0 事件类型；vulnerable 时走响应式低门槛路径 */
  eventType?: string
}

export type EmergenceResponseContext = Pick<
  EmergenceContext,
  'consecutiveMeaningfulTurns' | 'consecutiveVulnerableTurns' | 'recentEventTypes'
>

/** 用户仍在情感深聊链上（非硬编码句式；看 L0 类型 + 连续深度） */
export function isEmotionalContinuationEvent(
  eventType: string,
  ctx: EmergenceResponseContext
): boolean {
  if (eventType === 'vulnerable') return true
  if (eventType === 'apology') {
    return ctx.consecutiveMeaningfulTurns >= 2 || ctx.consecutiveVulnerableTurns >= 1
  }
  if (eventType === 'praise') {
    return (
      ctx.consecutiveVulnerableTurns >= 1 ||
      ctx.consecutiveMeaningfulTurns >= 3 ||
      countMeaningfulInRecent(ctx.recentEventTypes) >= 3
    )
  }
  return false
}

/** 是否走响应式 evaluateEmergence（绕过 10 轮类型间冷却） */
export function shouldEvaluateResponsiveEmergence(
  eventType: string | undefined,
  ctx: EmergenceContext
): boolean {
  if (!eventType || !isEmotionalContinuationEvent(eventType, ctx)) return false
  if (eventType === 'vulnerable') return ctx.consecutiveVulnerableTurns >= 1
  if (eventType === 'apology') return ctx.consecutiveMeaningfulTurns >= 2
  if (eventType === 'praise') {
    return ctx.consecutiveMeaningfulTurns >= 2 || ctx.consecutiveVulnerableTurns >= 1
  }
  return false
}

export function evaluateEmergence(
  ctx: EmergenceContext,
  opts?: EvaluateEmergenceOptions
): EmergenceState | null {
  // 护盾2：陌生人没有涌现的土壤
  if (ctx.stage === 'STRANGER') return null

  // 护盾3：愤怒压倒一切
  if (ctx.emotion.primaryLabel === 'ANGRY_ATTACK') return null

  // 响应式：情感链延续时优先于标准类型间冷却
  if (shouldEvaluateResponsiveEmergence(opts?.eventType, ctx)) {
    const responsive = tryResponsiveEmergence(ctx)
    if (responsive) return responsive
  }

  // 护盾4：类型间冷却（10轮，仅主动路径）
  if (ctx.lastEmergence &&
    ctx.currentTurn - ctx.lastEmergence.turn < EMERGENCE_COOLDOWN_TURNS) {
    return null
  }

  // 护盾1：情绪强度不够（连续深聊/脆弱倾诉可小幅补足门槛）
  const emotionalIntensity =
    ctx.emotion.aff * 0.6 +
    ctx.emotion.sec * 0.2 +
    Math.abs(ctx.emotion.aro) * 0.2
  const depthBonus =
    (ctx.consecutiveVulnerableTurns >= 3 ? 4 : 0) +
    (ctx.consecutiveMeaningfulTurns >= 3 ? 2 : 0) +
    (countMeaningfulInRecent(ctx.recentEventTypes) >= 4 ? 2 : 0)
  if (emotionalIntensity + depthBonus < EMERGENCE_INTENSITY_THRESHOLD) return null

  const timeRef = tryTimeReflection(ctx)
  if (timeRef) return timeRef

  return null
}

// ═══════════════════════════════════════════════════════════
// 时间感慨判决
// ═══════════════════════════════════════════════════════════

type TimeReflectionMode = { responsive?: boolean }

function tryTimeReflection(ctx: EmergenceContext, mode: TimeReflectionMode = {}): EmergenceState | null {
  if (ctx.daysSinceMet < 7) return null

  const { emotion, stage, timeOfDay, recentAffHistory } = ctx
  const feltLabel = humanizeFeltDuration(ctx.daysSinceMet)

  // 双锁冷却：同类型 — 轮次与墙钟任一满足即可再次触发（长对话不必等满 72h）
  if (ctx.lastSameTypeAt && ctx.lastSameTypeTurn != null) {
    const hoursSince = (Date.now() - new Date(ctx.lastSameTypeAt).getTime()) / 3600000
    const turnsSince = ctx.currentTurn - ctx.lastSameTypeTurn
    if (mode.responsive) {
      if (turnsSince < 1) return null
    } else if (turnsSince < SAME_TYPE_COOLDOWN_TURNS && hoursSince < SAME_TYPE_COOLDOWN_HOURS) {
      return null
    }
  }

  // 场景1：深夜 + 安静的喜欢 + 连续深聊
  if (timeOfDay === 'late_night' &&
    emotion.primaryLabel === 'QUIET_FOND' &&
    ctx.consecutiveMeaningfulTurns >= 5) {
    return {
      type: 'timeReflection',
      intensity: clamp((emotion.aff + 100) / 200 + 0.2, 0.3, 0.9),
      flavor: 'quiet_awe',
      phase: 'rising',
      startedAt: new Date().toISOString(),
      roundsInPhase: 1,
      hasExpressed: false,
      context: { feltLabel }
    }
  }

  // 场景2：甜蜜依恋 + 认识超过3个月 + 气氛温暖
  if (emotion.primaryLabel === 'SWEET_ATTACHMENT' &&
    ctx.daysSinceMet > 90 &&
    ctx.atmosphere === 'warm') {
    return {
      type: 'timeReflection',
      intensity: clamp((emotion.aff + 100) / 200 + ctx.trust / 200, 0.4, 0.95),
      flavor: 'nostalgic',
      phase: 'rising',
      startedAt: new Date().toISOString(),
      roundsInPhase: 1,
      hasExpressed: false,
      context: { feltLabel }
    }
  }

  // 场景3：委屈受伤 + 亲密关系 → 苦涩甜蜜（仅当hurt来自分离焦虑且最近aff偏高）
  if (emotion.primaryLabel === 'HURT_GRIEVANCE' &&
    stage === 'INTIMATE' &&
    recentAffHistory.length >= 5) {
    const recentAvg = recentAffHistory.slice(-5).reduce((a, b) => a + b, 0) / 5
    if (recentAvg > 50) {
      return {
        type: 'timeReflection',
        intensity: clamp(Math.abs(emotion.aff) / 100, 0.3, 0.7),
        flavor: 'bittersweet',
        phase: 'rising',
        startedAt: new Date().toISOString(),
        roundsInPhase: 1,
        hasExpressed: false,
        context: { feltLabel }
      }
    }
  }

  // 场景4：亲密 + aff刚从低谷恢复 → 感激
  if (stage === 'INTIMATE' && recentAffHistory.length >= 5) {
    const trend = recentAffHistory.slice(-5)
    if (trend[0] < 20 && trend[trend.length - 1] > 50) {
      return {
        type: 'timeReflection',
        intensity: 0.7,
        flavor: 'grateful',
        phase: 'rising',
        startedAt: new Date().toISOString(),
        roundsInPhase: 1,
        hasExpressed: false,
        context: { feltLabel }
      }
    }
  }

  // 场景5：傲娇 + 亲密 + 认识超过半年
  if (emotion.primaryLabel === 'TSUNDERE' &&
    stage === 'INTIMATE' &&
    ctx.daysSinceMet > 180) {
    return {
      type: 'timeReflection',
      intensity: 0.55,
      flavor: 'wonder',
      phase: 'rising',
      startedAt: new Date().toISOString(),
      roundsInPhase: 1,
      hasExpressed: false,
      context: { feltLabel }
    }
  }

  // 场景7：连续脆弱倾诉 — 压力/失眠/自我否定堆叠（沉默不打断计数）
  if (ctx.consecutiveVulnerableTurns >= 3 &&
    (stage === 'FAMILIAR' || stage === 'INTIMATE') &&
    ctx.daysSinceMet > 14 &&
    emotion.aff > 8 &&
    ['QUIET_FOND', 'CALM_RATIONAL', 'SWEET_ATTACHMENT', 'HURT_GRIEVANCE'].includes(emotion.primaryLabel)) {
    return {
      type: 'timeReflection',
      intensity: clamp((emotion.aff + Math.abs(emotion.aro)) / 120 + ctx.consecutiveVulnerableTurns / 10, 0.3, 0.75),
      flavor: 'tender_hold',
      phase: 'rising',
      startedAt: new Date().toISOString(),
      roundsInPhase: 1,
      hasExpressed: false,
      context: { feltLabel }
    }
  }

  // 场景6：温暖熟悉感 — 熟悉阶段 + 正向情绪 + 认识超过2周 + 连续/窗口内深聊
  const meaningfulDepth =
    ctx.consecutiveMeaningfulTurns >= 3 ||
    countMeaningfulInRecent(ctx.recentEventTypes) >= 3
  if ((emotion.primaryLabel === 'QUIET_FOND' || emotion.primaryLabel === 'SWEET_ATTACHMENT') &&
    stage !== 'STRANGER' &&
    ctx.daysSinceMet > 14 &&
    meaningfulDepth) {
    return {
      type: 'timeReflection',
      intensity: clamp((emotion.aff + 100) / 250 + ctx.daysSinceMet / 500, 0.25, 0.7),
      flavor: 'warm_familiarity',
      phase: 'rising',
      startedAt: new Date().toISOString(),
      roundsInPhase: 1,
      hasExpressed: false,
      context: { feltLabel }
    }
  }

  // 场景8：响应式孤独/依赖 — silent 幕次下用户 vulnerable 仍可触发
  const responsiveHoldLabels = [
    'QUIET_FOND',
    'CALM_RATIONAL',
    'SWEET_ATTACHMENT',
    'HURT_GRIEVANCE',
    'MELANCHOLY',
  ]
  if (
    mode.responsive &&
    ctx.consecutiveVulnerableTurns >= 1 &&
    (stage === 'FAMILIAR' || stage === 'INTIMATE') &&
    ctx.daysSinceMet > 14 &&
    responsiveHoldLabels.includes(emotion.primaryLabel)
  ) {
    return {
      type: 'timeReflection',
      intensity: clamp(
        (emotion.aff + Math.abs(emotion.aro)) / 140 + ctx.consecutiveVulnerableTurns / 12,
        0.28,
        0.72
      ),
      flavor: 'tender_hold',
      phase: 'rising',
      startedAt: new Date().toISOString(),
      roundsInPhase: 1,
      hasExpressed: false,
      context: { feltLabel },
    }
  }

  return null
}

/** 响应式涌现：用户脆弱/深度倾诉时降低门槛（仍保留冷却） */
export function tryResponsiveEmergence(ctx: EmergenceContext): EmergenceState | null {
  if (ctx.stage === 'STRANGER') return null
  if (ctx.emotion.primaryLabel === 'ANGRY_ATTACK') return null
  if (
    ctx.lastEmergence &&
    ctx.currentTurn - ctx.lastEmergence.turn < RESPONSIVE_EMERGENCE_COOLDOWN_TURNS
  ) {
    return null
  }

  const emotionalIntensity =
    ctx.emotion.aff * 0.6 +
    ctx.emotion.sec * 0.2 +
    Math.abs(ctx.emotion.aro) * 0.2
  const depthBonus =
    (ctx.consecutiveVulnerableTurns >= 1 ? 4 : 0) +
    (ctx.consecutiveMeaningfulTurns >= 2 ? 2 : 0)
  if (emotionalIntensity + depthBonus < EMERGENCE_INTENSITY_THRESHOLD - 6) return null

  const responsiveCtx: EmergenceContext = {
    ...ctx,
    consecutiveMeaningfulTurns: Math.max(ctx.consecutiveMeaningfulTurns, 2),
    consecutiveVulnerableTurns: Math.max(ctx.consecutiveVulnerableTurns, 1),
  }
  return tryTimeReflection(responsiveCtx, { responsive: true })
}

// ═══════════════════════════════════════════════════════════
// 注入文本生成
// ═══════════════════════════════════════════════════════════

/** 将涌现状态渲染为 psycheBlock 注入文本 */
export function renderTimeReflectionHint(emergence: EmergenceState): string {
  const felt = emergence.context.feltLabel as string ?? ''

  const hint = t(`emergence.${emergence.flavor}`, { felt })

  return t('emergence.frame') + hint
}

/** 已经表达后的轻后缀 */
export function renderLightSuffix(emergence: EmergenceState): string {
  return t(`emergence.suffix.${emergence.flavor}`) ?? t('emergence.defaultSuffix')
}

// ═══════════════════════════════════════════════════════════
// 生命周期管理
// ═══════════════════════════════════════════════════════════

/** 推进涌现的阶段 */
export function advanceEmergencePhase(state: EmergenceState): EmergenceState {
  const roundsInPhase = state.roundsInPhase + 1

  if (state.phase === 'rising' && roundsInPhase >= RISING_MAX_ROUNDS) {
    return { ...state, phase: 'sustained', roundsInPhase: 1 }
  }

  if (state.phase === 'sustained') {
    if (roundsInPhase >= SUSTAINED_MAX_ROUNDS) {
      return { ...state, phase: 'fading', roundsInPhase: 1 }
    }
    return { ...state, roundsInPhase }
  }

  if (state.phase === 'fading' && roundsInPhase >= FADING_MAX_ROUNDS) {
    return { ...state, phase: 'dissolved', roundsInPhase: 1 }
  }

  return { ...state, roundsInPhase }
}

/** 检查是否需要中断涌现 */
export function checkEmergenceInterrupt(
  eventType: string,
  recentEvents: string[]
): 'continue' | 'break' | 'fade' {
  // 人际冲击 → 立即终止
  if (eventType === 'hurtful' || eventType === 'cold' || eventType === 'extreme_redline') {
    return 'break'
  }

  // 重大语境切换 → 强制退潮
  if (recentEvents.length >= 3) {
    const last3 = recentEvents.slice(-3)
    const emotionalTypes = ['vulnerable', 'praise', 'apology', 'tease']
    const wasEmotional = last3.some(t => emotionalTypes.includes(t))
    const isPractical = eventType === 'question' || eventType === 'casual_chat'
    if (wasEmotional && isPractical) {
      return 'fade'
    }
  }

  return 'continue'
}

/** 应用用户回应反馈到涌现状态 */
export function applyUserResponseToEmergence(
  state: EmergenceState,
  eventType: string,
  ctx?: EmergenceResponseContext
): EmergenceState {
  // 类型1：粗暴打断
  if (eventType === 'hurtful' || eventType === 'cold') {
    return { ...state, phase: 'broken', intensity: 0 }
  }

  const emotionalContinuation = ctx && isEmotionalContinuationEvent(eventType, ctx)

  // 类型2：情感链延续 — 认真接住，不提前 dissolve
  if (emotionalContinuation) {
    if (state.phase === 'sustained') {
      const refreshed = Math.max(state.roundsInPhase - 1, SUSTAINED_MIN_ROUNDS)
      return { ...state, roundsInPhase: refreshed }
    }
    if (state.phase === 'rising') {
      return state
    }
    if (state.phase === 'fading') {
      return { ...state, phase: 'sustained', roundsInPhase: SUSTAINED_MIN_ROUNDS }
    }
  }

  // 类型3：浅层 praise 收尾 — 加速淡出（非深聊链上的夸奖）
  if (eventType === 'praise') {
    if (state.phase === 'sustained') {
      return { ...state, phase: 'fading', roundsInPhase: FADING_MAX_ROUNDS - 1 }
    }
    if (state.phase === 'rising') {
      return { ...state, roundsInPhase: RISING_MAX_ROUNDS }
    }
  }

  // 中性事件：sustained 刷新计时
  if (state.phase === 'sustained') {
    const refreshed = Math.max(state.roundsInPhase - 1, SUSTAINED_MIN_ROUNDS)
    return { ...state, roundsInPhase: refreshed }
  }

  return state
}

// ═══════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
