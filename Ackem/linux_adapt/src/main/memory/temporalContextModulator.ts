// [temporalContextModulator] — 时间感知调制器
// 职责：根据当前时间维度调制记忆检索排序权重
// 模拟人类时间感知：昼夜节律、星期模式、季节共振、深夜加权、重逢策略、距离感知
// 引用：./factStore, ../engine/types

import type { MemoryFact } from '../engine/types'

export interface TemporalContext {
  timeOfDay: string      // 'morning'|'forenoon'|'afternoon'|'evening'|'night'|'late_night'
  isWeekend: boolean
  month: number           // 1-12
  season: string          // 'winter'|'spring'|'summer'|'autumn'
  hour: number            // 0-23
  weekday: number         // 0(Sun)-6(Sat)
  gapHours: number        // 距上次聊天间隔
  localDate: string       // "2026-06-09"
}

function monthToSeason(m: number): string {
  if (m === 12 || m <= 2) return 'winter'
  if (m <= 5) return 'spring'
  if (m <= 8) return 'summer'
  return 'autumn'
}

export function buildTemporalContext(args: {
  timeOfDay: string
  isWeekend: boolean
  month: number
  hour: number
  minute: number
  gapHours: number
  localDate: string
}): TemporalContext {
  return {
    timeOfDay: args.timeOfDay,
    isWeekend: args.isWeekend,
    month: args.month,
    season: monthToSeason(args.month),
    hour: args.hour,
    weekday: new Date(args.localDate).getDay(),
    gapHours: args.gapHours,
    localDate: args.localDate
  }
}

/**
 * 计算时间感知加权系数。
 * 纯数学运算，零 I/O，零 Embedding，< 0.5ms。
 */
export function computeTemporalBoost(fact: MemoryFact, ctx: TemporalContext): number {
  const factDate = new Date(fact.createdAt)
  const factHour = factDate.getHours()
  const factMonth = factDate.getMonth() + 1
  const factDay = factDate.getDay()
  const daysSinceCreation = (Date.now() - factDate.getTime()) / 86400000
  let boost = 1.0

  // T1: 昼夜节律 — 同时段记忆优先（±2小时）
  if (Math.abs(factHour - ctx.hour) <= 2) {
    const todBoost: Record<string, number> = {
      morning: 1.2, forenoon: 1.1, afternoon: 1.0,
      evening: 1.2, night: 1.3, late_night: 1.4
    }
    boost *= (todBoost[ctx.timeOfDay] ?? 1.0)
  }

  // T2: 星期类型匹配
  if (ctx.isWeekend && [0, 6].includes(factDay)) boost *= 1.2
  else if (!ctx.isWeekend && ![0, 6].includes(factDay)) boost *= 1.1

  // T3: 季节感知 — 同季节记忆共振
  if (monthToSeason(factMonth) === ctx.season) boost *= 1.2
  else boost *= 0.9

  // T4: 深夜加权 — 凌晨1-5点是灵魂时刻
  if (ctx.timeOfDay === 'late_night') {
    if (factHour >= 1 && factHour <= 5) boost *= 1.4
    if (['VULNERABILITIES', 'MOOD'].includes(fact.subcategory)) boost *= 1.3
  }

  // T5: 重逢感知 — 久别重逢优先高情绪关系记忆
  if (ctx.gapHours > 72 && ['OUR_BOND', 'VULNERABILITIES'].includes(fact.subcategory)) {
    boost *= 1.5
  }

  // T6: 距离感知 — 对数尺度，人类对"昨天"的记忆极强
  if (daysSinceCreation < 1) boost *= 1.5
  else if (daysSinceCreation < 3) boost *= 1.3
  else if (daysSinceCreation < 7) boost *= 1.1

  return boost
}

// ═══════════════════════════════════════════════════════════
// 周日情绪曲线 — 模拟人类一周的情绪周期
// ═══════════════════════════════════════════════════════════

/**
 * 根据星期几和时段计算情绪偏移。
 * 人类一周的情绪模式：
 *   周五晚上最兴奋（周末马上到来）
 *   周日下午开始低落，周日晚达到谷底（周日忧郁）
 *   周一上午残留低落，缓慢回升到傍晚恢复基线
 *   周二到周四为正常基线
 *
 * @returns { affDelta, secDelta } 情绪四维的微调偏移（-0.06 ~ +0.06）
 */
export function computeWeekdayMoodBias(now: Date): { affDelta: number; secDelta: number } {
  const weekday = now.getDay()  // 0=Sun, 1=Mon, ..., 6=Sat
  const hour = now.getHours()

  let affDelta = 0
  let secDelta = 0

  if (weekday === 5) {
    // 周五：全天期待，晚上最兴奋
    if (hour >= 18)      { affDelta = +0.06; secDelta = +0.02 }  // 周五晚·峰值
    else if (hour >= 14) { affDelta = +0.04 }                     // 周五下午·兴奋爬升
    else if (hour >= 10) { affDelta = +0.02 }                     // 周五上午·开始期待
  } else if (weekday === 6) {
    // 周六：享受周末
    affDelta = +0.03
  } else if (weekday === 0) {
    // 周日：上午还行，下午开始低落，晚上谷底
    if (hour >= 18)      { affDelta = -0.06; secDelta = -0.03 }  // 周日晚·谷底
    else if (hour >= 14) { affDelta = -0.03 }                     // 周日下午·开始低落
    else                 { affDelta = +0.01 }                     // 周日上午·残留周末感
  } else if (weekday === 1) {
    // 周一：早晨残留低落，缓慢回升
    if (hour < 12)       { affDelta = -0.06; secDelta = -0.02 }  // 周一上午·蓝调残留
    else if (hour < 18)  { affDelta = -0.03 }                     // 周一下午·恢复中
    // 周一傍晚 → 归零
  }
  // 周二(2)、周三(3)、周四(4)：基线，无偏移

  return { affDelta, secDelta }
}

/** 特殊日期的情绪偏移——覆盖周日曲线 */
export function computeSpecialDateMoodBias(specialType: string): { affDelta: number; secDelta: number } {
  switch (specialType) {
    case 'ackem_birthday':
      return { affDelta: +3.0, secDelta: +1.5 }        // 她自己的生日——比谁都开心
    case 'birthday':
      return { affDelta: +3.0, secDelta: +1.0 }        // 庆祝感，温暖
    case 'first_met_anniversary':
    case 'relationship':
      return { affDelta: +2.0, secDelta: +0.5 }        // 温暖怀旧，比生日含蓄
    case 'holiday_spring':
      return { affDelta: +1.5, secDelta: +0.3 }        // 春节——喜庆
    case 'holiday_valentine':
      return { affDelta: +1.0, secDelta: -0.5 }        // 情人节——温馨带期待
    case 'holiday':
      return { affDelta: +0.5, secDelta: 0 }           // 一般节日——轻微
    case 'milestone':
      return { affDelta: +1.0, secDelta: +0.2 }        // 里程碑——感慨
    default:
      return { affDelta: 0, secDelta: 0 }
  }
}
