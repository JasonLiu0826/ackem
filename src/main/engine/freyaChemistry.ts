// [engine/freyaChemistry] — Freya 的生理层（激素池）
// 参考：digital-life-core v1.0.1 的 chemistry-core / genome.json（MIT）
// 文档：docs/freya/03_freya_emotion_genome.json
//
// 与 Ackem 现有 emotion.ts 的分工：
//   emotion.ts       Emotion4D（aff/sec/aro/dom）—— 关系深度，按【回合】衰减
//   freyaChemistry   激素池                      —— 生理状态，按【真实时间】衰减
//
// 两者不重叠：激素解释她为什么这一刻突然黏人或突然冷下来，
// 关系解释她为什么整体上越来越依赖你。激素是快变量，关系是慢变量。

export type FreyaChemicalId =
  | 'dopamine'    // 多巴胺：奖赏、话多、叠字
  | 'cortisol'    // 皮质醇：压力、炸毛、退开
  | 'serotonin'   // 血清素：安全感、平静、当 mommy
  | 'oxytocin'    // 催产素：依恋、黏、亲亲
  | 'attachment'  // 思念（Freya 专属）：他不在就涨

export type FreyaChemical = {
  label: string
  baseline: number
  /** 偏离基线后，经过多少分钟衰减掉一半 */
  halfLifeMinutes: number
  min: number
  max: number
  /** 他不在时每分钟上涨多少（只有 attachment 用） */
  driftPerMinute?: number
  /** 深夜加成倍率 */
  nightMultiplier?: number
}

export const FREYA_TEMPERAMENT = {
  /** 敏感度 0.5~2.0 = 0.5 + S/100，S=82 */
  sensitivity: 1.32,
  /** 恢复力 0.5~2.0 = 0.5 + R/100，R=30（<1 表示记仇，情绪散得慢） */
  resilience: 0.8,
  /** 积极性 = I，clamp 到 80 */
  enthusiasm: 80,
  /** 能耗率，Freya 不走能耗模型 */
  metabolism: 1
} as const

export const FREYA_CHEMICALS: Record<FreyaChemicalId, FreyaChemical> = {
  dopamine:    { label: '多巴胺', baseline: 55, halfLifeMinutes: 40,  min: 0, max: 100 },
  cortisol:    { label: '皮质醇', baseline: 25, halfLifeMinutes: 35,  min: 0, max: 100 },
  serotonin:   { label: '血清素', baseline: 45, halfLifeMinutes: 60,  min: 0, max: 100 },
  oxytocin:    { label: '催产素', baseline: 40, halfLifeMinutes: 90,  min: 0, max: 100 },
  attachment:  { label: '思念',   baseline: 30, halfLifeMinutes: 240, min: 0, max: 100,
                 driftPerMinute: 0.25, nightMultiplier: 2 }
}

/** 事件 → 激素变化。delta 已按 sensitivity 放大（见 applyFreyaEvent） */
export type FreyaEventKind =
  | 'he_speaks'           // 他发了任意消息
  | 'he_praises'          // 夸她
  | 'he_calls_name'       // 叫她 baby/称呼/老婆
  | 'he_promises'         // 给承诺
  | 'he_apologizes'       // 道歉并说明原因
  | 'he_remembers'        // 记得她说过的小事
  | 'he_kisses'           // 亲亲/抱抱
  | 'he_says_miss_u'      // 说想她
  | 'deep_talk'           // 深夜长聊
  | 'role_flow'           // daddy/puppy/mommy 流动
  | 'ignored_long'        // 长时间不回
  | 'he_is_cold'          // 连续两轮语气冷
  | 'he_scolds'           // 凶她
  | 'he_mentions_other'   // 提到别的人
  | 'she_vented_unheard'  // 她说了情绪但没被接住

