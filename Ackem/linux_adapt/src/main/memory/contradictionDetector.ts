// [contradictionDetector] — 记忆矛盾检测与解决
// 职责：LLM 判断两条相似事实是否语义冲突，并建议解决策略
// 引用：../engine/types, ../prompt/memory-contradiction, ../llmClient

import type { ContradictionCheck, LlmClient, MemoryFact } from '../engine/types'
import { CONTRADICTION_SYSTEM, CONTRADICTION_TEMPERATURE, buildContradictionPrompt } from '../prompt/memory-contradiction'

export class ContradictionDetector {
  async check(
    newFact: MemoryFact,
    existingFact: MemoryFact,
    llm: LlmClient
  ): Promise<ContradictionCheck | null> {
    const prompt = buildContradictionPrompt(
      { subcategory: newFact.subcategory, subject: newFact.subject, summary: newFact.summary },
      { subcategory: existingFact.subcategory, subject: existingFact.subject, summary: existingFact.summary },
    )

    let raw: string
    try {
      raw = await llm.chatCompletionJson({
        temperature: CONTRADICTION_TEMPERATURE,
        messages: [
          { role: 'system', content: CONTRADICTION_SYSTEM },
          { role: 'user', content: prompt }
        ]
      })
    } catch {
      return null
    }

    return parseContradictionResult(raw, existingFact.id)
  }

  /** 批量检测：一次 LLM 调用处理 3-5 对事实 */
  async checkBatch(
    pairs: Array<{ newFact: MemoryFact; existing: MemoryFact }>,
    llm: LlmClient
  ): Promise<Array<{ pair: typeof pairs[0]; check: ContradictionCheck | null }>> {
    if (pairs.length === 0) return []

    const pairLines = pairs.map((p, i) =>
      `[${i + 1}] 旧 · ${p.existing.subcategory} · ${p.existing.subject}：${p.existing.summary.slice(0, 120)}\n   新 · ${p.newFact.subcategory} · ${p.newFact.subject}：${p.newFact.summary.slice(0, 120)}`
    ).join('\n\n')

    const batchPrompt = `判断以下 ${pairs.length} 对事实的关系。每对按编号返回：
返回 JSON：{"pairs":[{"pair_idx":1,"judgment":"conflict|reinforce|unrelated","action":"keep_new|keep_old|merge|flag","reason":"..."}]}

${pairLines}`

    const BATCH_SYSTEM = `你批量判断多对记忆事实之间的关系。对每对事实独立判断，只返回 JSON。`

    let raw: string
    try {
      raw = await llm.chatCompletionJson({
        temperature: CONTRADICTION_TEMPERATURE,
        messages: [
          { role: 'system', content: BATCH_SYSTEM },
          { role: 'user', content: batchPrompt }
        ]
      })
    } catch {
      return pairs.map(p => ({ pair: p, check: null }))
    }

    try {
      const parsed = JSON.parse(raw.trim().slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as {
        pairs?: Array<{ pair_idx: number; judgment: string; action: string; reason: string }>
      }
      if (!parsed.pairs?.length) return pairs.map(p => ({ pair: p, check: null }))

      const resultMap = new Map(parsed.pairs.map(item => [item.pair_idx - 1, item]))
      return pairs.map((p, i) => {
        const item = resultMap.get(i)
        if (!item) return { pair: p, check: null }
        return {
          pair: p,
          check: {
            conflictingFactId: p.existing.id,
            judgment: (item.judgment === 'conflict' || item.judgment === 'reinforce' || item.judgment === 'unrelated')
              ? item.judgment : 'unrelated',
            action: (item.action === 'keep_new' || item.action === 'keep_old' || item.action === 'merge' || item.action === 'flag')
              ? item.action : 'flag',
            reason: item.reason
          }
        }
      })
    } catch {
      return pairs.map(p => ({ pair: p, check: null }))
    }
  }
}

function parseContradictionResult(raw: string, existingFactId: string): ContradictionCheck | null {
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as {
        judgment?: string
        action?: string
        reason?: string
      }
    } catch {
      return null
    }
  }

  let parsed = tryParse(raw.trim())
  if (!parsed) {
    const i = raw.indexOf('{')
    const j = raw.lastIndexOf('}')
    if (i >= 0 && j > i) {
      parsed = tryParse(raw.slice(i, j + 1))
    }
  }
  if (!parsed) return null

  const judgment = parsed.judgment === 'conflict' || parsed.judgment === 'reinforce' || parsed.judgment === 'unrelated'
    ? parsed.judgment
    : 'unrelated'

  const action = parsed.action === 'keep_new' || parsed.action === 'keep_old' || parsed.action === 'merge' || parsed.action === 'flag'
    ? parsed.action
    : 'keep_new'

  return {
    conflictingFactId: judgment === 'conflict' ? existingFactId : null,
    judgment,
    action,
    reason: parsed.reason ?? ''
  }
}
