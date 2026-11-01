// [qq/qzone] — 发表节奏的纯决策函数
//
// 抽成纯函数（不碰 DB / 网络 / settings 单例），一是便于单测覆盖「跨夜时段、每日上限、
// 最小间隔」这些边界，二是设置页也能用同一套逻辑说明「下一条大概什么时候发」。
//
// 节奏参考 dsh_qzone_sticker 的「每天几条 + 两条至少隔 60 秒」与大肥鱼的「挑时机」：
// 这里把活跃时段按每日上限切成若干槽位，每个槽位加 0.7~1.3 的抖动，
// 既不会准点像定时任务，也不会集中在一个小时里刷屏。

import type { AppSettings } from '../../../settings'
import type { QzonePlan } from './types'

export const QZONE_TICK_MS = 3 * 60_000
export const QZONE_INTERACT_INTERVAL_MS = 3 * 60 * 60_000

export type QzonePlanSettings = Pick<
  AppSettings,
  | 'qzoneAutoEnabled'
  | 'qzoneDailyLimit'
  | 'qzoneMinIntervalMinutes'
  | 'qzoneActiveStartHour'
  | 'qzoneActiveEndHour'
>

export type QzonePublishDecision = {
  publish: boolean
  /** disabled | outside_hours | daily_limit | min_interval | waiting | due */
  reason: string
  nextPublishAt?: string | null
}

function clampHour(value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
  return Math.min(23, Math.max(0, n))
}

export function activeHours(settings: QzonePlanSettings): { start: number; end: number } {
  return {
    start: clampHour(settings.qzoneActiveStartHour, 9),
    end: clampHour(settings.qzoneActiveEndHour, 23)
  }
}

/** 本地日期键（YYYY-MM-DD），用于每日计数归零 */
export function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 活跃时段判断；start === end 视为全天，start > end 视为跨夜 */
export function isWithinActiveHours(hour: number, start: number, end: number): boolean {
  if (start === end) return true
  if (start < end) return hour >= start && hour < end
  return hour >= start || hour < end
}

/** 下一个活跃时段起点：今天还没到就是今天，否则明天 */
export function nextWindowStart(now: Date, start: number): Date {
  const next = new Date(now)
  next.setMinutes(0, 0, 0)
  next.setHours(start)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next
}

/** 当天已发条数（跨天自动归零） */
export function dailyCountFor(plan: QzonePlan, now: Date): number {
  return plan.dailyDate === localDateKey(now) ? Math.max(0, plan.dailyCount) : 0
}

function positiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
  return n > 0 ? n : fallback
}

/**
 * 是否该发了。
 * 返回 false 时会尽量给出下一次的检查点，避免调度器每秒空转。
 */
export function decideQzonePublish(args: {
  now: Date
  settings: QzonePlanSettings
  plan: QzonePlan
}): QzonePublishDecision {
  const { now, settings, plan } = args
  if (!settings.qzoneAutoEnabled) return { publish: false, reason: 'disabled' }

  const { start, end } = activeHours(settings)
  if (!isWithinActiveHours(now.getHours(), start, end)) {
    return {
      publish: false,
      reason: 'outside_hours',
      nextPublishAt: nextWindowStart(now, start).toISOString()
    }
  }

  const limit = Math.max(0, Math.trunc(settings.qzoneDailyLimit ?? 2))
  if (limit > 0 && dailyCountFor(plan, now) >= limit) {
    // 明天窗口起点：不能复用 nextWindowStart（它会把「今天更早的 9 点」滚到后天）
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setMinutes(0, 0, 0)
    tomorrow.setHours(start)
    return {
      publish: false,
      reason: 'daily_limit',
      nextPublishAt: tomorrow.toISOString()
    }
  }

  const minIntervalMs = positiveInt(settings.qzoneMinIntervalMinutes, 150) * 60_000
  if (plan.lastPublishAt) {
    const last = new Date(plan.lastPublishAt)
    if (Number.isFinite(last.getTime())) {
      const elapsed = now.getTime() - last.getTime()
      if (elapsed < minIntervalMs) {
        return {
          publish: false,
          reason: 'min_interval',
          nextPublishAt: new Date(last.getTime() + minIntervalMs).toISOString()
        }
      }
    }
  }

  if (plan.nextPublishAt) {
    const at = new Date(plan.nextPublishAt)
    if (Number.isFinite(at.getTime()) && now.getTime() < at.getTime()) {
      return { publish: false, reason: 'waiting', nextPublishAt: plan.nextPublishAt }
    }
  }

  return { publish: true, reason: 'due' }
}

/**
 * 发布成功后安排下一条：活跃窗口按每日上限切槽 + 抖动，再夹在
 * [最小间隔, 12 小时] 之间。超出当天窗口就落到明天的窗口起点。
 */
export function computeNextPublishAt(
  settings: QzonePlanSettings,
  from: Date,
  rng: () => number = Math.random
): string {
  const { start, end } = activeHours(settings)
  const limit = Math.max(1, Math.trunc(settings.qzoneDailyLimit ?? 2) || 1)
  const windowHours = start === end ? 24 : end > start ? end - start : 24 - start + end
  const base = (windowHours * 3_600_000) / limit
  const jitter = 0.7 + rng() * 0.6
  const minMs = positiveInt(settings.qzoneMinIntervalMinutes, 150) * 60_000
  const interval = Math.min(Math.max(base * jitter, minMs), 12 * 3_600_000)

  const next = new Date(from.getTime() + interval)
  if (!isWithinActiveHours(next.getHours(), start, end)) {
    return nextWindowStart(next, start).toISOString()
  }
  return next.toISOString()
}

export function computeNextInteractAt(from: Date, intervalMs = QZONE_INTERACT_INTERVAL_MS): string {
  return new Date(from.getTime() + intervalMs).toISOString()
}
