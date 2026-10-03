// [rhythmEngine] — 节奏引擎：情绪/性格/关系 → 输出模式决策
// 职责：决定本轮回复是碎碎念（多条短句）还是长篇（单条长句）
// 按 agentId Map 化，防多角色抢同一节奏计数

import { getCurrentAgentId } from '../social/agents/withAgentContext'

export type RhythmMode = 'chatter' | 'monologue' | 'default'

export interface RhythmDecision {
  mode: RhythmMode
  count: number
  separator: string
  maxCharsPerMsg: number
  instruction: string
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
  'bad_boy',
])
const MONOLOGUE_PERSONALITIES = new Set([
  'kuudere',
  'ice_queen',
  'iceberg',
  'artistic',
  'ceo_dom',
  'dominatrix',
  'tamer',
])

const consecutiveChatterByAgent = new Map<string, number>()
const consecutiveMonologueByAgent = new Map<string, number>()

export function resetRhythmState(agentId?: string): void {
  const id = agentId ?? getCurrentAgentId()
  consecutiveChatterByAgent.set(id, 0)
  consecutiveMonologueByAgent.set(id, 0)
}

export function clearRhythmState(agentId: string): void {
  consecutiveChatterByAgent.delete(agentId)
  consecutiveMonologueByAgent.delete(agentId)
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
  const agentId = getCurrentAgentId()
  let consecutiveChatter = consecutiveChatterByAgent.get(agentId) ?? 0
  let consecutiveMonologue = consecutiveMonologueByAgent.get(agentId) ?? 0

  const setCounters = (chatter: number, monologue: number) => {
    consecutiveChatter = chatter
    consecutiveMonologue = monologue
    consecutiveChatterByAgent.set(agentId, chatter)
    consecutiveMonologueByAgent.set(agentId, monologue)
  }

  if (intensity < 0.3 && Math.abs(aro) < 20) {
    return defaultDecision(agentId)
  }

  if (consecutiveChatter >= 3) {
    setCounters(0, 1)
    return monologueDecision()
  }
  if (consecutiveMonologue >= 3) {
    setCounters(1, 0)
    return chatterDecision(stage)
  }

  if (timeOfDay === 'late_night') {
    if (aro < 0) {
      setCounters(0, consecutiveMonologue + 1)
      return monologueDecision()
    }
  }

  if (CHATTER_PERSONALITIES.has(personalityId)) {
    if (aro > 0 && aff > 3) {
      setCounters(consecutiveChatter + 1, 0)
      return chatterDecision(stage)
    }
  }
  if (MONOLOGUE_PERSONALITIES.has(personalityId)) {
    setCounters(0, consecutiveMonologue + 1)
    return monologueDecision()
  }

  if (aro > 3 && aff > 8) {
    setCounters(consecutiveChatter + 1, 0)
    return chatterDecision(stage)
  }

  if (aro < -10 || sincerity > 0.7) {
    setCounters(0, consecutiveMonologue + 1)
    return monologueDecision()
  }

  return defaultDecision(agentId)
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function chatterDecision(stage: string): RhythmDecision {
  const count =
    stage === 'INTIMATE' ? randomInt(2, 3) : stage === 'FAMILIAR' ? randomInt(2, 3) : 2

  return {
    mode: 'chatter',
    count,
    separator: '[SPLIT]',
    maxCharsPerMsg: 30,
    instruction: `用碎碎念模式回复，分${count}条短句，每条不超过30字，用 [SPLIT] 分隔。像微信连发消息一样。`,
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

function defaultDecision(agentId: string): RhythmDecision {
  consecutiveChatterByAgent.set(agentId, 0)
  consecutiveMonologueByAgent.set(agentId, 0)
  return {
    mode: 'default',
    count: 2,
    separator: '',
    maxCharsPerMsg: 100,
    instruction: '',
  }
}
