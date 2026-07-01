import { detectMemoryIntent } from '../../engine/interpreter'
import type { FactDraft } from './types'
import { runLightExtractRules } from './patterns'
import { isQuestionToCompanion } from '../userFactGuard'

export type { FactDraft, ExtractedFactRow, FactDraftSource } from './types'
export { runLightExtractRules } from './patterns'
export { formatBirthdayMMDD } from './normalize'

/** 轻量规则 + 显式 remember NOTE 原话备份 */
export function extractFactDrafts(userMsg: string, _companionMsg?: string): FactDraft[] {
  const rememberIntent = detectMemoryIntent(userMsg) === 'remember'
  if (isQuestionToCompanion(userMsg) && !rememberIntent) {
    return []
  }

  const drafts = runLightExtractRules(userMsg)

  if (rememberIntent) {
    const hasNote = drafts.some((d) => d.subcategory === 'NOTE')
    if (!hasNote) {
      drafts.push({
        domain: 'IDENTITY',
        subcategory: 'NOTE',
        subject: '用户',
        summary: userMsg.trim(),
        weight: 2,
        confidence: 0.95,
        triggers: ['记住', '记忆'],
        source: 'explicit_remember',
        ruleId: 'explicit_remember',
      })
    }
  }

  return drafts
}

export function hasUserFamilyLightHits(userMsg: string): boolean {
  return extractFactDrafts(userMsg).some(
    (d) => d.familyScope === 'user' || d.subcategory === 'FAMILY' || d.subject.includes('生日')
  )
}

export function factDraftsToRows(drafts: FactDraft[]): import('./types').ExtractedFactRow[] {
  return drafts.map((d) => ({
    domain: d.domain,
    subcategory: d.subcategory,
    subject: d.subject,
    summary: d.summary,
    weight: d.weight,
    confidence: d.confidence,
    triggers: d.triggers,
    ageMeta: d.ageMeta,
  }))
}

/** 合并多组抽取结果，按 subject+subcategory+summary 去重 */
export function mergeExtractedRows(
  ...groups: Array<Array<{ subject: string; subcategory: string; summary: string }>>
): import('./types').ExtractedFactRow[] {
  const seen = new Set<string>()
  const out: import('./types').ExtractedFactRow[] = []
  for (const group of groups) {
    for (const row of group) {
      const key = `${row.subcategory}::${row.subject}::${row.summary.trim().slice(0, 120)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(row as import('./types').ExtractedFactRow)
    }
  }
  return out
}
