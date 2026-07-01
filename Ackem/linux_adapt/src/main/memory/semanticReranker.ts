// [semanticReranker] — LLM 语义重排序
// 职责：用 LLM 对 TF-IDF 粗排结果做精排，给真正的语义相关性打分
// 对标 OpenAI/MemGPT embedding 搜索的语义理解能力，但用 LLM 而非 embedding 模型
// 引用：../engine/types, ../engine/ackemParams, ./factStore

import type { LlmClient, MemoryFact } from '../engine/types'

const RERANK_TEMPERATURE = 0.0

const SYSTEM_PROMPT = `你是一个记忆相关性裁判。用户说了一句话，系统检索到若干条候选记忆。你需要判断每条记忆与用户当前消息的语义相关性。

评分标准：
- 10：直接相关（用户正在谈论这个确切的主题）
- 7-9：高度相关（用户话题与记忆深层关联）
- 4-6：部分相关（某些关键词或主题重叠）
- 1-3：弱相关（勉强有联系）
- 0：完全无关

仅输出 JSON 数组，每条包含 factId 和 score：
[{"id":"事实ID","score":8},{"id":"事实ID","score":3},...]
按 score 从高到低排序。`

export class SemanticReranker {
  async rerank(
    candidates: MemoryFact[],
    query: string,
    llm: LlmClient,
    topK: number = 6
  ): Promise<MemoryFact[]> {
    if (candidates.length <= 1) return candidates

    const items = candidates.slice(0, 20).map(f =>
      `ID:${f.id} | [${f.subcategory}] ${f.subject}：${f.summary.slice(0, 100)}`
    ).join('\n')

    let raw: string
    try {
      raw = await llm.chatCompletionJson({
        temperature: RERANK_TEMPERATURE,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `用户消息：${query}\n\n候选记忆：\n${items}` }
        ]
      })
    } catch {
      return candidates.slice(0, topK) // fallback to TF-IDF order
    }

    try {
      const scores = JSON.parse(raw) as Array<{ id: string; score: number }>
      if (!Array.isArray(scores)) return candidates.slice(0, topK)

      const scoreMap = new Map(scores.map(s => [s.id, s.score]))
      return candidates
        .filter(f => scoreMap.has(f.id))
        .sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0))
        .slice(0, topK)
    } catch {
      return candidates.slice(0, topK)
    }
  }
}
