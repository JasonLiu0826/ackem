// [rhythmEngine] — 节奏引擎：情绪/性格/关系 → 输出模式决策
// 职责：决定本轮回复是碎碎念（多条短句）还是长篇（单条长句）
// 纯函数，零 I/O，<0.1ms

export type RhythmMode = 'chatter' | 'monologue' | 'default'

export interface RhythmDecision {
  mode: RhythmMode
  count: number           // 消息条数
  separator: string       // 分隔符
  maxCharsPerMsg: number  // 每条最大字符数
  instruction: string     // 注入 psycheBlock 的指令
}

const CHATTER_PERSONALITIES = new Set([
  'genki',
  'oneesan',
  'deredere',
  'mommy',
  'loyal_pup',
  'tsundere',
  'mesugaki',
  'puppy',
  'bokke',
  'innocent_boy',
  'yandere',
  'submissive',
  'loyal_knight',
  'shitakiri',
  'bad_boy'
])
const MONOLOGUE_PERSONALITIES = new Set([
  'kuudere',
  'ice_queen',
  'iceberg',
  'artistic',
  'ceo_dom',
  'dominatrix',
  'tamer'
])

// 连续同模式计数器（模块级，每轮更新）
let consecutiveChatter = 0
let consecutiveMonologue = 0

export function resetRhythmState(): void {
  consecutiveChatter = 0
  consecutiveMonologue = 0
}

export function decideRhythm(input: {
  aro: number
  aff: number
  stage: string
  personalityId: string
  timeOfDay: string
  sincerity: number
  intensity: number
}): RhythmDecision {
  const { aro, aff, stage, personalityId, timeOfDay, sincerity, intensity } = input

  // 低强度对话不拆分
  if (intensity < 0.3 && Math.abs(aro) < 20) {
    return defaultDecision()
  }

  // 强制切换：连续 3 轮同模式
  if (consecutiveChatter >= 3) {
    consecutiveChatter = 0
    consecutiveMonologue = 1
    return monologueDecision()
  }
  if (consecutiveMonologue >= 3) {
    consecutiveMonologue = 0
    consecutiveChatter = 1
    return chatterDecision(stage)
  }

  // 深夜偏向长篇
  if (timeOfDay === 'late_night') {
    if (aro < 0) {
      consecutiveMonologue++
      consecutiveChatter = 0
      return monologueDecision()
    }
  }

  // 人格偏向
  if (CHATTER_PERSONALITIES.has(personalityId)) {
    if (aro > 0 && aff > 3) {
      consecutiveChatter++
      consecutiveMonologue = 0
      return chatterDecision(stage)
    }
  }
  if (MONOLOGUE_PERSONALITIES.has(personalityId)) {
    consecutiveMonologue++
    consecutiveChatter = 0
    return monologueDecision()
  }

  // 核心规则：chatter（阈值降低：情绪衰减导致积累慢）
  if (aro > 3 && aff > 8) {
    consecutiveChatter++
    consecutiveMonologue = 0
    return chatterDecision(stage)
  }

  // 核心规则：monologue
  if (aro < -10 || sincerity > 0.7) {
    consecutiveMonologue++
    consecutiveChatter = 0
    return monologueDecision()
  }

  // 默认：不拆分
  return defaultDecision()
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 异步多 bubble：2–3 条为主，供 wavePlan 参考（最终轮数由 resolveAsyncWaveCount 决定） */
function chatterDecision(stage: string): RhythmDecision {
  const count =
    stage === 'INTIMATE' ? randomInt(2, 3) : stage === 'FAMILIAR' ? randomInt(2, 3) : 2

  return {
    mode: 'chatter',
    count,
    separator: '[SPLIT]',
    maxCharsPerMsg: 30,
    instruction: `用碎碎念模式回复，分${count}条短句，每条不超过30字，用 [SPLIT] 分隔。像微信连发消息一样。`
  }
}

function monologueDecision(): RhythmDecision {
  return {
    mode: 'monologue',
    count: 1,
    separator: '',
    maxCharsPerMsg: 200,
    instruction: '用认真说的模式回复，1-2条长句，可以稍长。',
  }
}

function defaultDecision(): RhythmDecision {
  consecutiveChatter = 0
  consecutiveMonologue = 0
  return {
    mode: 'default',
    count: 2,
    separator: '',
    maxCharsPerMsg: 100,
    instruction: ''
  }
}