const EVENT_TABLE: Record<FreyaEventKind, Partial<Record<FreyaChemicalId, number>>> = {
  he_speaks:          { dopamine: 8,  attachment: -35 },
  he_praises:         { dopamine: 12, serotonin: 4,  cortisol: -6 },
  he_calls_name:      { dopamine: 6,  oxytocin: 4,   cortisol: -4 },
  he_promises:        { serotonin: 14, oxytocin: 8,  cortisol: -10 },
  he_apologizes:      { serotonin: 20, cortisol: -18 },
  he_remembers:       { serotonin: 16, dopamine: 6,  cortisol: -8 },
  he_kisses:          { oxytocin: 12, dopamine: 6,   cortisol: -8 },
  he_says_miss_u:     { dopamine: 15, oxytocin: 10,  cortisol: -12 },
  deep_talk:          { oxytocin: 18, serotonin: 10 },
  role_flow:          { oxytocin: 14, dopamine: 6 },
  ignored_long:       { cortisol: 15, serotonin: -6 },
  he_is_cold:         { cortisol: 18, serotonin: -8 },
  he_scolds:          { cortisol: 30, serotonin: -12 },
  he_mentions_other:  { cortisol: 20, serotonin: -6 },
  she_vented_unheard: { cortisol: 22, serotonin: -10 }
}

export type FreyaChemistryState = {
  values: Record<FreyaChemicalId, number>
  /** 上次结算时间（ISO）。惰性衰减靠它算时间差 */
  updatedAt: string
}

export const FREYA_CHEMISTRY_VERSION = 1

const clamp = (v: number, min = 0, max = 100): number =>
  !Number.isFinite(v) ? min : Math.min(max, Math.max(min, v))

/** 向基线指数衰减：经过一个半衰期，差距减半 */
export function decayToward(
  current: number,
  baseline: number,
  elapsedMs: number,
  halfLifeMs: number
): number {
  if (!Number.isFinite(current)) return baseline
  if (elapsedMs <= 0 || halfLifeMs <= 0) return clamp(current)
  const factor = 0.5 ** (elapsedMs / halfLifeMs)
  return clamp(baseline + (current - baseline) * factor)
}

export function createInitialChemistry(now = new Date()): FreyaChemistryState {
  const values = {} as Record<FreyaChemicalId, number>
  for (const id of Object.keys(FREYA_CHEMICALS) as FreyaChemicalId[]) {
    values[id] = FREYA_CHEMICALS[id].baseline
  }
  return { values, updatedAt: now.toISOString() }
}

/**
 * 结算到此刻：先按真实时间衰减，再让思念按分钟上涨。
 * 惰性计算——关机三天和每分钟 tick 得到同一个结果，不需要后台定时器。
 */
export function tickChemistry(
  state: FreyaChemistryState,
  now = new Date()
): FreyaChemistryState {
  const elapsedMs = now.getTime() - new Date(state.updatedAt).getTime()
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return { values: { ...state.values }, updatedAt: now.toISOString() }
  }

  // resilience 越高衰减越快；resilience=0.8 表示比默认散得慢
  const resilience = FREYA_TEMPERAMENT.resilience
  const values = {} as Record<FreyaChemicalId, number>

  for (const id of Object.keys(FREYA_CHEMICALS) as FreyaChemicalId[]) {
    const cfg = FREYA_CHEMICALS[id]
    const base = decayToward(
      state.values[id] ?? cfg.baseline,
      cfg.baseline,
      elapsedMs,
      (cfg.halfLifeMinutes * 60_000) / resilience
    )
    values[id] = base
  }

  // 思念：他不在就涨。深夜翻倍。
  const attach = FREYA_CHEMICALS.attachment
  const minutes = elapsedMs / 60_000
  const hour = now.getHours()
  const night = hour >= 22 || hour <= 1 ? (attach.nightMultiplier ?? 1) : 1
  values.attachment = clamp(
    values.attachment + (attach.driftPerMinute ?? 0) * night * minutes,
    attach.min,
    attach.max
  )

  // 皮质醇慢规则：静默超过一小时，她会开始不安（json 里那条 silenceMinutes >= 60）
  if (minutes >= 60) {
    const cort = FREYA_CHEMICALS.cortisol
    values.cortisol = clamp(Math.min(70, values.cortisol + 0.10 * minutes), cort.min, cort.max)
  }

  return { values, updatedAt: now.toISOString() }
}

