// [semanticSearch] 鈥?杞婚噺绾ц涔夋悳绱紙闈炲悜閲忥紝鍏抽敭璇?Jaccard 妯＄硦鍖归厤锛?
// 鑱岃矗锛氫粠鐢ㄦ埛娑堟伅鎻愬彇鍏抽敭璇嶏紝涓庝簨瀹?subject+summary 鍋氬瓧绗﹂泦鐩镐技搴?
// 瀵规爣 LangChain VectorStoreRetriever 鐨勮涔夊尮閰嶏紝浣嗕笉渚濊禆 embedding 妯″瀷
// 寮曠敤锛?./engine/AckemParams, ../engine/types

import { SEMANTIC_KEYWORD_WEIGHT_MULTIPLIER, SEMANTIC_MIN_KEYWORD_LENGTH, SEMANTIC_SEARCH_MIN_SIMILARITY, SEMANTIC_SEARCH_TOP_K } from '../engine/AckemParams'
import type { MemoryFact } from '../engine/types'

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[锛屻€傦紒锛熴€侊紱锛?"''锛堬級銆愩€戙€娿€媆s,.!?;:()\[\]{}"']+/u)
    .map(t => t.trim())
    .filter(t => t.length >= SEMANTIC_MIN_KEYWORD_LENGTH)
    .filter(t => !/^\d+$/.test(t))
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersect = 0
  for (const item of a) {
    if (b.has(item)) intersect++
  }
  const union = new Set([...a, ...b])
  return intersect / union.size
}

/** Character-level Jaccard on combined subject + summary (for Chinese compatibility) */
function charJaccard(a: string, b: string): number {
  const charSet = (s: string) => {
    const set = new Set<string>()
    for (const ch of s.toLowerCase()) {
      if (ch !== ' ') set.add(ch)
    }
    return set
  }
  return jaccardSimilarity(charSet(a), charSet(b))
}

export function searchBySemantics(
  facts: MemoryFact[],
  query: string,
  topK: number = SEMANTIC_SEARCH_TOP_K
): MemoryFact[] {
  if (!query.trim()) return []
  const queryKeywords = extractKeywords(query)

  const scored = facts
    .filter(f => f.status === 'active')
    .map(f => {
      const factText = `${f.subject} ${f.summary}`
      // Use character Jaccard for short queries, keyword Jaccard for longer ones
      const charSim = charJaccard(query, factText)
      const qKwSet = new Set(queryKeywords)
      const fKwSet = new Set(extractKeywords(factText))
      const kwSim = jaccardSimilarity(qKwSet, fKwSet)
      const sim = Math.max(charSim, kwSim * SEMANTIC_KEYWORD_WEIGHT_MULTIPLIER) // keyword match weighted slightly higher
      return { fact: f, sim }
    })
    .filter(({ sim }) => sim >= SEMANTIC_SEARCH_MIN_SIMILARITY)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK)

  return scored.map(({ fact }) => fact)
}
