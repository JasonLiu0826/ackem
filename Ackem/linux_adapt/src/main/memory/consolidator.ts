// [consolidator] — 记忆整合/反思
// 职责：定期用 LLM 审视近期事实，生成高层洞察（对标 MemGPT core memory reflection）
// 引用：../engine/types, ../engine/ackemParams, ./factStore, ./taxonomy, ../prompt/memory-consolidation

import { CONSOLIDATION_INSIGHT_WEIGHT, CONSOLIDATION_MAX_FACTS_INPUT, CONSOLIDATION_MAX_INSIGHTS, CONSOLIDATION_MIN_FACTS } from '../engine/ackemParams'
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

const CONSOLIDATION_SYS_ZH = `你审视一组关于一个人的近期记忆事实，并合成 1-${CONSOLIDATION_MAX_INSIGHTS} 条高层洞察。

规则：
- 从多条事实中寻找模式（反复出现的主题、价值观、性格特质、偏好）
- 不要总结单条事实——找出跨事实的上层洞察
- 每条洞察用一句简洁的话陈述关于此人的性格、价值观或行为模式
- 以 JSON 输出：{"insights":[{"subcategory":"...","subject":"简短标签","summary":"洞察陈述","triggers":["关键词1","关键词2"]}]}
- 选择最合适的子类（VALUES_BELIEFS, SELF_PERCEPTION, LIFESTYLE, MOOD, TASTES, GOALS 等）
- 若找不到有意义的模式，返回 {"insights":[]}
- 同时判断这些事实之间的关联关系，输出：{"insights":[...], "associations":[{"fact_a_idx":1,"fact_b_idx":3,"type":"temporal"/"event_chain"/"emotion_peak"/"entity"/"self_reference"/"thematic","strength":0.5}]}
- associations 中 fact_a_idx 和 fact_b_idx 对应上面事实列表的序号
- 关联类型：temporal(时间有关), entity(同一实体), event_chain(因果前后), emotion_peak(情绪相似), self_reference(自我认知), thematic(同一主题) `

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
          { role: 'user', content: `近期事实（共${recent.length}条）：\n${factLines}` }
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
