import type { RhythmDecision, RhythmMode } from '../main/engine/rhythmEngine'
import type { UserTaskFrame } from './taskFrame'

export type WaveCount = 1 | 2 | 3 | 4

export type WaveSpec = {
  waveIndex: number
  maxChars: number
  /** 追加到 system/psyche 的增量提示 */
  systemDelta?: string
}

export type WavePlan = {
  waveCount: WaveCount
  waves: WaveSpec[]
  rhythmMode: RhythmMode
}

/** 上一 bubble 完全显示后，下一 bubble 出现前的停顿（毫秒） */
export const WAVE_INTER_BUBBLE_GAP_MS = 900

export type SkipWavesInput = {
  asyncMultiMessageEnabled?: boolean
  knowledgeTopic?: string
  planDocumentTopic?: string
  forcedWebSearchQuery?: string
  dispatchDecision?: string
  enterPlanMode?: boolean
  skipLlm?: boolean
  /** 结构化任务 / 必须走 tools 的单轮路径 */
  requiresToolTurn?: boolean
}

/** 是否走异步多波聊天（否则回退单轮 + 可选 [SPLIT]） */
export function shouldUseWaveChat(input: SkipWavesInput): boolean {
  if (input.asyncMultiMessageEnabled === false) return false
  return !skipWaves(input)
}

/** 强制单轮路径：知识卡、计划书、联网搜、dispatch 特殊分支、工具轮等 */
export function skipWaves(input: SkipWavesInput): boolean {
  if (input.skipLlm) return true
  if (input.enterPlanMode) return true
  if (input.knowledgeTopic?.trim()) return true
  if (input.planDocumentTopic?.trim()) return true
  if (input.forcedWebSearchQuery?.trim()) return true
  if (input.requiresToolTurn) return true
  const d = input.dispatchDecision
  if (d === 'evolve' || d === 'open_surface' || d === 'invoke_surface' || d === 'ask_invoke' || d === 'ask_plan' || d === 'plan') {
    return true
  }
  return false
}

/** 任务型单轮（表格/对比/联网搜等），不走 wave */
export function requiresToolTurn(frame: UserTaskFrame): boolean {
  if (frame.needsSearch) return true
  if (frame.goal !== 'casual') return true
  if (frame.delivery !== 'prose') return true
  return false
}

function waveSystemDelta(waveIndex: number, waveCount: number, locale: 'zh' | 'en'): string | undefined {
  const singleBubbleRule =
    locale === 'zh'
      ? '【单条】本条=微信里的一条消息：只写1句，不换行，不要第二句，不要括号内心独白。'
      : '【Single bubble】One chat message only: one sentence, no line break, no parenthetical aside.'

  if (waveIndex === 0) {
    return locale === 'zh'
      ? `${singleBubbleRule}\n【快反应】先接话：共鸣/短问/短表态，≤25字。禁止排期、店名、外卖、记笔记等具体安排。`
      : `${singleBubbleRule}\nQuick ping: react in one short line (≤25 chars). No plans, shops, or takeout yet.`
  }
  if (waveIndex === 1 && waveCount >= 2) {
    return locale === 'zh'
      ? `${singleBubbleRule}\n【续聊】假定你已短答过。只加一个新信息：一个具体建议（时间/店/做法三选一），≤35字。禁止在线确认（在/在呢）。`
      : `${singleBubbleRule}\nAdd one new concrete suggestion (time/place/how). No presence checks.`
  }
  if (waveIndex === 2 && waveCount >= 3) {
    return locale === 'zh'
      ? `${singleBubbleRule}\n【细节】若有共同记忆可带一句；没有就一句关心或补充，≤35字。禁止重复前面任何意思。`
      : `${singleBubbleRule}\nOptional memory or caring detail in one line. No repetition.`
  }
  if (waveIndex >= 3 && waveCount >= 4) {
    return locale === 'zh'
      ? `${singleBubbleRule}\n【收尾】一句关心或轻松收束，≤30字。不要重复前文。`
      : `${singleBubbleRule}\nOne warm closing line. No repetition.`
  }
  if (waveIndex === waveCount - 1 && waveCount >= 2) {
    return locale === 'zh'
      ? `${singleBubbleRule}\n【收尾】最后一句稍暖，与前文衔接但不重复，≤30字。`
      : `${singleBubbleRule}\nFinal warm line, connected but not repetitive.`
  }
  return undefined
}

export type WaveEmotionHint = {
  aro: number
  aff: number
  intensity?: number
  sincerity?: number
}

export type BuildWavePlanOptions = {
  emotion?: WaveEmotionHint
  /** 测试注入，默认 Math.random */
  rng?: () => number
}

/**
 * 异步多 bubble 轮数：常态 2–3 轮，情绪强时偏 3 轮，小概率 4 轮（更像真人连发）。
 */
export function resolveAsyncWaveCount(
  rhythm: RhythmDecision,
  emotion?: WaveEmotionHint,
  rng: () => number = Math.random
): WaveCount {
  if (rhythm.mode === 'monologue') return 1

  const aro = emotion?.aro ?? 0
  const aff = emotion?.aff ?? 0
  const intensity = emotion?.intensity ?? 0
  const sincerity = emotion?.sincerity ?? 0

  const emotional = aro > 10 || aff > 12 || intensity > 0.4 || sincerity > 0.6
  const highEmotional =
    aro > 18 || aff > 22 || intensity > 0.55 || (sincerity > 0.7 && aff > 8)

  if (highEmotional && rng() < 0.32) return 4
  if (emotional || rhythm.mode === 'chatter') {
    return (rng() < 0.55 ? 3 : 2) as WaveCount
  }
  return (rng() < 0.28 ? 3 : 2) as WaveCount
}

export function buildWavePlan(
  rhythm: RhythmDecision,
  locale: 'zh' | 'en' = 'zh',
  opts?: BuildWavePlanOptions
): WavePlan {
  let waveCount: WaveCount = resolveAsyncWaveCount(rhythm, opts?.emotion, opts?.rng)
  if (rhythm.mode === 'monologue') {
    waveCount = 1
  }

  const waves: WaveSpec[] = []
  for (let i = 0; i < waveCount; i++) {
    const maxChars =
      i === 0 ? Math.min(rhythm.maxCharsPerMsg, 40) : rhythm.mode === 'monologue' ? 200 : rhythm.maxCharsPerMsg
    waves.push({
      waveIndex: i,
      maxChars,
      systemDelta: waveSystemDelta(i, waveCount, locale)
    })
  }

  return { waveCount, waves, rhythmMode: rhythm.mode }
}
