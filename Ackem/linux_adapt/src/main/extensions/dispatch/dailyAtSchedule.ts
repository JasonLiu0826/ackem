/** autonomous dispatch：本地时区 daily_at（HH:MM）是否到期 */

export function parseDailyAtRule(rule: string | number): { hour: number; minute: number } | null {
  if (typeof rule !== 'string') return null
  const m = rule.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** 当前本地时间已过 rule 时刻，且今日尚未触发 */
export function isDailyAtDue(
  rule: string | number,
  lastTriggeredAt: number | null | undefined,
  now = new Date()
): boolean {
  const parsed = parseDailyAtRule(rule)
  if (!parsed) return false

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const targetMinutes = parsed.hour * 60 + parsed.minute
  if (nowMinutes < targetMinutes) return false

  if (lastTriggeredAt == null || lastTriggeredAt <= 0) return true
  return !isSameLocalDay(new Date(lastTriggeredAt), now)
}

/**
 * 错过昨日 23:30 窗口后的补跑：本地时间在 [00:00, rule) 且昨日 slot 之后未成功触发过。
 * 需配合「昨日日记文件不存在」使用，避免重复生成。
 */
export function shouldCatchUpDailyAt(
  rule: string | number,
  lastTriggeredAt: number | null | undefined,
  now = new Date()
): boolean {
  const parsed = parseDailyAtRule(rule)
  if (!parsed) return false

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const targetMinutes = parsed.hour * 60 + parsed.minute
  if (nowMinutes >= targetMinutes) return false

  const yesterdaySlot = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
    parsed.hour,
    parsed.minute,
    0,
    0
  )
  if (lastTriggeredAt == null || lastTriggeredAt <= 0) return true
  return lastTriggeredAt < yesterdaySlot.getTime()
}
