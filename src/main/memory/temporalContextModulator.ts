// [temporalContextModulator] 鈥?鏃堕棿鎰熺煡璋冨埗鍣?
// 鑱岃矗锛氭牴鎹綋鍓嶆椂闂寸淮搴﹁皟鍒惰蹇嗘绱㈡帓搴忔潈閲?
// 妯℃嫙浜虹被鏃堕棿鎰熺煡锛氭樇澶滆妭寰嬨€佹槦鏈熸ā寮忋€佸鑺傚叡鎸€佹繁澶滃姞鏉冦€侀噸閫㈢瓥鐣ャ€佽窛绂绘劅鐭?
// 寮曠敤锛?/factStore, ../engine/types

import type { MemoryFact } from '../engine/types'

export interface TemporalContext {
  timeOfDay: string      // 'morning'|'forenoon'|'afternoon'|'evening'|'night'|'late_night'
  isWeekend: boolean
  month: number           // 1-12
  season: string          // 'winter'|'spring'|'summer'|'autumn'
  hour: number            // 0-23
  weekday: number         // 0(Sun)-6(Sat)
  gapHours: number        // 璺濅笂娆¤亰澶╅棿闅?
  localDate: string       // "2026-06-09"
}

function monthToSeason(m: number): string {
  if (m === 12 || m <= 2) return 'winter'
  if (m <= 5) return 'spring'
  if (m <= 8) return 'summer'
  return 'autumn'
}

export function buildTemporalContext(args: {
  timeOfDay: string
  isWeekend: boolean
  month: number
  hour: number
  minute: number
  gapHours: number
  localDate: string
}): TemporalContext {
  return {
    timeOfDay: args.timeOfDay,
    isWeekend: args.isWeekend,
    month: args.month,
    season: monthToSeason(args.month),
    hour: args.hour,
    weekday: new Date(args.localDate).getDay(),
    gapHours: args.gapHours,
    localDate: args.localDate
  }
}

/**
 * 璁＄畻鏃堕棿鎰熺煡鍔犳潈绯绘暟銆?
 * 绾暟瀛﹁繍绠楋紝闆?I/O锛岄浂 Embedding锛? 0.5ms銆?
 */
