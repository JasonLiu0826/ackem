import type { PlanDesignSpec } from '../../../../shared/planDesignSpec'
import { surfaceHtmlContainsPrimaryActions } from '../../../../shared/surfaceFromDesignBrief'
import { validateWidgetConfig } from '../../../../shared/openforuWidgets'
import { widgetHtmlContainsActions } from '../surface/widgets/buildWidgetHtml'
import type { ArtifactBundle } from '../agent/bundleTypes'

export type SpecConformanceIssue = {
  field: string
  message: string
}

/** Design Spec 与 ArtifactBundle 对照（Create / Refine 共用） */
export function validateSpecConformance(
  spec: PlanDesignSpec | null | undefined,
  bundle: ArtifactBundle
): SpecConformanceIssue[] {
  if (!spec) return []

  const issues: SpecConformanceIssue[] = []
  const manifest = bundle.manifest
  const dispatch = manifest.dispatch

  if (!manifest.id.startsWith(`u/${spec.slug}@`)) {
    issues.push({ field: 'slug', message: `manifest.id 与 Spec.slug 不一致：${manifest.id}` })
  }

  for (const kw of spec.trigger.keywords) {
    const inManifest = manifest.keywords?.includes(kw)
    const inDispatch = dispatch?.keywords?.includes(kw)
    if (!inManifest && !inDispatch) {
      issues.push({ field: 'trigger.keywords', message: `缺少关键词：${kw}` })
    }
  }

  for (const slash of spec.trigger.slash) {
    const normalized = slash.startsWith('/') ? slash : `/${slash}`
    const slashes = dispatch?.slash ?? []
    if (!slashes.some((s) => s === normalized || s === slash)) {
      issues.push({ field: 'trigger.slash', message: `缺少 slash：${normalized}` })
    }
  }

  if (spec.ui.type === 'surface' && bundle.kind === 'uplugin') {
    const metaRaw = bundle.files['plugin.meta.json']
    if (!metaRaw) {
      issues.push({ field: 'ui.surface', message: 'Surface 类型缺少 plugin.meta.json' })
    } else {
      try {
        const meta = JSON.parse(metaRaw) as {
          surface?: {
            enabled?: boolean
            html?: string
            widget?: string
            widgetConfig?: Record<string, unknown>
            interactionScript?: unknown[]
          }
        }
        if (!meta.surface?.enabled) {
          issues.push({ field: 'ui.surface', message: 'surface.enabled 未开启' })
        }
        const html = meta.surface?.html ?? bundle.files['surface.html'] ?? ''
        if (meta.surface?.widget) {
          issues.push(
            ...validateWidgetConfig(meta.surface.widget, meta.surface.widgetConfig).map((m) => ({
              field: 'ui.widget',
              message: m
            }))
          )
          if (!meta.surface.interactionScript?.length) {
            issues.push({ field: 'ui.interactionScript', message: '缺少 interactionScript' })
          }
          if (spec.ui.primaryActions.length && html.trim()) {
            const missing = widgetHtmlContainsActions(html, spec.ui.primaryActions)
            for (const m of missing) {
              issues.push({ field: 'ui.primaryActions', message: `Widget Surface 缺少按钮文案：${m}` })
            }
          }
        } else if (!html.trim()) {
          issues.push({ field: 'ui.surface', message: 'Surface HTML 为空' })
        } else if (spec.ui.primaryActions.length) {
          const missing = surfaceHtmlContainsPrimaryActions(html, spec.ui.primaryActions)
          for (const m of missing) {
            issues.push({ field: 'ui.primaryActions', message: `Surface 缺少按钮文案：${m}` })
          }
        }
      } catch {
        issues.push({ field: 'ui.surface', message: 'plugin.meta.json 解析失败' })
      }
    }
  }

  if (spec.acceptance.expectContextInjection && bundle.kind === 'uskill') {
    const skillRaw = bundle.files['skill.json']
    if (skillRaw) {
      try {
        const skill = JSON.parse(skillRaw) as {
          promptTemplates?: { contextInjection?: string }
          onKeyword?: { reply?: string }
        }
        const inj = skill.promptTemplates?.contextInjection?.trim()
        const reply = skill.onKeyword?.reply?.trim()
        if (!inj && !reply) {
          issues.push({ field: 'acceptance.contextInjection', message: 'skill 缺少 contextInjection 或 onKeyword.reply' })
        }
      } catch {
        issues.push({ field: 'skill.json', message: 'skill.json 解析失败' })
      }
    }
  }

  return issues
}

export function specConformanceToValidationMessages(issues: SpecConformanceIssue[]): string[] {
  return issues.map((i) => `spec: ${i.field} — ${i.message}`)
}
