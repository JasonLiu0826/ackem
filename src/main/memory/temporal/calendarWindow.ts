import { calendarDateAddDays, zonedLocalDate } from './zonedDate.js'

export type MonthDayRange = { start: string; end: string }

/** Expand ±N days around instant in IANA zone; split when MM-DD window crosses year boundary. */
export function monthDayWindowRanges(
  instant: Date,
  timeZone: string,
  daysBefore: number,
  daysAfter: number
): MonthDayRange[] {
  const centerLocal = zonedLocalDate(instant, timeZone)
  const start = calendarDateAddDays(centerLocal, -daysBefore).slice(5)
  const end = calendarDateAddDays(centerLocal, daysAfter).slice(5)
  if (start <= end) return [{ start, end }]
  return [
    { start, end: '12-31' },
    { start: '01-01', end }
  ]
}

/** Local-date window for fuzzy anchor_date comparisons (YYYY-MM-DD). */
export function localDateWindow(
  instant: Date,
  timeZone: string,
  daysBefore: number,
  daysAfter: number
): { from: string; to: string } {
  const center = zonedLocalDate(instant, timeZone)
  return {
    from: calendarDateAddDays(center, -daysBefore),
    to: calendarDateAddDays(center, daysAfter)
  }
}

/** Expand civil dates from startLocal through endLocal inclusive (handles year wrap). */
export function expandLocalDateSpan(startLocal: string, endLocal: string): string[] {
  if (startLocal <= endLocal) {
    const out: string[] = []
    let cur = startLocal
    while (cur <= endLocal) {
      out.push(cur)
      if (cur === endLocal) break
      cur = calendarDateAddDays(cur, 1)
      if (out.length > 400) break
    }
    return out
  }
  const out: string[] = []
  let cur = startLocal
  while (cur <= '12-31') {
    out.push(cur)
    cur = calendarDateAddDays(cur, 1)
    if (out.length > 400) break
  }
  cur = '01-01'
  while (cur <= endLocal) {
    out.push(cur)
    cur = calendarDateAddDays(cur, 1)
    if (out.length > 400) break
  }
  return out
}
