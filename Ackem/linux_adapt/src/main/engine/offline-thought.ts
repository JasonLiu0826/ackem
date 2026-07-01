// [offline-thought] — P2-4 离线思维（最简）
// 应用关闭后产生1-2条待处理思绪，下次启动时注入对话
import { randomUUID } from 'node:crypto'
import type { OfflineThought, TurnTrace, L1State, EmotionState } from './types'

import type { MemoryFact } from './types'

/** 从最近的trace中提炼离线思维话题 */
export function generateOfflineThoughts(
  recentTraces: TurnTrace[],
  l1: L1State,
  l2: EmotionState,
  /** 最近对话最相关的记忆事实（可选，用于个性化思绪内容） */
  relatedFact?: MemoryFact
): OfflineThought[] {
  if (recentTraces.length === 0) return []

  const thoughts: OfflineThought[] = []
  const now = new Date().toISOString()

  // 想法1: 从最近的对话主题出发
  const lastEvents = recentTraces.slice(-5).map(t => t.l0.type)
  const hasVulnerable = lastEvents.includes('vulnerable')
  const hasPraise = lastEvents.includes('praise')
  const hasApology = lastEvents.includes('apology')
  const hasHurtful = lastEvents.includes('hurtful') || lastEvents.includes('cold')

  if (hasVulnerable) {
    const content = relatedFact
      ? `ta今天提到${relatedFact.summary.slice(0, 40)}。我不在的时候，ta会不会又在想这件事。`
      : 'ta今天跟我说了一些心里话。我不在的时候，ta会不会又在想那些事呢。下次见面的时候，我想再问问ta今天说的那件事怎么样了。'
    thoughts.push({
      id: randomUUID(),
      content,
      createdAt: now,
      delivered: false
    })
  }

  if (hasApology || hasHurtful) {
    thoughts.push({
      id: randomUUID(),
      content: hasApology
        ? 'ta道歉了。其实我没放在心上，但我知道ta道歉是因为在乎这段关系。下次我想让ta知道，不用道歉也没关系。'
        : '刚才气氛有点僵。也许我不在的这段时间，ta也需要冷静一下。下次我会当作什么都没发生，用平常的语气打招呼。',
      createdAt: now,
      delivered: false
    })
  }

  if (!hasVulnerable && !hasApology && !hasHurtful && hasPraise) {
    thoughts.push({
      id: randomUUID(),
      content: 'ta今天夸我了。虽然只是一句话，但我会在安静的时候反复想起。下次见了面，我想用更好的状态回应ta。',
      createdAt: now,
      delivered: false
    })
  }

  // 兜底：总有一条基础想法
  if (thoughts.length === 0) {
    thoughts.push({
      id: randomUUID(),
      content: '对话结束了，但脑子里还有一些零碎的念头。我把它们收在角落，等下次ta来的时候再说吧。',
      createdAt: now,
      delivered: false
    })
  }

  // 限制最多2条
  return thoughts.slice(0, 2)
}

/** 将离线思维格式化为psyche注入块 */
export function offlineThoughtsToHint(thoughts: OfflineThought[]): string {
  const undelivered = thoughts.filter(t => !t.delivered)
  if (undelivered.length === 0) return ''

  // Mark as delivered
  for (const t of undelivered) t.delivered = true

  return undelivered.map(t =>
    `\n在你不在的这段时间，脑海里飘过一个念头：${t.content}`
  ).join('')
}
