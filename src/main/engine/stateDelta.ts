import type { Event, FullState } from './types'

export type StateBubbleKey =
  | 'trust'
  | 'rifts'
  | 'aff'
  | 'sec'
  | 'aro'
  | 'dom'
  | 'stage'
  | 'T'
  | 'I'
  | 'S'
  | 'O'
  | 'R'

export interface StateBubble {
  key: StateBubbleKey
  label: string
  delta: number
  reason: string
}

export interface TurnStateDelta {
  turnId?: string
  bubbles: StateBubble[]
}

const REASON: Record<string, string> = {
  praise: '你表达了感谢或认可',
  hurtful: '语气偏尖锐',
  apology: '你的道歉被接纳',
  vulnerable: '你分享了脆弱的一面',
  cold: '回复偏短偏冷',
  tease: '带一点调侃的互动',
  question: '你在提问',
  casual_chat: '本轮平稳',
  reunion: '久别重逢',
  extreme_redline: '触及红线',
}

function reasonForEvent(event?: Event): string {
  if (!event) return '本轮平稳'
  return REASON[event.type] ?? '本轮平稳'
}

export function buildTurnStateDelta(
  before: FullState,
  after: FullState,
  event?: Event
): TurnStateDelta {
  const bubbles: StateBubble[] = []
  const reason = reasonForEvent(event)

  const trustD = after.relationship.trust - before.relationship.trust
  if (Math.abs(trustD) >= 0.5) {
    bubbles.push({
      key: 'trust',
      label: '信任',
      delta: Math.round(trustD * 10) / 10,
      reason,
    })
  }

  const riftD = after.relationship.rifts - before.relationship.rifts
  if (riftD !== 0) {
    bubbles.push({
      key: 'rifts',
      label: '裂痕',
      delta: riftD,
      reason: riftD > 0 ? '关系出现摩擦' : '摩擦有所修复',
    })
  }

  if (before.relationship.stage !== after.relationship.stage) {
    bubbles.push({
      key: 'stage',
      label: '阶段',
      delta: 0,
      reason: `关系阶段变化`,
    })
  }

  const affD = after.emotion.aff - before.emotion.aff
  if (Math.abs(affD) >= 1) {
    bubbles.push({ key: 'aff', label: '亲密', delta: Math.round(affD), reason })
  }

  const secD = after.emotion.sec - before.emotion.sec
  if (Math.abs(secD) >= 1) {
    bubbles.push({ key: 'sec', label: '安全', delta: Math.round(secD), reason })
  }

  const aroD = after.emotion.aro - before.emotion.aro
  if (Math.abs(aroD) >= 1) {
    bubbles.push({ key: 'aro', label: '唤醒', delta: Math.round(aroD), reason })
  }

  const domD = after.emotion.dom - before.emotion.dom
  if (Math.abs(domD) >= 1) {
    bubbles.push({ key: 'dom', label: '主导', delta: Math.round(domD), reason })
  }

  const axes = ['T', 'I', 'S', 'O', 'R'] as const
  const axisLabels: Record<(typeof axes)[number], string> = {
    T: '信任倾向',
    I: '主动',
    S: '稳定',
    O: '开放',
    R: '风险',
  }
  for (const ax of axes) {
    const d = after.personality[ax] - before.personality[ax]
    if (Math.abs(d) >= 1) {
      bubbles.push({ key: ax, label: axisLabels[ax], delta: Math.round(d), reason: '性格表盘微调' })
    }
  }

  return { bubbles: bubbles.slice(0, 4) }
}
