// [habitDetector] — 时间规律识别
// 职责：检测用户的时间行为模式（如"总是在周六晚上感到孤独"）
// 引用：./factStore, ../engine/types

import type { MemoryFact } from '../engine/types'
import type { FactStore } from './factStore'

export interface TimeHabit {
  hour: number
  subcategory: string
  frequency: number      // 过去 30 天内出现的次数
  avgIntensity: number   // 平均情绪强度
  label: string          // 人话描述
}

/**
 * 检测用户的时间规律。
 * 每 50 轮调用一次，< 5ms。
 */
export function detectHabits(factStore: FactStore): TimeHabit[] {
  const thirtyDaysAgo = Date.now() - 30 * 86400000
  const habits: TimeHabit[] = []

  for (let hour = 0; hour < 24; hour++) {
    const hourFacts = factStore.listActive()
      .filter(f => new Date(f.createdAt).getHours() === hour)
      .filter(f => new Date(f.createdAt).getTime() > thirtyDaysAgo)

    if (hourFacts.length < 5) continue

    const bySub = new Map<string, MemoryFact[]>()
    for (const f of hourFacts) {
      const list = bySub.get(f.subcategory) || []
      list.push(f)
      bySub.set(f.subcategory, list)
    }

    for (const [sub, facts] of bySub) {
      if (facts.length >= 5) {
        const avgIntensity = facts.reduce((s, f) => s + f.emotionalContext.intensity, 0) / facts.length
        habits.push({
          hour,
          subcategory: sub,
          frequency: facts.length,
          avgIntensity,
          label: buildHabitLabel(hour, sub, facts.length)
        })
      }
    }
  }

  return habits
}

function buildHabitLabel(hour: number, sub: string, freq: number): string {
  const period = hour < 6 ? '凌晨' : hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上'
  const subLabel: Record<string, string> = {
    MOOD: '情绪波动', VULNERABILITIES: '感到脆弱', OUR_BOND: '想被陪伴',
    HEALTH: '关注健康', CAREER: '提及工作', ROUTINES: '日常习惯',
    TASTES: '表达喜好', GOALS: '谈论目标'
  }
  return `${period}${hour}点·${subLabel[sub] ?? sub}（${freq}次）`
}

/**
 * 生成规律感知提示文本（注入 psycheBlock）。
 */
export function formatHabitHint(habits: TimeHabit[], currentHour: number): string | null {
  const matched = habits.filter(h => h.hour === currentHour)
  if (matched.length === 0) return null
  const top = matched.sort((a, b) => b.avgIntensity - a.avgIntensity)[0]
  return `【时间感知】你总是在${top.label}。`
}
