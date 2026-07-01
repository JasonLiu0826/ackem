// [planDocument/intent] — 计划书意图（与 OpenForU Create、知识整理互斥）

import {
  detectExtensionDemandExplicit,
  detectBareFeatureCreateCandidate
} from '../extensions/dispatch/explicitDispatch'
import {
  wantsOrganizeAsCard,
  isMetaSearchDiscussion
} from '../extensions/plugins/builtin/knowledge-presentation/intent'
import {
  extractPlanTopicFromMessage,
  wantsPlanDocument
} from '../../shared/planDocumentIntent'
import { isPoorPaperCardTitle } from '../../shared/paperCardTitle'

export type PlanDocumentIntentResult = {
  topic: string
  confidence: number
}

/**
 * 识别用户要生成 Markdown 计划书（非 OpenForU 扩展 Plan、非知识整理纸面卡）。
 */
export function detectPlanDocumentIntent(
  msg: string,
  recentMessages?: Array<{ role: string; content: string }>
): PlanDocumentIntentResult | null {
  const trimmed = msg.trim()
  if (!trimmed || !wantsPlanDocument(trimmed)) return null

  if (detectExtensionDemandExplicit(trimmed)) return null
  if (detectBareFeatureCreateCandidate(trimmed)) return null
  if (wantsOrganizeAsCard(trimmed)) return null
  if (isMetaSearchDiscussion(trimmed)) return null

  const topic = resolvePlanTopicLabel(trimmed, recentMessages)
  return { topic, confidence: 0.88 }
}

export function resolvePlanTopicLabel(
  current: string,
  recentMessages?: Array<{ role: string; content: string }>
): string {
  const explicit = extractPlanTopicFromMessage(current)
  if (explicit && explicit !== current.slice(0, 120) && explicit.length >= 2) {
    return explicit
  }
  const fromMsg = extractPlanTopicFromMessage(current)
  if (fromMsg.length >= 2 && fromMsg !== '计划' && !isPoorPaperCardTitle(fromMsg)) return fromMsg

  if (recentMessages?.length) {
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const m = recentMessages[i]
      if (m.role !== 'user') continue
      if (wantsPlanDocument(m.content)) continue
      const cleaned = m.content.trim()
      if (cleaned.length >= 4 && !isPoorPaperCardTitle(cleaned)) return cleaned.slice(0, 120)
    }
  }

  return fromMsg || '计划'
}
