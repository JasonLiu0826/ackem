const MONTH_DAY_RE = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/
const BIRTHDAY_KW = /生日|birthday|生日期|诞辰/i
const EXISTING_BIRTHDAY_RE = /生日|birthday/i

export type ParsedBirthday = { month: number; day: number; raw: string }

export function parseBirthdayFromMessage(message: string): ParsedBirthday | null {
  const m = message.match(MONTH_DAY_RE)
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { month, day, raw: m[0]! }
}

export function messageMentionsBirthday(message: string): boolean {
  return BIRTHDAY_KW.test(message)
}

export function memoryHasBirthday(summaries: string[]): boolean {
  return summaries.some((s) => EXISTING_BIRTHDAY_RE.test(s) && MONTH_DAY_RE.test(s))
}

export function formatBirthdayFact(parsed: ParsedBirthday): string {
  return `用户生日：${parsed.month}月${parsed.day}日（对话解析）`
}
