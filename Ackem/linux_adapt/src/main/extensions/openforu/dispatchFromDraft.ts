import type { DispatchConfig, DispatchMode, DispatchedSubtype } from '../protocols'
import { attachSlashToDispatch } from '../dispatch/slashDispatch'
import type { PlanDispatchDraft, PlanSession, PlanSummary } from '../../../shared/planSession'
import { extensionIdToSlug } from '../../../shared/planDesignSpec'

export function inferUskillSlug(
  session: Pick<
    PlanSession,
    'id' | 'dispatchDraft' | 'designSpec' | 'deployedUskillId' | 'linkedExtensionId'
  >
): string {
  const deployed = session.deployedUskillId ?? session.linkedExtensionId
  if (deployed?.startsWith('u/')) {
    return extensionIdToSlug(deployed).slice(0, 32)
  }

  const fromSpec = session.designSpec?.slug?.trim()
  if (fromSpec && fromSpec.length >= 2) return fromSpec.slice(0, 32)

  const keywords = session.dispatchDraft?.keywords ?? []
  const ascii = keywords.find((k) => /[a-z0-9]/i.test(k))
  if (ascii) {
    const slug = ascii
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    if (slug.length >= 2) return slug.slice(0, 32)
  }
  return `skill-${session.id.slice(0, 8)}`
}

export function inferDisplayName(session: PlanSession): string {
  const draft = session.dispatchDraft
  const summary = session.planSummary
  const fromSummary = summary?.output?.trim()
  if (fromSummary && fromSummary.length <= 40) return fromSummary
  if (draft?.summary?.trim()) return draft.summary.trim().slice(0, 40)
  const kw = draft?.keywords?.[0]
  if (kw) return kw.slice(0, 40)
  return '自定义 Skill'
}

export { isUpluginOnlyRequest, isUpluginPlan, isUskillPlan, resolvePlanArtifactKind } from '../../../shared/planArtifact'

export function buildDispatchFromDraft(
  draft: PlanDispatchDraft,
  summary?: PlanSummary | null
): DispatchConfig {
  const mode = normalizeMode(draft.mode ?? summary?.trigger)
  const habits =
    draft.habits?.length ? [...draft.habits] : ['用户通过关键词或自然语言请求使用该能力']
  const scenarios =
    draft.scenarios?.length ? [...draft.scenarios] : ['用户需要此扩展提供的功能时']
  const summaryText =
    draft.summary?.trim() || summary?.output?.trim() || '用户自创扩展'
  const keywords = draft.keywords?.length ? [...draft.keywords] : ['帮忙']

  const config: DispatchConfig = {
    mode,
    habits,
    scenarios,
    summary: summaryText,
    keywords,
    time: {
      active_hours: '08:00-22:00',
      cooldown_minutes: 10
    }
  }

  if (mode === 'dispatched') {
    config.subtype = inferDispatchedSubtype(summary?.trigger)
    config.personality_hint = 'neutral'
  }

  if (mode === 'autonomous') {
    config.subtype = 'interval'
    config.time.schedule = { rule: 900000, ruleType: 'interval_ms' }
  }

  return attachSlashToDispatch(config)
}

function normalizeMode(raw?: string): DispatchMode {
  const s = (raw ?? 'dispatched').toLowerCase()
  if (s.includes('autonomous') || s.includes('定时') || s.includes('自动')) return 'autonomous'
  if (s.includes('manual') || s.includes('手动')) return 'manual'
  if (s.includes('always')) return 'always_on'
  return 'dispatched'
}

function inferDispatchedSubtype(trigger?: string): DispatchedSubtype {
  const t = (trigger ?? '').toLowerCase()
  if (t.includes('function') || t.includes('工具') || t.includes('llm')) return 'llm_function_call'
  if (t.includes('语义') || t.includes('semantic')) return 'semantic_match'
  return 'keyword_hint'
}
