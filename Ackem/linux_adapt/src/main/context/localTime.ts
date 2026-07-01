/** 本地计算机时钟工具（与 UTC 文件命名解耦） */

export function localDateString(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatLocalTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

export function formatLocalWeekdayZh(d = new Date()): string {
  return WEEKDAY_ZH[d.getDay()] ?? '周日'
}

/** yyyy-MM-dd HH:mm（用户本地计算机时钟） */
export function formatAccurateLocalDateTime(d = new Date()): string {
  return `${localDateString(d)} ${formatLocalTime(d)}`
}

/** 用户是否在问当前本地时间/日期 */
export function userAsksLocalClock(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return (
    /(?:现在|当前|这会儿)?(?:几点|几时)/u.test(t) ||
    /(?:现在|当前)什么时间|现在时间|当前时间/u.test(t) ||
    /今天几号|今天日期|几月几号|星期几/u.test(t) ||
    /what\s*time|current\s*time|what\s*day\s*(?:is\s*)?(?:it|today)/iu.test(t)
  )
}

export function startOfLocalDayMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0).getTime()
}

export function endOfLocalDayMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 23, 59, 59, 999).getTime()
}

export function localDateFromIso(iso: string): string {
  return localDateString(new Date(iso))
}

export function isWithinLocalDayWindow(iso: string, date: string, upperBoundMs: number): boolean {
  if (localDateFromIso(iso) !== date) return false
  const t = new Date(iso).getTime()
  return t >= startOfLocalDayMs(date) && t <= upperBoundMs
}
