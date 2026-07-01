// [desire] — P2-1 欲望栈
// 5槽位，欲望产生→累积→表达或沉淀
import { randomUUID } from 'node:crypto'
import {
  DESIRE_DECAY_PER_TURN,
  DESIRE_EXPRESS_THRESHOLD,
  DESIRE_EXPRESSED_SETTLE_AFTER_TURNS,
  DESIRE_IDLE_SETTLE_TURNS,
  DESIRE_MAX_SLOTS
} from './ackemParams'
import type { Desire, DesireStack, Event, L1State } from './types'

const NEW_DESIRE_BASE_CHANCE = 0.08

/** 根据事件类型和关系阶段决定产生欲望的概率和类别 */
const DESIRE_TRIGGERS: Partial<Record<Event['type'], { chance: number; categories: Desire['category'][] }>> = {
  vulnerable: { chance: 0.20, categories: ['concern', 'share'] },
  question: { chance: 0.12, categories: ['curiosity', 'suggest'] },
  praise: { chance: 0.10, categories: ['share', 'tease'] },
  tease: { chance: 0.15, categories: ['tease', 'curiosity'] },
  casual_chat: { chance: 0.06, categories: ['curiosity', 'share', 'suggest'] },
  apology: { chance: 0.08, categories: ['concern'] },
  cold: { chance: 0.12, categories: ['concern', 'curiosity'] },
  hurtful: { chance: 0.03, categories: ['concern'] }
}

/** 从对话中提取话题词（简单规则） */
function extractTopic(userMsg: string): string {
  const clean = userMsg.replace(/[，。！？、的了我你是]/g, ' ').trim()
  const words = clean.split(/\s+/).filter(w => w.length >= 2)
  if (words.length === 0) return '近况'
  return words.slice(0, 3).join('')
}

/** 规范化话题用于匹配（知识整理 / 欲望 topic） */
function normalizeTopicKey(s: string): string {
  return s
    .replace(/[，。！？、\s]/g, '')
    .replace(/^(搜一下|帮我搜|帮我查|查一下|介绍一下|介绍|讲讲|说说|了解|想了解)/u, '')
    .toLowerCase()
}

/** 知识整理主题是否与欲望 topic 相关 */
export function desireTopicMatchesKnowledge(
  desireTopic: string,
  knowledgeTopic: string,
  /** Embedding 函数（可选，用于语义匹配） */
  embedText?: (text: string) => Promise<number[]>
): boolean | Promise<boolean> {
  const a = normalizeTopicKey(desireTopic)
  const b = normalizeTopicKey(knowledgeTopic)
  if (!a || !b || a.length < 2 || b.length < 2) return false

  // 精确子串匹配（快速路径）
  if (a.includes(b) || b.includes(a)) return true

  // Embedding 语义匹配（慢速兜底）
  if (embedText) {
    return (async () => {
      try {
        const aEmb = await embedText(a)
        const bEmb = await embedText(b)
        const { cosineSimilarity } = await import('../memory/factEmbeddingCache')
        return cosineSimilarity(aEmb, bEmb) > 0.70
      } catch {
        return false
      }
    })()
  }

  return false
}

/** 用户本轮已走知识整理时，沉淀相关欲望 */
export function settleDesiresForKnowledgeTopic(
  stack: DesireStack,
  knowledgeTopic: string
): DesireStack {
  const topic = knowledgeTopic.trim()
  if (!topic) return stack
  const slots = stack.slots.map(s => {
    if (!s || s.status === 'settled') return s
    if (!desireTopicMatchesKnowledge(s.topic, topic)) return s
    return { ...s, status: 'settled' as const, urgency: 0 }
  })
  return { slots }
}

/** 根据欲望类别生成自然语言提示 */
function desireToHint(d: Desire): string {
  switch (d.category) {
    case 'concern':
      return `有点担心ta的${d.topic}，想问问`
    case 'curiosity':
      return `对ta说的${d.topic}很好奇，想了解更多`
    case 'share':
      return `想和ta分享关于${d.topic}的事`
    case 'tease':
      return `想在${d.topic}上小小捉弄ta一下`
    case 'suggest':
      return `有个关于${d.topic}的建议想告诉ta`
  }
}

