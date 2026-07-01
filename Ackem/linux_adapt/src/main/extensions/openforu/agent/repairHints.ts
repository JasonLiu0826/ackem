import type { PlanSession } from '../../../../shared/planSession'
import { buildDispatchFromDraft, inferUskillSlug } from '../dispatchFromDraft'
import { isValidUextensionId, FORBIDDEN_USER_PLUGIN_PERMISSIONS } from '../types'
import type { PluginPermission } from '../../plugins/types'
import type { ArtifactBundle } from './bundleTypes'
import type { ValidationReport } from './validationReport'
import { syncBundleFiles } from './bundleSync'
import { buildUpluginInjectTemplate } from '../upluginRuntime'
import { syncBundleFromDesignSpec } from '../designSpec/syncBundleFromSpec'

const DEFAULT_USKILL_PERMISSIONS = ['engine_read']

const DEFAULT_UPLUGIN_PERMISSIONS: PluginPermission[] = ['readonly', 'engine_read']

function draftKeywords(session: PlanSession): string[] {
  const draft = session.dispatchDraft ?? {}
  if (draft.keywords?.length) return [...draft.keywords]
  return []
}

function applyDispatchFromDraft(bundle: ArtifactBundle, session: PlanSession): void {
  const dispatch = buildDispatchFromDraft(session.dispatchDraft ?? {}, session.planSummary)
  bundle.manifest.dispatch = dispatch
  if (bundle.kind === 'uskill' && bundle.manifest.triggers?.includes('keyword')) {
    bundle.manifest.keywords = dispatch.keywords?.length ? [...dispatch.keywords] : bundle.manifest.keywords
  }
}

/**
 * 确定性修复（0 token）：按 validation issue 改 bundle
 */
