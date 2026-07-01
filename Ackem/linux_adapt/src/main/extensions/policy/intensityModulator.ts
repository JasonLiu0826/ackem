// [intensityModulator] — 强度调制器
// 职责：根据情绪+关系+时间+习惯，输出 0.5~1.5 的语气强度调制参数
// 纯四则运算，<0.01ms
// 设计文档：docs/plan/主动策略调度loop详细设计_6_11.md·§4.3

import type { EngineSnapshot } from '../protocols'
import type { RuntimeContext } from '../../context/types'
import type { UserHabit } from './types'

/**
 * @returns 0.5~1.5，1.0 为基线
 */
export function computeIntensityModifier(input: {
  snapshot: EngineSnapshot
  runtime: RuntimeContext | null
  matchedHabits: UserHabit[]
}): number {
  const { snapshot, runtime, matchedHabits } = input
  const aff = snapshot.emotion.aff
  // 唤醒度只看大小，不看方向（兴奋或焦虑都增加表达强度）
  const aro = Math.abs(snapshot.emotion.aro)
  const dom = snapshot.emotion.dom
  const stage = snapshot.relationship.stage

  let mod = 1.0

  // ── 情绪调制 ──
  if (aff > 60) mod += 0.2       // 开心，语气活泼
  else if (aff < 20) mod -= 0.2  // 低落，语气平稳
  if (aro > 60) mod += 0.1       // 兴奋，可以多话
  if (dom < -30) mod -= 0.1      // 不安，更谨慎

  // ── 关系调制 ──
  if (stage === 'INTIMATE') mod += 0.1
  else if (stage === 'STRANGER') mod -= 0.1

  // ── 时间调制 ──
  if (runtime) {
    const tod = runtime.time.timeOfDay
    if (tod === 'late_night' || tod === 'night') mod -= 0.15
    if (runtime.time.isWeekend && tod === 'morning') mod += 0.1
  }

  // ── 习惯调制 ──
  const restHabits = matchedHabits.filter(h => h.type === 'rest')
  if (restHabits.length > 0) mod -= 0.1

  return clamp(mod, 0.5, 1.5)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