/** 生成新欲望 */
function generateDesire(
  userMsg: string,
  event: Event,
  turnIndex: number,
  stage: L1State['stage']
): Desire | null {
  const trigger = DESIRE_TRIGGERS[event.type]
  if (!trigger) return null

  const stageBonus = stage === 'INTIMATE' ? 1.5 : stage === 'FAMILIAR' ? 1.2 : 1.0
  const intensityBonus = 0.5 + event.intensity * 0.5
  const chance = trigger.chance * stageBonus * intensityBonus

  if (Math.random() > chance) return null

  const topic = extractTopic(userMsg)
  const category = trigger.categories[Math.floor(Math.random() * trigger.categories.length)]
  return {
    id: randomUUID(),
    topic,
    category,
    urgency: 1 + event.intensity * 2,
    status: 'active',
    sourceTurn: turnIndex,
    createdAt: new Date().toISOString()
  }
}

function applySettleRules(slots: (Desire | null)[], turnIndex: number): void {
  for (let i = 0; i < DESIRE_MAX_SLOTS; i++) {
    const d = slots[i]
    if (!d || d.status === 'settled') continue

    if (d.status === 'expressed') {
      const expressedAt = d.expressedAtTurn ?? d.sourceTurn
      if (turnIndex - expressedAt >= DESIRE_EXPRESSED_SETTLE_AFTER_TURNS) {
        slots[i] = { ...d, status: 'settled', urgency: 0 }
      }
      continue
    }

    if (d.status !== 'active') continue

    const idleTurns = Math.max(0, turnIndex - d.sourceTurn)
    if (d.urgency <= 0 || idleTurns >= DESIRE_IDLE_SETTLE_TURNS) {
      slots[i] = { ...d, status: 'settled', urgency: 0 }
    }
  }
}

export function updateDesireStack(
  stack: DesireStack,
  userMsg: string,
  event: Event,
  l1: L1State,
  turnIndex: number
): { stack: DesireStack; hints: string[] } {
  const slots = [...stack.slots]

  // 1. 衰减存量欲望的 urgency
  for (let i = 0; i < DESIRE_MAX_SLOTS; i++) {
    const d = slots[i]
    if (!d || d.status === 'settled' || d.status === 'expressed') continue
    slots[i] = { ...d, urgency: Math.max(0, d.urgency - DESIRE_DECAY_PER_TURN) }
  }

  // 2. 沉淀：urgency≤0、闲置过久、expressed 超时
  applySettleRules(slots, turnIndex)

  // 3. 可能生成新欲望（仅写入空槽或已 settled 槽）
  const newDesire = generateDesire(userMsg, event, turnIndex, l1.stage)
  if (newDesire) {
    const emptyIdx = slots.findIndex(s => !s || s.status === 'settled')
    if (emptyIdx >= 0) {
      slots[emptyIdx] = newDesire
    } else {
      let minIdx = 0
      let minUrgency = Infinity
      for (let i = 0; i < DESIRE_MAX_SLOTS; i++) {
        const d = slots[i]!
        if (d.status === 'settled') continue
        if (d.urgency < minUrgency) {
          minUrgency = d.urgency
          minIdx = i
        }
      }
      slots[minIdx] = newDesire
    }
  }

  // 4. 收集需要表达的欲望（urgency ≥ threshold）
  const hints: string[] = []
  for (let i = 0; i < DESIRE_MAX_SLOTS; i++) {
    const d = slots[i]
    if (!d || d.status !== 'active') continue
    if (d.urgency >= DESIRE_EXPRESS_THRESHOLD) {
      hints.push(desireToHint(d))
      slots[i] = {
        ...d,
        status: 'expressed',
        urgency: 0,
        expressedAtTurn: turnIndex
      }
    }
  }

  // 5. 表达后若本轮已 expressed，下轮再由 applySettleRules 沉淀
  applySettleRules(slots, turnIndex)

  return { stack: { slots }, hints }
}

export function defaultDesireStack(): DesireStack {
  return { slots: [null, null, null, null, null] }
}

/** 手动移除单条欲望（清空槽位） */
export function dismissDesireFromStack(stack: DesireStack, desireId: string): DesireStack {
  const id = desireId.trim()
  if (!id) return stack
  return { slots: stack.slots.map(s => (s?.id === id ? null : s)) }
}

/** 手动清空当前所有 active 欲望 */
export function clearActiveDesires(stack: DesireStack): DesireStack {
  return { slots: stack.slots.map(s => (s?.status === 'active' ? null : s)) }
}
