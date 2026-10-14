import { calendarDateAddDays, weekdayFromCalendarDate, zonedDateParts, zonedLocalDate } from './zonedDate.js'

export type RelativeDayOffset = number

export type RelativeMentionKind = 'plan' | 'past'

export interface RelativeMention {
  /** 本地 civil YYYY-MM-DD（绑定 observedAt + timezone，不是解析时 wall clock） */
  localDate: string
  /**
   * plan = 未来/当天计划短语（明天/后天/下周/下周三/N天后），可写入事件 scheduledFor；
   * past = 过去发生短语（昨天/上周/N天前/去年），不是计划时间，不得写入 scheduledFor。
   */
  kind: RelativeMentionKind
  /** Whole-calendar-year mention; never pretend it occurred on one exact day. */
  range?: { fromLocalDate: string; toLocalDate: string }
}

const WEEKDAY_CN: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0
}

const CHINESE_DIGIT: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10
}

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

/** 单日/整周偏移的 kind：负偏移为 past，非负为 plan（“今天”按当天计划处理）。 */
function offsetKind(offset: RelativeDayOffset): RelativeMentionKind {
  return offset < 0 ? 'past' : 'plan'
}

/**
 * 匹配"下周X"（下一个自然周的指定星期）。
 * 语义契约：下一个自然周（周一至周日）的星期X。
 * 与笼统"下周"（=下一个自然周同一天，+7）正交："下周三"不被"下周"规则吞掉。
 * 兼容写法：下周三 / 下星期三 / 下个星期三。
 */
function matchNextWeekday(text: string): number | null {
  const m = text.match(/下(?:个)?(?:星期|周)([一二三四五六日天])/)
  if (!m) return null
  return WEEKDAY_CN[m[1]] ?? null
}

/** "N天前"（past）/ "N天后"（plan）；支持阿拉伯数字与中文数字（三天/3天）。 */
function matchNDays(text: string): { offset: number; kind: RelativeMentionKind } | null {
  const before = text.match(/([0-9]+|[一二两三四五六七八九十])\s*天前/)
  if (before) {
    const raw = before[1]
    const n = /[0-9]/.test(raw) ? Number.parseInt(raw, 10) : (CHINESE_DIGIT[raw] ?? null)
    if (n !== null && Number.isFinite(n)) return { offset: -n, kind: 'past' }
  }
  const after = text.match(/([0-9]+|[一二两三四五六七八九十])\s*天后/)
  if (after) {
    const raw = after[1]
    const n = /[0-9]/.test(raw) ? Number.parseInt(raw, 10) : (CHINESE_DIGIT[raw] ?? null)
    if (n !== null && Number.isFinite(n)) return { offset: n, kind: 'plan' }
  }
  return null
}

/** "去年" = 去年同日（过去范围的起点，past）。 */
function matchLastYear(text: string, base: string): RelativeMention | null {
  if (!/去年/.test(text)) return null
  const year = Number(base.slice(0, 4)) - 1
  const fromLocalDate = `${year}-01-01`
  return {
    localDate: fromLocalDate,
    kind: 'past',
    range: { fromLocalDate, toLocalDate: `${year}-12-31` }
  }
}

/**
 * 解析文本中的相对时间短语，返回本地日期与计划/过去分类。
 * - 先匹配特异性规则（下周X、N天前/后天、去年），再匹配笼统单日/整周规则；
 * - 整周"下周"语义固定为"下一个自然周同一天（+7 天）"，不是一个范围。
 * 未命中任何短语返回 null。
 */
export function resolveRelativeMention(
  text: string,
  observedAt: string | Date,
  timeZone: string
): RelativeMention | null {
  const normalized = text.trim()
  if (!normalized) return null
  const instant = observedAt instanceof Date ? observedAt : new Date(observedAt)
  if (Number.isNaN(instant.getTime())) return null
  const base = zonedLocalDate(instant, timeZone)

  const nextWeekday = matchNextWeekday(normalized)
  if (nextWeekday !== null) {
    const baseWeekday = weekdayFromCalendarDate(base)
    const daysUntilNextMonday = ((8 - baseWeekday) % 7) || 7
    const dayWithinNextWeek = nextWeekday === 0 ? 6 : nextWeekday - 1
    const offset = daysUntilNextMonday + dayWithinNextWeek
    return { localDate: calendarDateAddDays(base, offset), kind: 'plan' }
  }

  const nDays = matchNDays(normalized)
  if (nDays) return { localDate: calendarDateAddDays(base, nDays.offset), kind: nDays.kind }

  const lastYear = matchLastYear(normalized, base)
  if (lastYear) return lastYear

  const offset = parseRelativeDayOffset(normalized)
  if (offset === null) return null
  return { localDate: calendarDateAddDays(base, offset), kind: offsetKind(offset) }
}

/** Bind relative phrases to observedAt instant + IANA zone (never job wall clock). */
export function resolveRelativeLocalDate(
  text: string,
  observedAt: string | Date,
  timeZone: string
): string | null {
  return resolveRelativeMention(text, observedAt, timeZone)?.localDate ?? null
}

// weekdayFromCalendarDate 重导出供测试/调用方复用星期锚计算
export { weekdayFromCalendarDate, zonedDateParts }
