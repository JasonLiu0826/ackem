// [prompt/memory-contradiction] — 矛盾检测 prompt（v1.0 设计文档）
// 迁移自 memory/contradictionDetector.ts

import { getLocale } from '../i18n'
import { CONTRADICTION_SYSTEM_EN, buildContradictionPromptEn } from './prompt-i18n'

export const CONTRADICTION_TEMPERATURE = 0.1

export const CONTRADICTION_SYSTEM_ZH = `你判断两条记忆事实之间的关系。输入两条事实（来自同一个AI伴侣对用户的记忆），输出它们的关系：

关系类型：
- "strong_conflict"：完全矛盾（"喜欢猫" vs "讨厌猫"）
- "weak_conflict"：部分矛盾（"喜欢安静" vs "昨天去酒吧玩得很开心"）
- "complement"：互补（"喜欢咖啡" + "每天喝美式" → 合并）
- "reinforce"：互相强化（"怕黑" + "晚上不敢关灯"）
- "unrelated"：关键词相似但实际不同（"喜欢猫" vs "喜欢猫主题的电影"）

对于 conflict，建议 action：
- "keep_new"：新事实更可信（旧事实可能是错误抽取或用户已改变）
- "keep_old"：旧事实更可靠（新事实可能是上下文误解）
- "merge"：两条都部分正确，合并摘要
- "flag"：不确定，标注让用户确认

判断时考虑：
- 同子类矛盾更可能是真矛盾
- 跨领域事实一般不判为 strong_conflict
- 旧事实超过 30 天，默认信任新事实
- 旧事实在 7 天内，默认信任旧事实
- 用户明确说"搞错了""我之前说错了" → keep_new

仅输出JSON：{"judgment":"...","action":"...","reason":"简短说明"}`

export const CONTRADICTION_SYSTEM = CONTRADICTION_SYSTEM_ZH

export function getContradictionSystem(): string {
  return getLocale() === 'en' ? CONTRADICTION_SYSTEM_EN : CONTRADICTION_SYSTEM_ZH
}

export function buildContradictionPrompt(
  newFact: { subcategory: string; subject: string; summary: string },
  existingFact: { subcategory: string; subject: string; summary: string },
): string {
  if (getLocale() === 'en') return buildContradictionPromptEn(newFact, existingFact)
  return `旧事实：
  · 子类：${existingFact.subcategory}
  · 主题：${existingFact.subject}
  · 摘要：${existingFact.summary}

新事实：
  · 子类：${newFact.subcategory}
  · 主题：${newFact.subject}
  · 摘要：${newFact.summary}`
}
