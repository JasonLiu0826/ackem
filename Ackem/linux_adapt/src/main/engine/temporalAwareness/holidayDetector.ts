// [temporalAwareness/holidayDetector] — 节假日检测
// 职责：三种策略检测今天是否是节日（公历固定/公历浮动/农历预计算）
// 纯函数，零 I/O，零外部依赖，<0.2ms
// 设计文档：docs/plan/时间敏感主动记忆系统设计_6_11.md §3.1 源4

// ═══ ① 公历固定节日 ═══
const STATIC_HOLIDAYS: Record<string, string> = {
  '01-01': '元旦',
  '02-14': '情人节',
  '03-08': '国际妇女节',
  '04-01': '愚人节',
  '05-01': '劳动节',
  '05-20': '520',
  '05-21': '521',
  '06-01': '儿童节',
  '10-01': '国庆节',
  '11-11': '光棍节',
  '12-24': '平安夜',
  '12-25': '圣诞节',
  '12-31': '跨年夜',
}

// ═══ ② 农历节日预计算 (2026-2030) ═══
const LUNAR_HOLIDAYS: Record<string, Record<string, string>> = {
  '2026': { '02-17': '春节', '02-22': '元宵节', '05-31': '端午节', '08-19': '七夕', '10-04': '中秋节' },
  '2027': { '02-06': '春节', '02-11': '元宵节', '05-20': '端午节', '08-08': '七夕', '09-23': '中秋节' },
  '2028': { '01-26': '春节', '01-31': '元宵节', '05-08': '端午节', '07-28': '七夕', '09-11': '中秋节' },
  '2029': { '02-13': '春节', '02-18': '元宵节', '05-28': '端午节', '08-17': '七夕', '10-01': '中秋节' },
  '2030': { '02-03': '春节', '02-08': '元宵节', '05-17': '端午节', '08-06': '七夕', '09-19': '中秋节' },
}

// ═══ ③ 公历浮动节日 ═══
function nthSundayOfMonth(year: number, month: number, n: number): number {
  const first = new Date(year, month - 1, 1)
  const dayOfWeek = first.getDay()
  return 1 + 7 * (n - 1) + ((7 - dayOfWeek) % 7)
}

function getFloatingHoliday(year: number, month: number, day: number): string | null {
  if (month === 5 && day === nthSundayOfMonth(year, 5, 2)) return '母亲节'
  if (month === 6 && day === nthSundayOfMonth(year, 6, 3)) return '父亲节'
  return null
}

// ═══ 公开 API ═══

export interface HolidayInfo {
  /** 节日 key（如 '元旦'、'春节'），显示时用 t(key) 翻译 */
  key: string
  category: 'traditional' | 'western' | 'social' | 'family'
}

export function detectHoliday(today: Date): HolidayInfo | null {
  const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const year = String(today.getFullYear())

  // ① 公历固定
  const staticH = STATIC_HOLIDAYS[mmdd]
  if (staticH) return { key: staticH, category: categorizeHoliday(staticH) }

  // ② 公历浮动
  const floating = getFloatingHoliday(today.getFullYear(), today.getMonth() + 1, today.getDate())
  if (floating) return { key: floating, category: 'family' }

  // ③ 农历
  const lunar = LUNAR_HOLIDAYS[year]?.[mmdd]
  if (lunar) return { key: lunar, category: 'traditional' }

  return null
}

function categorizeHoliday(name: string): HolidayInfo['category'] {
  if (['元旦', '国庆节'].includes(name)) return 'traditional'
  if (['情人节', '圣诞节', '平安夜', '跨年夜'].includes(name)) return 'western'
  if (['520', '521', '光棍节'].includes(name)) return 'social'
  if (['母亲节', '父亲节', '儿童节', '国际妇女节'].includes(name)) return 'family'
  return 'traditional'
}