export function applyDeterministicFixes(
  bundle: ArtifactBundle,
  session: PlanSession,
  report: ValidationReport
): { bundle: ArtifactBundle; fixedCodes: string[] } {
  const fixed = new Set<string>()
  const codes = new Set(report.errors.map((e) => e.code))

  if (
    codes.has('DISPATCH_KEYWORDS_EMPTY') ||
    codes.has('MANIFEST_KEYWORDS_EMPTY')
  ) {
    const kw = draftKeywords(session)
    if (kw.length) {
      applyDispatchFromDraft(bundle, session)
      if (bundle.kind === 'uskill') {
        bundle.manifest.keywords = [...kw]
      }
      bundle.generationLog.push('[DET-FIX] keywords 从 dispatchDraft 回填')
      fixed.add('DISPATCH_KEYWORDS_EMPTY')
    }
  }

  if (codes.has('DISPATCH_HABITS_EMPTY')) {
    const habits = session.dispatchDraft?.habits
    if (habits?.length && bundle.manifest.dispatch) {
      bundle.manifest.dispatch.habits = [...habits]
      bundle.generationLog.push('[DET-FIX] habits 从 dispatchDraft 回填')
      fixed.add('DISPATCH_HABITS_EMPTY')
    }
  }

  if (codes.has('DISPATCH_SCENARIOS_EMPTY')) {
    const scenarios = session.dispatchDraft?.scenarios
    if (scenarios?.length && bundle.manifest.dispatch) {
      bundle.manifest.dispatch.scenarios = [...scenarios]
      bundle.generationLog.push('[DET-FIX] scenarios 从 dispatchDraft 回填')
      fixed.add('DISPATCH_SCENARIOS_EMPTY')
    }
  }

  if (codes.has('DISPATCH_SUMMARY_EMPTY')) {
    const summary =
      session.dispatchDraft?.summary?.trim() || session.planSummary?.output?.trim()
    if (summary && bundle.manifest.dispatch) {
      bundle.manifest.dispatch.summary = summary
      bundle.generationLog.push('[DET-FIX] summary 从 Plan 回填')
      fixed.add('DISPATCH_SUMMARY_EMPTY')
    }
  }

  if (codes.has('MANIFEST_ID_INVALID') || !isValidUextensionId(bundle.manifest.id)) {
    const slug =
      session.designSpec?.slug?.trim() || inferUskillSlug(session)
    bundle.manifest.id = `u/${slug}@1.0.0`
    bundle.dirName = slug
    bundle.generationLog.push(`[DET-FIX] id 重写为 ${bundle.manifest.id}`)
    fixed.add('MANIFEST_ID_INVALID')
  }

  if (
    session.designSpec &&
    (codes.has('SPEC_CONFORMANCE') ||
      codes.has('DISPATCH_KEYWORDS_EMPTY') ||
      codes.has('MANIFEST_KEYWORDS_EMPTY'))
  ) {
    const { bundle: synced, fixes } = syncBundleFromDesignSpec(bundle, session.designSpec)
    Object.assign(bundle, synced)
    if (fixes.length) {
      for (const f of fixes) fixed.add(`SPEC:${f}`)
    }
  }

  if (codes.has('PERMISSION_FORBIDDEN')) {
    const forbidden = new Set<string>(FORBIDDEN_USER_PLUGIN_PERMISSIONS)
    const before = bundle.manifest.permissions?.length ?? 0
    bundle.manifest.permissions = (bundle.manifest.permissions ?? []).filter(
      (p) => !forbidden.has(p)
    )
    if (bundle.kind === 'uskill') {
      bundle.suggestedPermissions = bundle.suggestedPermissions.filter((p) => !forbidden.has(p))
    }
    if (!bundle.manifest.permissions.length) {
      bundle.manifest.permissions =
        bundle.kind === 'uskill' ? [...DEFAULT_USKILL_PERMISSIONS] : [...DEFAULT_UPLUGIN_PERMISSIONS]
    }
    if (before !== bundle.manifest.permissions.length) {
      bundle.generationLog.push('[DET-FIX] 已移除禁止权限并回落默认权限集')
      fixed.add('PERMISSION_FORBIDDEN')
    }
  }

  if (codes.has('MANIFEST_PERMISSIONS_EMPTY') && !bundle.manifest.permissions?.length) {
    bundle.manifest.permissions =
      bundle.kind === 'uskill' ? [...DEFAULT_USKILL_PERMISSIONS] : [...DEFAULT_UPLUGIN_PERMISSIONS]
    bundle.generationLog.push('[DET-FIX] permissions 设为默认')
    fixed.add('MANIFEST_PERMISSIONS_EMPTY')
  }

  if (bundle.kind === 'uplugin' && codes.has('INJECT_TEMPLATE_EMPTY')) {
    if (!bundle.meta.injectTemplate?.trim()) {
      const behavior =
        session.dispatchDraft?.summary?.trim() ||
        session.planSummary?.output?.trim() ||
        bundle.manifest.description
      bundle.meta.injectTemplate = buildUpluginInjectTemplate(bundle.manifest, behavior)
      bundle.generationLog.push('[DET-FIX] injectTemplate 从方案生成')
      fixed.add('INJECT_TEMPLATE_EMPTY')
    }
  }

  if (bundle.kind === 'uskill' && codes.has('SKILL_REPLY_EMPTY')) {
    const reply =
      session.dispatchDraft?.summary?.trim() ||
      session.planSummary?.output?.trim() ||
      '好的，我会按方案里的习惯来回应你。'
    if (bundle.skillConfig.onKeyword && !bundle.skillConfig.onKeyword.reply?.trim()) {
      bundle.skillConfig.onKeyword.reply = reply
    }
    if (bundle.skillConfig.promptTemplates && !bundle.skillConfig.promptTemplates.contextInjection?.trim()) {
      bundle.skillConfig.promptTemplates.contextInjection = `【${bundle.manifest.name}】${reply}`
    }
    bundle.generationLog.push('[DET-FIX] skill 话术从 Plan 回填')
    fixed.add('SKILL_REPLY_EMPTY')
  }

  syncBundleFiles(bundle)
  return { bundle, fixedCodes: [...fixed] }
}

export function hasFatalIssues(report: ValidationReport): boolean {
  return report.errors.some((e) => !e.autoRepairable)
}

export function issueCodes(report: ValidationReport): string[] {
  return report.errors.map((e) => e.code)
}
