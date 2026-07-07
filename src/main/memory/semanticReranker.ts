// [semanticReranker] 鈥?LLM 璇箟閲嶆帓搴?
// 鑱岃矗锛氱敤 LLM 瀵?TF-IDF 绮楁帓缁撴灉鍋氱簿鎺掞紝缁欑湡姝ｇ殑璇箟鐩稿叧鎬ф墦鍒?
// 瀵规爣 OpenAI/MemGPT embedding 鎼滅储鐨勮涔夌悊瑙ｈ兘鍔涳紝浣嗙敤 LLM 鑰岄潪 embedding 妯″瀷
// 寮曠敤锛?./engine/types, ../engine/AckemParams, ./factStore

import type { LlmClient, MemoryFact } from '../engine/types'

const RERANK_TEMPERATURE = 0.0

const SYSTEM_PROMPT = `浣犳槸涓€涓蹇嗙浉鍏虫€ц鍒ゃ€傜敤鎴疯浜嗕竴鍙ヨ瘽锛岀郴缁熸绱㈠埌鑻ュ共鏉″€欓€夎蹇嗐€備綘闇€瑕佸垽鏂瘡鏉¤蹇嗕笌鐢ㄦ埛褰撳墠娑堟伅鐨勮涔夌浉鍏虫€с€?

璇勫垎鏍囧噯锛?
- 10锛氱洿鎺ョ浉鍏筹紙鐢ㄦ埛姝ｅ湪璋堣杩欎釜纭垏鐨勪富棰橈級
- 7-9锛氶珮搴︾浉鍏筹紙鐢ㄦ埛璇濋涓庤蹇嗘繁灞傚叧鑱旓級
- 4-6锛氶儴鍒嗙浉鍏筹紙鏌愪簺鍏抽敭璇嶆垨涓婚閲嶅彔锛?
- 1-3锛氬急鐩稿叧锛堝媺寮烘湁鑱旂郴锛?
- 0锛氬畬鍏ㄦ棤鍏?

浠呰緭鍑?JSON 鏁扮粍锛屾瘡鏉″寘鍚?factId 鍜?score锛?
[{"id":"浜嬪疄ID","score":8},{"id":"浜嬪疄ID","score":3},...]
鎸?score 浠庨珮鍒颁綆鎺掑簭銆俙

export class SemanticReranker {
  async rerank(
    candidates: MemoryFact[],
    query: string,
    llm: LlmClient,
    topK: number = 6
  ): Promise<MemoryFact[]> {
    if (candidates.length <= 1) return candidates

    const items = candidates.slice(0, 20).map(f =>
      `ID:${f.id} | [${f.subcategory}] ${f.subject}锛?{f.summary.slice(0, 100)}`
    ).join('\n')

    let raw: string
    try {
      raw = await llm.chatCompletionJson({
        temperature: RERANK_TEMPERATURE,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `鐢ㄦ埛娑堟伅锛?{query}\n\n鍊欓€夎蹇嗭細\n${items}` }
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
