import type { ActivityTense, UserActivityCategory, UserActivityContext } from './types'

export type TemporalFactRef = {
  subcategory: string
  summary: string
}

export type ParsedPlanWindow = {
  category: UserActivityCategory
  startDay: string
  endDay: string
  subcategory: string
}

const TRAVEL_KW = /旅游|出游|旅行|出差|航班|景点|酒店|度假|杭州|北京|上海|广州|深圳/i
const WORK_KW = /开会|项目|加班|上班|办公|ddl|deadline|赶工/i
const STUDY_KW = /考试|复习|备考|论文|上课/i

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** YYYY-MM-DD in local calendar */
export function toLocalDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function dayKeyToDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

function addDays(day: string, delta: number): string {
  const d = dayKeyToDate(day)
  d.setDate(d.getDate() + delta)
  return toLocalDayKey(d)
}

function inferCategory(summary: string): UserActivityCategory {
  if (TRAVEL_KW.test(summary)) return 'travel'
  if (STUDY_KW.test(summary)) return 'study'
  if (WORK_KW.test(summary)) return 'work'
  return 'travel'
}

function parseYmd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** 从单段文本解析起止日（本地日历日） */
export function parseDateRangeFromText(
  text: string,
  refYear: number,
  now = new Date()
): { start: string; end: string } | null {
  const t = text.trim()
  if (!t) return null

  const isoRange =
    t.match(
      /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*(?:日)?\s*(?:至|到|-|~|—)\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/i
    ) ??
    t.match(
      /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*(?:日)?\s*(?:至|到|-|~|—)\s*(\d{1,2})[-/.](\d{1,2})/i
    )
  if (isoRange) {
    const y1 = Number(isoRange[1])
    const m1 = Number(isoRange[2])
    const d1 = Number(isoRange[3])
    const y2 = isoRange[4] ? Number(isoRange[4]) : y1
    const m2 = Number(isoRange[isoRange[4] ? 5 : 4])
    const d2 = Number(isoRange[isoRange[4] ? 6 : 5])
    return { start: parseYmd(y1, m1, d1), end: parseYmd(y2, m2, d2) }
  }

  const cnRange = t.match(
    /(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(?:至|到|-|~|—)\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/
  )
  if (cnRange) {
    const m1 = Number(cnRange[1])
    const d1 = Number(cnRange[2])
    const m2 = Number(cnRange[3])
    const d2 = Number(cnRange[4])
    const y = refYear
    return { start: parseYmd(y, m1, d1), end: parseYmd(y, m2, d2) }
  }

  const cnSingle = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)
  if (cnSingle) {
    const day = parseYmd(refYear, Number(cnSingle[1]), Number(cnSingle[2]))
    return { start: day, end: day }
  }

  const base = toLocalDayKey(now)

  if (/明天/.test(t)) {
    const d = addDays(base, 1)
    return { start: d, end: d }
  }
  if (/后天/.test(t)) {
    const d = addDays(base, 2)
    return { start: d, end: d }
  }
  if (/下周/.test(t)) {
    return { start: addDays(base, 1), end: addDays(base, 7) }
  }

  return null
}

export function parsePlanWindowsFromFacts(
  facts: TemporalFactRef[],
  now = new Date()
): ParsedPlanWindow[] {
  const refYear = now.getFullYear()
  const out: ParsedPlanWindow[] = []

  for (const f of facts) {
    if (f.subcategory !== 'PLANS' && f.subcategory !== 'COMMITMENTS') continue
    const range = parseDateRangeFromText(f.summary, refYear, now)
    if (!range) continue
    let { start, end } = range
    if (start > end) [start, end] = [end, start]
    out.push({
      category: inferCategory(f.summary),
      startDay: start,
      endDay: end,
      subcategory: f.subcategory
    })
  }
  return out
}

export function tenseForPlanWindow(
  startDay: string,
  endDay: string,
  now = new Date()
): ActivityTense {
  const today = toLocalDayKey(now)
  if (today < startDay) return 'future'
  if (today > endDay) return 'past'
  return 'present'
}

const CATEGORY_LABEL: Record<UserActivityCategory, string> = {
  rest: '休息',
  work: '工作',
  study: '学习',
  travel: '出游',
  social: '社交',
  entertainment: '娱乐',
  daily: '日常',
  health: '健康',
  unknown: '未知'
}

const TENSE_LABEL: Record<ActivityTense, string> = {
  future: '将来',
  present: '进行中',
  past: '刚结束'
}

function buildLabel(category: UserActivityCategory, tense: ActivityTense): string {
  return `${CATEGORY_LABEL[category]}·${TENSE_LABEL[tense]}`
}

type ScoredWindow = ParsedPlanWindow & { tense: ActivityTense; score: number }

function scoreWindow(w: ParsedPlanWindow, tense: ActivityTense, today: string): number {
  if (tense === 'present') return 100
  if (tense === 'future') {
    const daysUntil = Math.max(0, dayKeyToDate(w.startDay).getTime() - dayKeyToDate(today).getTime()) / 86400000
    return daysUntil <= 7 ? 85 - daysUntil : 50
  }
  const daysSince = Math.max(0, dayKeyToDate(today).getTime() - dayKeyToDate(w.endDay).getTime()) / 86400000
  return daysSince <= 3 ? 40 - daysSince : 0
}

/** CTX-B：从 PLANS/COMMITMENTS 日期窗推断 activity（优先于纯关键词） */
export function resolveActivityFromTemporalFacts(
  facts: TemporalFactRef[],
  now = new Date()
): UserActivityContext | null {
  const windows = parsePlanWindowsFromFacts(facts, now)
  if (windows.length === 0) return null

  const today = toLocalDayKey(now)
  const scored: ScoredWindow[] = windows
    .map((w) => {
      const tense = tenseForPlanWindow(w.startDay, w.endDay, now)
      return { ...w, tense, score: scoreWindow(w, tense, today) }
    })
    .filter((w) => w.score > 0)
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (!best) return null

  const corpus = facts.map((f) => f.summary).join(' ')
  const explicitDates = /\d{1,2}\s*月|\d{4}[-/]/.test(corpus)

  let confidence = best.tense === 'present' ? 0.88 : best.tense === 'future' ? 0.82 : 0.72
  if (!explicitDates) confidence -= 0.08

  return {
    category: best.category,
    tense: best.tense,
    label: buildLabel(best.category, best.tense),
    confidence: Math.round(confidence * 100) / 100,
    source: [`memory:${best.subcategory}`, 'ctx-b:date_window']
  }
}