export function computeTemporalBoost(fact: MemoryFact, ctx: TemporalContext): number {
  const factDate = new Date(fact.createdAt)
  const factHour = factDate.getHours()
  const factMonth = factDate.getMonth() + 1
  const factDay = factDate.getDay()
  const daysSinceCreation = (Date.now() - factDate.getTime()) / 86400000
  let boost = 1.0

  // T1: 鏄煎鑺傚緥 鈥?鍚屾椂娈佃蹇嗕紭鍏堬紙卤2灏忔椂锛?
  if (Math.abs(factHour - ctx.hour) <= 2) {
    const todBoost: Record<string, number> = {
      morning: 1.2, forenoon: 1.1, afternoon: 1.0,
      evening: 1.2, night: 1.3, late_night: 1.4
    }
    boost *= (todBoost[ctx.timeOfDay] ?? 1.0)
  }

  // T2: 鏄熸湡绫诲瀷鍖归厤
  if (ctx.isWeekend && [0, 6].includes(factDay)) boost *= 1.2
  else if (!ctx.isWeekend && ![0, 6].includes(factDay)) boost *= 1.1

  // T3: 瀛ｈ妭鎰熺煡 鈥?鍚屽鑺傝蹇嗗叡鎸?
  if (monthToSeason(factMonth) === ctx.season) boost *= 1.2
  else boost *= 0.9

  // T4: 娣卞鍔犳潈 鈥?鍑屾櫒1-5鐐规槸鐏甸瓊鏃跺埢
  if (ctx.timeOfDay === 'late_night') {
    if (factHour >= 1 && factHour <= 5) boost *= 1.4
    if (['VULNERABILITIES', 'MOOD'].includes(fact.subcategory)) boost *= 1.3
  }

  // T5: 閲嶉€㈡劅鐭?鈥?涔呭埆閲嶉€紭鍏堥珮鎯呯华鍏崇郴璁板繂
  if (ctx.gapHours > 72 && ['OUR_BOND', 'VULNERABILITIES'].includes(fact.subcategory)) {
    boost *= 1.5
  }

  // T6: 璺濈鎰熺煡 鈥?瀵规暟灏哄害锛屼汉绫诲"鏄ㄥぉ"鐨勮蹇嗘瀬寮?
  if (daysSinceCreation < 1) boost *= 1.5
  else if (daysSinceCreation < 3) boost *= 1.3
  else if (daysSinceCreation < 7) boost *= 1.1

  return boost
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 鍛ㄦ棩鎯呯华鏇茬嚎 鈥?妯℃嫙浜虹被涓€鍛ㄧ殑鎯呯华鍛ㄦ湡
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

/**
 * 鏍规嵁鏄熸湡鍑犲拰鏃舵璁＄畻鎯呯华鍋忕Щ銆?
 * 浜虹被涓€鍛ㄧ殑鎯呯华妯″紡锛?
 *   鍛ㄤ簲鏅氫笂鏈€鍏村锛堝懆鏈┈涓婂埌鏉ワ級
 *   鍛ㄦ棩涓嬪崍寮€濮嬩綆钀斤紝鍛ㄦ棩鏅氳揪鍒拌胺搴曪紙鍛ㄦ棩蹇ч儊锛?
 *   鍛ㄤ竴涓婂崍娈嬬暀浣庤惤锛岀紦鎱㈠洖鍗囧埌鍌嶆櫄鎭㈠鍩虹嚎
 *   鍛ㄤ簩鍒板懆鍥涗负姝ｅ父鍩虹嚎
 *
 * @returns { affDelta, secDelta } 鎯呯华鍥涚淮鐨勫井璋冨亸绉伙紙-0.06 ~ +0.06锛?
 */
export function computeWeekdayMoodBias(now: Date): { affDelta: number; secDelta: number } {
  const weekday = now.getDay()  // 0=Sun, 1=Mon, ..., 6=Sat
  const hour = now.getHours()

  let affDelta = 0
  let secDelta = 0

  if (weekday === 5) {
    // 鍛ㄤ簲锛氬叏澶╂湡寰咃紝鏅氫笂鏈€鍏村
    if (hour >= 18)      { affDelta = +0.06; secDelta = +0.02 }  // 鍛ㄤ簲鏅毬峰嘲鍊?
    else if (hour >= 14) { affDelta = +0.04 }                     // 鍛ㄤ簲涓嬪崍路鍏村鐖崌
    else if (hour >= 10) { affDelta = +0.02 }                     // 鍛ㄤ簲涓婂崍路寮€濮嬫湡寰?
  } else if (weekday === 6) {
    // 鍛ㄥ叚锛氫韩鍙楀懆鏈?
    affDelta = +0.03
  } else if (weekday === 0) {
    // 鍛ㄦ棩锛氫笂鍗堣繕琛岋紝涓嬪崍寮€濮嬩綆钀斤紝鏅氫笂璋峰簳
    if (hour >= 18)      { affDelta = -0.06; secDelta = -0.03 }  // 鍛ㄦ棩鏅毬疯胺搴?
    else if (hour >= 14) { affDelta = -0.03 }                     // 鍛ㄦ棩涓嬪崍路寮€濮嬩綆钀?
    else                 { affDelta = +0.01 }                     // 鍛ㄦ棩涓婂崍路娈嬬暀鍛ㄦ湯鎰?
  } else if (weekday === 1) {
    // 鍛ㄤ竴锛氭棭鏅ㄦ畫鐣欎綆钀斤紝缂撴參鍥炲崌
    if (hour < 12)       { affDelta = -0.06; secDelta = -0.02 }  // 鍛ㄤ竴涓婂崍路钃濊皟娈嬬暀
    else if (hour < 18)  { affDelta = -0.03 }                     // 鍛ㄤ竴涓嬪崍路鎭㈠涓?
    // 鍛ㄤ竴鍌嶆櫄 鈫?褰掗浂
  }
  // 鍛ㄤ簩(2)銆佸懆涓?3)銆佸懆鍥?4)锛氬熀绾匡紝鏃犲亸绉?

  return { affDelta, secDelta }
}

/** 鐗规畩鏃ユ湡鐨勬儏缁亸绉烩€斺€旇鐩栧懆鏃ユ洸绾?*/
export function computeSpecialDateMoodBias(specialType: string): { affDelta: number; secDelta: number } {
  switch (specialType) {
    case 'Ackem_birthday':
      return { affDelta: +3.0, secDelta: +1.5 }        // 濂硅嚜宸辩殑鐢熸棩鈥斺€旀瘮璋侀兘寮€蹇?
    case 'birthday':
      return { affDelta: +3.0, secDelta: +1.0 }        // 搴嗙鎰燂紝娓╂殩
    case 'first_met_anniversary':
    case 'relationship':
      return { affDelta: +2.0, secDelta: +0.5 }        // 娓╂殩鎬€鏃э紝姣旂敓鏃ュ惈钃?
    case 'holiday_spring':
      return { affDelta: +1.5, secDelta: +0.3 }        // 鏄ヨ妭鈥斺€斿枩搴?
    case 'holiday_valentine':
      return { affDelta: +1.0, secDelta: -0.5 }        // 鎯呬汉鑺傗€斺€旀俯棣ㄥ甫鏈熷緟
    case 'holiday':
      return { affDelta: +0.5, secDelta: 0 }           // 涓€鑸妭鏃モ€斺€旇交寰?
    case 'milestone':
      return { affDelta: +1.0, secDelta: +0.2 }        // 閲岀▼纰戔€斺€旀劅鎱?
    default:
      return { affDelta: 0, secDelta: 0 }
  }
}