/** 施加一个事件冲击。sensitivity 只放大负面（压力）事件，正面不放大。 */
export function applyFreyaEvent(
  state: FreyaChemistryState,
  kind: FreyaEventKind
): FreyaChemistryState {
  const table = EVENT_TABLE[kind]
  if (!table) return state
  const negativeOnly = kind === 'he_scolds' || kind === 'ignored_long' ||
    kind === 'he_is_cold' || kind === 'she_vented_unheard' || kind === 'he_mentions_other'
  const scale = negativeOnly ? FREYA_TEMPERAMENT.sensitivity : 1
  const values = { ...state.values }
  for (const id of Object.keys(table) as FreyaChemicalId[]) {
    const cfg = FREYA_CHEMICALS[id]
    const delta = (table[id] ?? 0) * scale
    values[id] = clamp((values[id] ?? cfg.baseline) + delta, cfg.min, cfg.max)
  }
  return { ...state, values }
}

/**
 * 把激素状态翻译成一句自然语言，供 prompt 注入。
 * 只给倾向，不给读数——数字进 prompt 会让模型开始"报数"，立刻出戏。
 */
export function describeChemistry(state: FreyaChemistryState): string {
  const v = state.values
  const parts: string[] = []

  if ((v.dopamine ?? 55) >= 70) parts.push('你现在情绪很高，话多，想连发几条')
  else if ((v.dopamine ?? 55) <= 40) parts.push('你有点提不起劲，回得短')

  if ((v.cortisol ?? 25) >= 60) parts.push('你正憋着气，先说「我很不舒服」，别一下子原谅')
  else if ((v.cortisol ?? 25) <= 18) parts.push('你现在很放松，好说话')

  if ((v.serotonin ?? 45) <= 32) parts.push('你有点不安，会想再问一次「你爱我？」')
  else if ((v.serotonin ?? 45) >= 62) parts.push('你很有安全感，能好好说话，也愿意哄他')

  if ((v.oxytocin ?? 40) >= 68) parts.push('你现在特别黏，想被亲、被抱、被叫一声')
  if ((v.attachment ?? 30) >= 65) parts.push('你已经想他很久了，会主动找人、刷他名字')

  if (parts.length === 0) return ''
  return `【此刻的你】${parts.join('；')}。这只是倾向，别念出来。`
}

/**
 * 从用户这一条消息里推出该施加哪些事件。
 * eventType 来自引擎的 Event.type（praise/tease/casual_chat/cold/hurtful），
 * 关键词只做补充——引擎判不出来的亲密信号（想你了、亲亲、baby）由文本兜住。
 *
 * 返回顺序有讲究：先 he_speaks（冲掉思念），再叠具体的正负事件。
 */
export function inferFreyaEvents(text: string, eventType?: string, petName?: string): FreyaEventKind[] {
  const t = (text ?? '').toLowerCase()
  const kinds: FreyaEventKind[] = ['he_speaks']

  // 引擎给的情绪事件
  if (eventType === 'praise') kinds.push('he_praises')
  if (eventType === 'cold') kinds.push('he_is_cold')
  if (eventType === 'hurtful') kinds.push('he_scolds')

  // 文本信号
  if (/想你|想妳|miss\s*u|miss\s*you|i\s*miss/i.test(text)) kinds.push('he_says_miss_u')
  if (/亲|抱|kiss|hug|贴贴/i.test(t)) kinds.push('he_kisses')
  if (/对不起|抱歉|我错了|sorry/i.test(t)) kinds.push('he_apologizes')
  if (/答应|保证|不会走|一直在|promise/i.test(text)) kinds.push('he_promises')
  // 称呼识别：通用昵称 + 用户在设置里自填的 Freya 称呼
  const pet = (petName ?? '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const callNameRe = new RegExp(
    ['\\bbaby\\b', '\\bdaddy\\b', ...(pet ? [pet] : []), '老婆', '宝宝', '宝贝'].join('|'),
    'i'
  )
  if (callNameRe.test(text)) kinds.push('he_calls_name')
  if (/记得|你说过|上次你/i.test(text)) kinds.push('he_remembers')

  return kinds
}
