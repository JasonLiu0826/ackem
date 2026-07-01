// [prompt/knowledge-card] — 知识卡 + 伴侣短评 prompt（v1.1 设计文档）
// 迁移自 knowledge-presentation/knowledgeAnswer.ts, paperCardCompanionPrompt.ts

import { getLocale } from '../i18n'
import {
  KNOWLEDGE_CARD_INSTRUCTIONS_EN, KNOWLEDGE_CARD_RETRY_EN,
  PAPER_CARD_COMPANION_SYSTEM_SUFFIX_EN,
  defaultPaperCardCompanionFallbackEn, buildPaperCardCompanionUserTailEn,
} from './prompt-i18n'

export const KNOWLEDGE_CARD_TEMPERATURE = 0.45
export const COMPANION_REPLY_TEMP_TSUN = 0.5
export const COMPANION_REPLY_TEMP_GENKI = 0.6

export function getKnowledgeCardInstructions(): string {
  return getLocale() === 'en' ? KNOWLEDGE_CARD_INSTRUCTIONS_EN : KNOWLEDGE_CARD_INSTRUCTIONS
}

export function getKnowledgeCardRetry(): string {
  return getLocale() === 'en' ? KNOWLEDGE_CARD_RETRY_EN : KNOWLEDGE_CARD_RETRY
}

export function getPaperCardCompanionSystemSuffix(): string {
  return getLocale() === 'en' ? PAPER_CARD_COMPANION_SYSTEM_SUFFIX_EN : PAPER_CARD_COMPANION_SYSTEM_SUFFIX
}

/** 知识卡正文 — 硬性要求 */
export const KNOWLEDGE_CARD_INSTRUCTIONS = `请撰写「知识整理正文」——一份可保存的认真答复，直接、完整地回答用户问题。

── 硬性要求 ──
· 综合性问题：≥500 字，分 3-6 个小节，每节有小标题，≥4 条核心要点
· 单一事实查询（词语翻译/简单数值/日期等）：豁免 500 字限制，直接精准作答
· 必须包含：概述、核心要点、常见误区（如适用）、综合结论
· 以可靠知识为主，不确定处标明"可能因训练数据而滞后"
· 禁止编造具体网址或最新新闻日期
· 禁止罗列参考链接

── 禁止清单 ──
× 禁止只写一句开场白就结束
× 禁止"建议你去看看XX"等推脱话
× 禁止"想聊可以找我慢慢拆"等闲聊邀请
× 禁止在正文中复述情绪标签或人格设定
× 禁止在正文中提及"我现在的情绪是……"或"作为傲娇……"`

/** 知识卡重试指令 */
export const KNOWLEDGE_CARD_RETRY = `【补写/重写】上一轮输出过短或缺少小节，请重新输出完整正文（不要道歉、不要解释为何上次短）。
硬性：≥500 字；≥3 个小节标题；≥4 条要点；语气中性、信息密度高；禁止仅开场白。`

/** 伴侣短评 system suffix — 纸面卡后气泡约束 */
export const PAPER_CARD_COMPANION_SYSTEM_SUFFIX =
  '\n\n【纸面卡 · 伴侣气泡 · 必读】' +
  '上方纸面卡**是你刚刚帮用户写/查/整理好的**，不是别人做的，也不是你要点评的外部文档。' +
  '聊天气泡须用**第一人称**（我、咱们、上面、先……），像刚干完活跟用户说句话。' +
  '**禁止第三者/评委口吻**：不得说「计划/整理/查得写得不错、还不赖、挺全」等在**评价纸面卡质量**；' +
  '不得像旁观验收、打赌、押宝（如「我赌你撑不过三天」「让我看看你能不能……」）。' +
  '可以：接用户诉求、点一个立刻能做的起步、简短陪伴或督促；**禁止**复述卡片条目与事实。'

export function defaultPaperCardCompanionFallback(kind: string): string {
  if (getLocale() === 'en') return defaultPaperCardCompanionFallbackEn(kind)
  switch (kind) {
    case '计划书':
      return '计划我写在上面了，先挑最容易的一条动起来就行。'
    case '检索摘录':
      return '我帮你查好了，细节都在上面的摘录里。'
    case '知识整理':
      return '我整理在上面了，有哪块想深挖再跟我说。'
    default:
      return '我整理在上面了。'
  }
}

export function buildPaperCardCompanionUserTail(kind: string, topic: string): string {
  if (getLocale() === 'en') return buildPaperCardCompanionUserTailEn(kind, topic)
  return (
    `\n\n【身份】上面的${kind}（「${topic}」）**是你刚帮用户完成的**，不是第三方文档。` +
    '请 **1～2 句、≤80 字**，用第一人称收尾；禁止评委式点评文档本身。'
  )
}
