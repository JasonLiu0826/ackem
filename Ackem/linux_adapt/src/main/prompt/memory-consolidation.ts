// [prompt/memory-consolidation] — 整合反思 prompt（v1.0 设计文档）
// 迁移自 memory/consolidator.ts

import { CONSOLIDATION_MAX_INSIGHTS } from '../engine/ackemParams'
import { getLocale } from '../i18n'
import { CONSOLIDATION_SYS_EN, buildConsolidationUserMsgEn } from './prompt-i18n'

export const CONSOLIDATION_TEMPERATURE = 0.3

export const CONSOLIDATION_SYS_ZH = `你审视一组关于用户的近期记忆事实，合成高层洞察和事实间关联。

── 输入限制 ──
- 只处理最近 50 条事实（或 weight≥1 的事实前 100 条）
- 输入事实按时间倒序排列，每条带序号

── 洞察规则 ──
- 从多条事实中寻找模式（反复出现的主题、价值观、性格特质、行为模式）
- 不要总结单条事实——找出跨事实的上层洞察
- 洞察必须是"用户未直接说但可以从多条事实推断的"
- 每条洞察用一句简洁的话陈述
- 洞察 subcategory 只能从以下选择：VALUES_BELIEFS, SELF_PERCEPTION, LIFESTYLE, MOOD, TASTES, GOALS, VULNERABILITIES, OUR_BOND

── 关联规则 ──
- 判断事实之间的关联关系
- 关联类型：temporal(时间有关), entity(同一实体), event_chain(因果前后), emotion_peak(情绪相似), self_reference(自我认知), thematic(同一主题)
- 强度用定性等级：strong(0.8) / medium(0.5) / weak(0.2)
- 使用输入事实的序号引用

── 输出 ──
{"insights":[{"subcategory":"...","subject":"标签","summary":"洞察","triggers":["关键词"]}],
 "associations":[{"fact_a_idx":0,"fact_b_idx":2,"type":"thematic","strength":"medium"}]}

若找不到有意义的模式，返回 {"insights":[],"associations":[]}`

export function getConsolidationSystem(): string {
  return getLocale() === 'en' ? CONSOLIDATION_SYS_EN : CONSOLIDATION_SYS_ZH
}

export function buildConsolidationUserMsg(factLines: string[], count: number): string {
  if (getLocale() === 'en') return buildConsolidationUserMsgEn(factLines, count)
  return `近期事实（共${count}条）：\n${factLines.join('\n')}`
}
