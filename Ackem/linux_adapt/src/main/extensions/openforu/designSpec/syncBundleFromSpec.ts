/**
 * 将已确认的 Design Spec 同步进 ArtifactBundle（0 token 自愈）
 * Create / Refine 共用：slug、触发词、slash、Surface
 */
import type { PlanDesignSpec } from '../../../../shared/planDesignSpec'
import { normalizeSlashList } from '../../../../shared/planDesignSpec'
import { withSurfaceInvokeDefaults } from '../../../../shared/extensionSurface'
import {
  defaultWidgetConfig,
  inferWidgetIdFromText,
  widgetRequiredLevel
} from '../../../../shared/openforuWidgets'
import { buildInteractionScriptForWidget } from '../../../../shared/openforuInteraction'
import { buildWidgetHtml } from '../surface/widgets/buildWidgetHtml'
import type { ArtifactBundle } from '../agent/bundleTypes'
import { syncBundleFiles } from '../agent/bundleSync'

function parseVersion(id: string): string {
  const m = id.match(/@(\d+\.\d+\.\d+)$/)
  return m?.[1] ?? '1.0.0'
}

function mergeKeywordLists(...lists: (string[] | undefined)[]): string[] {
  const out: string[] = []
  for (const list of lists) {
    for (const kw of list ?? []) {
      const t = kw.trim()
      if (t && !out.includes(t)) out.push(t)
    }
  }
  return out
}

function effectiveSlashFromSpec(spec: PlanDesignSpec): string[] {
  const explicit = (spec.trigger.slash ?? []).filter(
    (s) => s.trim() && !/待定|tbd|待确认/i.test(s)
  )
  if (explicit.length) return normalizeSlashList(explicit)
  return normalizeSlashList(spec.trigger.keywords)
}

/** 按 Design Spec 对齐 bundle（返回应用的修复项描述） */
export function syncBundleFromDesignSpec(
  bundle: ArtifactBundle,
  spec: PlanDesignSpec
): { bundle: ArtifactBundle; fixes: string[] } {
  const fixes: string[] = []
  const slug = spec.slug?.trim()
  if (!slug) return { bundle, fixes }

  const version = parseVersion(bundle.manifest.id)
  const expectedId = `u/${slug}@${version}`
  if (bundle.manifest.id !== expectedId) {
    bundle.manifest.id = expectedId
    bundle.dirName = slug
    fixes.push(`id→${expectedId}`)
  } else if (bundle.dirName !== slug) {
    bundle.dirName = slug
    fixes.push(`dirName→${slug}`)
  }

  const keywords = mergeKeywordLists(spec.trigger.keywords, bundle.manifest.keywords)
  if (keywords.length) {
    const dispatch = bundle.manifest.dispatch ?? {
      mode: spec.trigger.mode || 'dispatched',
      habits: ['用户通过关键词或 slash 触发'],
      scenarios: ['使用该扩展时'],
      summary: spec.purpose || spec.displayName,
      keywords: []
    }
    dispatch.keywords = mergeKeywordLists(keywords, dispatch.keywords)
    dispatch.summary = dispatch.summary?.trim() || spec.purpose || spec.displayName
    dispatch.mode = dispatch.mode || spec.trigger.mode || 'dispatched'

    const slash = effectiveSlashFromSpec(spec)
    if (slash.length) {
      dispatch.slash = [...new Set([...(dispatch.slash ?? []), ...slash])]
    }

    bundle.manifest.dispatch = dispatch
    if (bundle.kind === 'uskill' || bundle.manifest.triggers?.includes('keyword')) {
      bundle.manifest.keywords = [...dispatch.keywords]
    }
    fixes.push('trigger.keywords+slash')
  }

  if (spec.ui.type === 'surface' && bundle.kind === 'uplugin' && spec.ui.designBrief) {
    const title = spec.ui.surfaceTitle ?? spec.displayName
    const actions =
      spec.ui.primaryActions?.length ? spec.ui.primaryActions : ['开始', '重置']
    const widgetId =
      spec.ui.widgetId ?? inferWidgetIdFromText(`${spec.purpose} ${spec.displayName}`)
    const widgetConfig = spec.ui.widgetConfig ?? defaultWidgetConfig(widgetId, actions)
    const interactionScript =
      spec.ui.interactionScript?.length ?
        spec.ui.interactionScript
      : buildInteractionScriptForWidget(widgetId, actions)
    const html = buildWidgetHtml(widgetId, title, widgetConfig, actions)
    bundle.meta.surface = withSurfaceInvokeDefaults({
      enabled: true,
      title,
      widget: widgetId,
      widgetConfig,
      interactionScript,
      requiredLevel: spec.ui.requiredLevel ?? widgetRequiredLevel(widgetId),
      html
    })
    bundle.files['surface.html'] = html
    fixes.push(`surface.widget:${widgetId}`)
  }

  if (spec.displayName?.trim() && bundle.manifest.name !== spec.displayName.trim()) {
    bundle.manifest.name = spec.displayName.trim().slice(0, 64)
  }
  if (spec.purpose?.trim()) {
    bundle.manifest.description = spec.purpose.trim().slice(0, 500)
  }

  syncBundleFiles(bundle)
  if (fixes.length) {
    bundle.generationLog.push(`[SPEC-SYNC] ${fixes.join(', ')}`)
  }
  return { bundle, fixes }
}
