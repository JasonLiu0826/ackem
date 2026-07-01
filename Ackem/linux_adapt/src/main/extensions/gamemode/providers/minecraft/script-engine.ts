// [gaming/script-engine] — MC 脚本模板引擎
// 职责：根据事件+人格+情绪选反应模板（变体去重 + 彩蛋随机）
// 引用：./types, ./mc-templates

import type {
  EmotionGroup, EngineStateForGaming, McGameEvent,
  PersonalityReactions, ReactionResult, ScriptReaction, TemplateLibrary
} from './types'
import { TEMPLATES } from './mc-templates'

/** 最近用过的变体缓存（key = event+personality，value = 最近3条文本） */
const recentCache = new Map<string, string[]>()

/** 彩蛋触发记录（key = event+personality+session，value = 本次会话已触发过） */
const easterEggCache = new Map<string, boolean>()

/** 首次事件记录 */
const firstTimeCache = new Set<string>()

function cacheKey(event: string, personality: string): string {
  return `${event}::${personality}`
}

/**
 * 根据引擎状态判定情绪分组
 */
export function classifyEmotion(state: EngineStateForGaming): EmotionGroup {
  if (state.aff < -15 || state.sec < -20) return 'NEGATIVE'
  if (state.aro > 40 || state.aff > 45) return 'AROUSED'
  return 'CALM'
}

/**
 * 选择一条反应模板
 * @returns 选中的文本 + 是否彩蛋 + 情绪分组
 */
export function selectReaction(
  event: McGameEvent,
  state: EngineStateForGaming
): ReactionResult {
  const emotion = classifyEmotion(state)
  const personality = state.personalityId

  // 1. 查找模板
  const reactions = lookupTemplate(event.type, personality, emotion)

  // 2. 彩蛋判定
  const easterEgg = tryEasterEgg(event.type, personality, state, reactions)

  // 3. 选变体（去重）
  const key = cacheKey(event.type, personality)
  const text = pickVariant(easterEgg ?? reactions, key)

  // 4. 更新缓存
  pushRecent(key, text)

  return { text, isEasterEgg: easterEgg !== null, emotionGroup: emotion }
}

/** 事件别名（文档键名 → 已实现模板键） */
const EVENT_ALIASES: Record<string, string> = {
  'mc:player_diamond': 'mc:diamond_found',
  'mc:player_build_complete': 'mc:build_complete',
  'mc:player_beacon': 'mc:beacon_activate',
  'mc:player_ice_boat': 'mc:ice_boat',
  'mc:dimension_enter': 'mc:portal_enter',
}

/** 人格 ID 别名（预设 → 模板库） */
const PERSONALITY_ALIASES: Record<string, string> = {
  artistic: 'artistic_soul',
  bokke: 'bokke',
}

function resolveEventType(eventType: string): string {
  return EVENT_ALIASES[eventType] ?? eventType
}

function resolvePersonality(personality: string): string {
  return PERSONALITY_ALIASES[personality] ?? personality
}

/** 查找模板：事件→人格→情绪组，逐级 fallback */
function lookupTemplate(
  eventType: string,
  personality: string,
  emotion: EmotionGroup
): ScriptReaction {
  const event = resolveEventType(eventType)
  const person = resolvePersonality(personality)

  // 精确匹配
  const exact = TEMPLATES[event]?.[person]?.[emotion]
  if (exact && exact.variants.length >= 3) return exact

  // 同一事件其他情绪组
  const evt = TEMPLATES[event]
  if (evt?.[person]) {
    for (const grp of [emotion, 'CALM', 'AROUSED', 'NEGATIVE'] as EmotionGroup[]) {
      const r = evt[person][grp]
      if (r && r.variants.length >= 3) return r
    }
  }

  // 同事件任意人格
  if (evt) {
    for (const pid of Object.keys(evt)) {
      for (const grp of ['CALM', 'AROUSED', 'NEGATIVE'] as EmotionGroup[]) {
        const r = evt[pid][grp]
        if (r && r.variants.length >= 3) return r
      }
    }
  }

  // 兜底：通用反应
  return FALLBACK_REACTIONS[emotion]
}

/** 判定是否触发彩蛋 */
function tryEasterEgg(
  event: string,
  personality: string,
  state: EngineStateForGaming,
  reactions: ScriptReaction
): ScriptReaction | null {
  if (reactions.easterEggs.length === 0) return null

  const ek = cacheKey(event, personality)
  if (easterEggCache.has(ek)) return null // 本次会话已触发

  // 计算触发概率
  let chance = 0.08
  if (!firstTimeCache.has(ek)) {
    chance = 1.0 // 首次必触发
    firstTimeCache.add(ek)
  } else if (state.trust > 90 && state.stage === 'INTIMATE') {
    chance = 0.25
  } else if (state.trust > 70 && state.aff > 50) {
    chance = 0.15
  }

  if (Math.random() < chance) {
    easterEggCache.set(ek, true)
    return reactions
  }

  return null
}

/** 从变体池中选一条（排除最近 3 次用过的） */
function pickVariant(reactions: ScriptReaction, key: string): string {
  const recent = recentCache.get(key) ?? []
  const candidates = reactions.variants.filter(v => !recent.includes(v))
  const pool = candidates.length >= 3 ? candidates : reactions.variants
  return pool[Math.floor(Math.random() * pool.length)]
}

/** 更新最近缓存（保留最近 3 条） */
function pushRecent(key: string, text: string): void {
  const recent = recentCache.get(key) ?? []
  recent.push(text)
  while (recent.length > 3) recent.shift()
  recentCache.set(key, recent)
}

/** 重置缓存（用于测试/归档） */
export function resetScriptCache(): void {
  recentCache.clear()
  easterEggCache.clear()
  firstTimeCache.clear()
}

// ═══════════════════════════════════════════
// 兜底通用反应
// ═══════════════════════════════════════════

const FALLBACK_REACTIONS: Record<EmotionGroup, ScriptReaction> = {
  CALM: {
    variants: [
      '嗯。', '好的。', '知道了。', '行。',
      '好的呢。', '嗯嗯。', '了解了。', '没问题。'
    ],
    easterEggs: []
  },
  AROUSED: {
    variants: [
      '哇！', '天哪！', '好厉害！', '太棒了！',
      '啊啊啊！', '真的吗！', '酷！！', '这太强了！'
    ],
    easterEggs: []
  },
  NEGATIVE: {
    variants: [
      '啊……', '糟了。', '小心！', '不好。',
      '天……', '怎么会……', '别急。', '没事的。'
    ],
    easterEggs: []
  }
}
