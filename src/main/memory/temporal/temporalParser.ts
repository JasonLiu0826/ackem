import { calendarDateAddDays, zonedLocalDate } from './zonedDate.js'

export type RelativeDayOffset = number

const RELATIVE_RULES: Array<{ pattern: RegExp; offset: RelativeDayOffset }> = [
  { pattern: /前天/, offset: -2 },
  { pattern: /昨天|昨日/, offset: -1 },
  { pattern: /今天|今日/, offset: 0 },
  { pattern: /明天|明日/, offset: 1 },
  { pattern: /大后天/, offset: 3 },
  { pattern: /后天/, offset: 2 },
  { pattern: /上周|上个星期/, offset: -7 },
  { pattern: /下周|下个星期/, offset: 7 }
]

export function parseRelativeDayOffset(text: string): RelativeDayOffset | null {
  const normalized = text.trim()
  if (!normalized) return null
  for (const rule of RELATIVE_RULES) {
    if (rule.pattern.test(normalized)) return rule.offset
  }
  return null
}

/** Bind relative phrases to observedAt instant + IANA zone (never job wall clock). */
export function resolveRelativeLocalDate(
  text: string,
  observedAt: string | Date,
  timeZone: string
): string | null {
  const offset = parseRelativeDayOffset(text)
  if (offset === null) return null
  const instant = observedAt instanceof Date ? observedAt : new Date(observedAt)
  if (Number.isNaN(instant.getTime())) return null
  const base = zonedLocalDate(instant, timeZone)
  return calendarDateAddDays(base, offset)
}
