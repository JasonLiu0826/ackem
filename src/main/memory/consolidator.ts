// [consolidator] 鈥?璁板繂鏁村悎/鍙嶆€?
// 鑱岃矗锛氬畾鏈熺敤 LLM 瀹¤杩戞湡浜嬪疄锛岀敓鎴愰珮灞傛礊瀵燂紙瀵规爣 MemGPT core memory reflection锛?
// 寮曠敤锛?./engine/types, ../engine/AckemParams, ./factStore, ./taxonomy, ../prompt/memory-consolidation

import { CONSOLIDATION_INSIGHT_WEIGHT, CONSOLIDATION_MAX_FACTS_INPUT, CONSOLIDATION_MAX_INSIGHTS, CONSOLIDATION_MIN_FACTS } from '../engine/AckemParams'
import type { EmotionalContext, LlmClient } from '../engine/types'
import type { FactStore } from './factStore'
import { isValidSubcategory, SUBCATEGORIES, type Subcategory } from './taxonomy'
import { CONSOLIDATION_TEMPERATURE } from '../prompt/memory-consolidation'

function subcategoryToDomain(sub: string): string {
  for (const [domain, subs] of Object.entries(SUBCATEGORIES)) {
    if ((subs as readonly string[]).includes(sub)) return domain
  }
  return 'INNER_WORLD'
}

const CONSOLIDATE_TEMPERATURE = 0.3

const CONSOLIDATION_SYS_ZH = `浣犲瑙嗕竴缁勫叧浜庝竴涓汉鐨勮繎鏈熻蹇嗕簨瀹烇紝骞跺悎鎴?1-${CONSOLIDATION_MAX_INSIGHTS} 鏉￠珮灞傛礊瀵熴€?

瑙勫垯锛?
- 浠庡鏉′簨瀹炰腑瀵绘壘妯″紡锛堝弽澶嶅嚭鐜扮殑涓婚銆佷环鍊艰銆佹€ф牸鐗硅川銆佸亸濂斤級
- 涓嶈鎬荤粨鍗曟潯浜嬪疄鈥斺€旀壘鍑鸿法浜嬪疄鐨勪笂灞傛礊瀵?
- 姣忔潯娲炲療鐢ㄤ竴鍙ョ畝娲佺殑璇濋檲杩板叧浜庢浜虹殑鎬ф牸銆佷环鍊艰鎴栬涓烘ā寮?
- 浠?JSON 杈撳嚭锛歿"insights":[{"subcategory":"...","subject":"绠€鐭爣绛?,"summary":"娲炲療闄堣堪","triggers":["鍏抽敭璇?","鍏抽敭璇?"]}]}
- 閫夋嫨鏈€鍚堥€傜殑瀛愮被锛圴ALUES_BELIEFS, SELF_PERCEPTION, LIFESTYLE, MOOD, TASTES, GOALS 绛夛級
- 鑻ユ壘涓嶅埌鏈夋剰涔夌殑妯″紡锛岃繑鍥?{"insights":[]}
- 鍚屾椂鍒ゆ柇杩欎簺浜嬪疄涔嬮棿鐨勫叧鑱斿叧绯伙紝杈撳嚭锛歿"insights":[...], "associations":[{"fact_a_idx":1,"fact_b_idx":3,"type":"temporal"/"event_chain"/"emotion_peak"/"entity"/"self_reference"/"thematic","strength":0.5}]}
- associations 涓?fact_a_idx 鍜?fact_b_idx 瀵瑰簲涓婇潰浜嬪疄鍒楄〃鐨勫簭鍙?
- 鍏宠仈绫诲瀷锛歵emporal(鏃堕棿鏈夊叧), entity(鍚屼竴瀹炰綋), event_chain(鍥犳灉鍓嶅悗), emotion_peak(鎯呯华鐩镐技), self_reference(鑷垜璁ょ煡), thematic(鍚屼竴涓婚) `

export class MemoryConsolidator {
  async consolidate(
    factStore: FactStore,
    llm: LlmClient,
    emotionalContext: EmotionalContext,
    sessionId: string,
    turnIndex: number
  ): Promise<number> {
    factStore.load()
    const recent = factStore.listActive()
      .filter(f => !f.factLayer || f.factLayer === 'raw')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, CONSOLIDATION_MAX_FACTS_INPUT)

    if (recent.length < CONSOLIDATION_MIN_FACTS) return 0

    const factLines = recent.map((f, i) =>
      `[${i + 1}] (${f.subcategory}) ${f.subject}: ${f.summary}`
    ).join('\n')

    let raw: string
    try {
      raw = await llm.chatCompletionJson({
        temperature: CONSOLIDATE_TEMPERATURE,
        messages: [
          { role: 'system', content: CONSOLIDATION_SYS_ZH },
          { role: 'user', content: `杩戞湡浜嬪疄锛堝叡${recent.length}鏉★級锛歕n${factLines}` }
        ]
      })
    } catch {
      return 0
    }

    let insights: Array<{
      subcategory: string
      subject: string
      summary: string
      triggers?: string[]
    }> = []
    try {
      const parsed = JSON.parse(raw) as { insights?: Array<{ subcategory: string; subject: string; summary: string; triggers?: string[] }> }
      if (Array.isArray(parsed.insights)) insights = parsed.insights
    } catch {
      return 0
    }

    let added = 0
    const derivedFrom = recent.map(f => f.id)
    for (const ins of insights.slice(0, CONSOLIDATION_MAX_INSIGHTS)) {
      const sub = ins.subcategory as Subcategory
      if (!isValidSubcategory(sub)) continue
      if (!ins.subject || !ins.summary) continue

      factStore.addFact({
        domain: subcategoryToDomain(ins.subcategory),
        subcategory: ins.subcategory,
        subject: ins.subject,
        summary: ins.summary,
        weight: CONSOLIDATION_INSIGHT_WEIGHT,
        confidence: 0.7,
        selfRelevance: 1.0,
        triggers: ins.triggers ?? [],
        sourceSessionId: sessionId,
        sourceTurnIndex: turnIndex,
        emotionalContext,
        derivedFrom,
        factLayer: 'consolidated'
      })
      added++
    }
    return added
  }
}
