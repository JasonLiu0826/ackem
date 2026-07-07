// [desire] 鈥?P2-1 娆叉湜鏍?
// 5妲戒綅锛屾鏈涗骇鐢熲啋绱Н鈫掕〃杈炬垨娌夋穩
import { randomUUID } from 'node:crypto'
import {
  DESIRE_DECAY_PER_TURN,
  DESIRE_EXPRESS_THRESHOLD,
  DESIRE_EXPRESSED_SETTLE_AFTER_TURNS,
  DESIRE_IDLE_SETTLE_TURNS,
  DESIRE_MAX_SLOTS
} from './AckemParams'
import type { Desire, DesireStack, Event, L1State } from './types'

const NEW_DESIRE_BASE_CHANCE = 0.08

/** 鏍规嵁浜嬩欢绫诲瀷鍜屽叧绯婚樁娈靛喅瀹氫骇鐢熸鏈涚殑姒傜巼鍜岀被鍒?*/
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

/** 浠庡璇濅腑鎻愬彇璇濋璇嶏紙绠€鍗曡鍒欙級 */
function extractTopic(userMsg: string): string {
  const clean = userMsg.replace(/[锛屻€傦紒锛熴€佺殑浜嗘垜浣犳槸]/g, ' ').trim()
  const words = clean.split(/\s+/).filter(w => w.length >= 2)
  if (words.length === 0) return '杩戝喌'
  return words.slice(0, 3).join('')
}

/** 瑙勮寖鍖栬瘽棰樼敤浜庡尮閰嶏紙鐭ヨ瘑鏁寸悊 / 娆叉湜 topic锛?*/
function normalizeTopicKey(s: string): string {
  return s
    .replace(/[锛屻€傦紒锛熴€乗s]/g, '')
    .replace(/^(鎼滀竴涓媩甯垜鎼渱甯垜鏌鏌ヤ竴涓媩浠嬬粛涓€涓媩浠嬬粛|璁茶|璇磋|浜嗚В|鎯充簡瑙?/u, '')
    .toLowerCase()
}

/** 鐭ヨ瘑鏁寸悊涓婚鏄惁涓庢鏈?topic 鐩稿叧 */
export function desireTopicMatchesKnowledge(
  desireTopic: string,
  knowledgeTopic: string,
  /** Embedding 鍑芥暟锛堝彲閫夛紝鐢ㄤ簬璇箟鍖归厤锛?*/
  embedText?: (text: string) => Promise<number[]>
): boolean | Promise<boolean> {
  const a = normalizeTopicKey(desireTopic)
  const b = normalizeTopicKey(knowledgeTopic)
  if (!a || !b || a.length < 2 || b.length < 2) return false

  // 绮剧‘瀛愪覆鍖归厤锛堝揩閫熻矾寰勶級
  if (a.includes(b) || b.includes(a)) return true

  // Embedding 璇箟鍖归厤锛堟參閫熷厹搴曪級
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

/** 鐢ㄦ埛鏈疆宸茶蛋鐭ヨ瘑鏁寸悊鏃讹紝娌夋穩鐩稿叧娆叉湜 */
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

/** 鏍规嵁娆叉湜绫诲埆鐢熸垚鑷劧璇█鎻愮ず */
function desireToHint(d: Desire): string {
  switch (d.category) {
    case 'concern':
      return `鏈夌偣鎷呭績ta鐨?{d.topic}锛屾兂闂棶`
    case 'curiosity':
      return `瀵箃a璇寸殑${d.topic}寰堝ソ濂囷紝鎯充簡瑙ｆ洿澶歚
    case 'share':
      return `鎯冲拰ta鍒嗕韩鍏充簬${d.topic}鐨勪簨`
    case 'tease':
      return `鎯冲湪${d.topic}涓婂皬灏忔崏寮則a涓€涓媊
    case 'suggest':
      return `鏈変釜鍏充簬${d.topic}鐨勫缓璁兂鍛婅瘔ta`
  }
}

/** 鐢熸垚鏂版鏈?*/
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

  // 1. 琛板噺瀛橀噺娆叉湜鐨?urgency
  for (let i = 0; i < DESIRE_MAX_SLOTS; i++) {
    const d = slots[i]
    if (!d || d.status === 'settled' || d.status === 'expressed') continue
    slots[i] = { ...d, urgency: Math.max(0, d.urgency - DESIRE_DECAY_PER_TURN) }
  }

  // 2. 娌夋穩锛歶rgency鈮?銆侀棽缃繃涔呫€乪xpressed 瓒呮椂
  applySettleRules(slots, turnIndex)

  // 3. 鍙兘鐢熸垚鏂版鏈涳紙浠呭啓鍏ョ┖妲芥垨宸?settled 妲斤級
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

  // 4. 鏀堕泦闇€瑕佽〃杈剧殑娆叉湜锛坲rgency 鈮?threshold锛?
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

  // 5. 琛ㄨ揪鍚庤嫢鏈疆宸?expressed锛屼笅杞啀鐢?applySettleRules 娌夋穩
  applySettleRules(slots, turnIndex)

  return { stack: { slots }, hints }
}

export function defaultDesireStack(): DesireStack {
  return { slots: [null, null, null, null, null] }
}

/** 鎵嬪姩绉婚櫎鍗曟潯娆叉湜锛堟竻绌烘Ы浣嶏級 */
export function dismissDesireFromStack(stack: DesireStack, desireId: string): DesireStack {
  const id = desireId.trim()
  if (!id) return stack
  return { slots: stack.slots.map(s => (s?.id === id ? null : s)) }
}

/** 鎵嬪姩娓呯┖褰撳墠鎵€鏈?active 娆叉湜 */
export function clearActiveDesires(stack: DesireStack): DesireStack {
  return { slots: stack.slots.map(s => (s?.status === 'active' ? null : s)) }
}
