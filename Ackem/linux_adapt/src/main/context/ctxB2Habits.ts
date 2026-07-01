import { listEstablishedHabits } from '../memory/proceduralHabits'
import type { UserActivityContext } from './types'

const WORK_HABIT = /开会|办公|写代码|编程|上班|工作|加班|ddl/i
const REST_HABIT = /睡觉|休息|熬夜|补觉/i

/**
 * CTX-B2 最小：程序性习惯第三次成立后，为 activity 提供可引用信号（避免瞎猜）
 */
export function resolveActivityFromEstablishedHabits(
  dataRoot: string
): UserActivityContext | null {
  const habits = listEstablishedHabits(dataRoot, 3)
  if (!habits.length) return null

  const joined = habits.join(' ')
  if (WORK_HABIT.test(joined)) {
    return {
      category: 'work',
      tense: 'present',
      label: '工作·进行中',
      confidence: 0.78,
      source: ['ctx-b2:habit_established', 'procedural-memory']
    }
  }
  if (REST_HABIT.test(joined)) {
    return {
      category: 'rest',
      tense: 'present',
      label: '休息·进行中',
      confidence: 0.75,
      source: ['ctx-b2:habit_established', 'procedural-memory']
    }
  }
  return {
    category: 'daily',
    tense: 'present',
    label: '日常·进行中',
    confidence: 0.72,
    source: ['ctx-b2:habit_established', 'procedural-memory']
  }
}
