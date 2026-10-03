export interface ZonedDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
}

const PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = PARTS_FORMATTER_CACHE.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short'
    })
    PARTS_FORMATTER_CACHE.set(timeZone, fmt)
  }
  return fmt
}

function partInt(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const raw = parts.find((p) => p.type === type)?.value ?? '0'
  return Number.parseInt(raw, 10)
}

function weekdayFromShort(label: string): number {
  switch (label.slice(0, 3).toLowerCase()) {
    case 'sun':
      return 0
    case 'mon':
      return 1
    case 'tue':
      return 2
    case 'wed':
      return 3
    case 'thu':
      return 4
    case 'fri':
      return 5
    case 'sat':
      return 6
    default:
      return 0
  }
}

export function zonedDateParts(instant: Date, timeZone: string): ZonedDateParts {
  const parts = formatter(timeZone).formatToParts(instant)
  return {
    year: partInt(parts, 'year'),
    month: partInt(parts, 'month'),
    day: partInt(parts, 'day'),
    hour: partInt(parts, 'hour') % 24,
    minute: partInt(parts, 'minute'),
    weekday: weekdayFromShort(parts.find((p) => p.type === 'weekday')?.value ?? 'Sun')
  }
}

export function zonedLocalDate(instant: Date, timeZone: string): string {
  const p = zonedDateParts(instant, timeZone)
  const month = String(p.month).padStart(2, '0')
  const day = String(p.day).padStart(2, '0')
  return `${p.year}-${month}-${day}`
}

export function zonedMonthDay(instant: Date, timeZone: string): string {
  const p = zonedDateParts(instant, timeZone)
  return `${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Civil calendar weekday for YYYY-MM-DD (not UTC instant parsing). */
export function weekdayFromCalendarDate(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function calendarDateAddDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  const yy = shifted.getUTCFullYear()
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * UTC instant of local midnight for a civil YYYY-MM-DD in an IANA zone.
 * Step 1 anchors to any instant inside that local day (start from 12:00 UTC, correct at most 3×);
 * step 2 subtracts the local clock time to reach 00:00, with ±1d fallback for DST edges.
 */
export function zonedLocalMidnightUtc(localDate: string, timeZone: string): Date {
  const [y, m, d] = localDate.split('-').map(Number)
  let guess = Date.UTC(y, m - 1, d, 12)
  for (let i = 0; i < 3; i++) {
    const ld = zonedLocalDate(new Date(guess), timeZone)
    if (ld === localDate) break
    const [ay, am, ad] = ld.split('-').map(Number)
    const target = Date.UTC(y, m - 1, d)
    const actual = Date.UTC(ay, am - 1, ad)
    guess += target - actual
  }
  const parts = zonedDateParts(new Date(guess), timeZone)
  const midnight = new Date(guess - (parts.hour * 3600 + parts.minute * 60) * 1000)
  if (zonedLocalDate(midnight, timeZone) === localDate) return midnight
  for (const delta of [86400000, -86400000]) {
    const alt = new Date(midnight.getTime() + delta)
    if (zonedLocalDate(alt, timeZone) === localDate) return alt
  }
  return midnight
}

/** MM-DD ±days anchored to a reference civil year (avoids fake leap-year 2020). */
export function monthDayAddDays(mmdd: string, days: number, referenceYear: number): string {
  const [m, d] = mmdd.split('-').map(Number)
  const anchor = `${referenceYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return calendarDateAddDays(anchor, days).slice(5)
}

export function isValidIanaTimezone(timeZone: string): boolean {
  if (!timeZone.trim()) return false
  try {
    Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

export function systemIanaTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
