import type { PlanSession } from '../../../shared/planSession'
import type { SkillManifest } from '../skills/types'
import type { PluginManifest, PluginPermission } from '../plugins/types'
import type { AgentGenerationResult } from './types'
import type { UskilConfig, UpluginMeta } from './loader'
import {
  buildDispatchFromDraft,
  inferDisplayName,
  inferUskillSlug,
  isUpluginPlan,
  isUskillPlan
} from './dispatchFromDraft'
import { resolvePlanArtifactKind } from '../../../shared/planArtifact'
import { buildUpluginInjectTemplate } from './upluginRuntime'
import { buildWidgetHtml } from './surface/widgets/buildWidgetHtml'
import {
  defaultWidgetConfig,
  inferWidgetIdFromText,
  widgetRequiredLevel
} from '../../../shared/openforuWidgets'
import { buildInteractionScriptForWidget } from '../../../shared/openforuInteraction'
import { withSurfaceInvokeDefaults } from '../../../shared/extensionSurface'

const ALLOWED_USKILL_PERMISSIONS = new Set([
  'engine_read',
  'engine_inject',
  'system_notification',
  'readonly'
])

const ALLOWED_UPLUGIN_PERMISSIONS = new Set<PluginPermission>([
  'readonly',
  'engine_read',
  'engine_inject',
  'system_notification',
  'network_outbound',
  'data_write'
])

function assertPlanConfirmed(session: PlanSession): void {
  if (!session.planConfirmed) {
    throw new Error('鏂规灏氭湭纭锛屾棤娉曠敓鎴?)
  }
}

function parseUskillPermissions(session: PlanSession): string[] {
  const fromDraft = session.dispatchDraft?.permissions ?? []
  const fromSummary = session.planSummary?.permissions
    ? session.planSummary.permissions.split(/[路,锛屻€?锛泑鈹俔/).map((s) => s.trim())
    : []
  const merged = [...fromDraft, ...fromSummary]
    .map((p) => p.replace(/\s+/g, '_').toLowerCase())
    .filter((p) => ALLOWED_USKILL_PERMISSIONS.has(p))
  return merged.length ? [...new Set(merged)] : ['engine_read']
}

function parseUpluginPermissions(session: PlanSession): PluginPermission[] {
  const fromDraft = session.dispatchDraft?.permissions ?? []
  const fromSummary = session.planSummary?.permissions
    ? session.planSummary.permissions.split(/[路,锛屻€?锛泑鈹俔/).map((s) => s.trim())
    : []
  const merged = [...fromDraft, ...fromSummary]
    .map((p) => p.replace(/\s+/g, '_').toLowerCase())
    .filter((p): p is PluginPermission => ALLOWED_UPLUGIN_PERMISSIONS.has(p as PluginPermission))
  return merged.length ? [...new Set(merged)] : ['readonly', 'engine_read', 'engine_inject']
}

function planBehaviorText(session: PlanSession, fallback: string): string {
  return (
    session.planSummary?.output?.trim() ||
    session.dispatchDraft?.summary?.trim() ||
    fallback
  )
}

function buildSkillConfig(
  session: PlanSession,
  manifest: SkillManifest,
  dispatch: ReturnType<typeof buildDispatchFromDraft>
): UskilConfig {
  const behavior =
    session.planSummary?.output?.trim() ||
    session.dispatchDraft?.summary?.trim() ||
    manifest.description
  const autonomous = dispatch.mode === 'autonomous'
  const scheduleRule = dispatch.time?.schedule?.rule
  const intervalMs =
    autonomous && dispatch.time?.schedule?.ruleType === 'interval_ms' && scheduleRule != null
      ? Number(scheduleRule)
      : undefined

  return {
    version: '1.0.0',
    onKeyword: {
      reply: behavior,
      variables: {}
    },
    onFunctionCall: { handler: null },
    onProactive: {
      enabled: autonomous,
      interval:
        intervalMs != null && Number.isFinite(intervalMs) && intervalMs > 0
          ? `${Math.round(intervalMs / 60_000)}min`
          : undefined
    },
    promptTemplates: {
      contextInjection: `銆?{manifest.name} 宸茶Е鍙戙€?{behavior}銆傜敤 Ackem 浼翠荆鐨勮嚜鐒惰姘斿洖搴旓紝骞惰惤瀹炶鑳藉姏鎻忚堪鐨勮涓恒€俙,
      ...(autonomous ? { userFacing: behavior } : {})
    },
    variables: {},
    allowedApiDomains: []
  }
}

/** 浠庡凡纭 Plan 浼氳瘽鐢熸垚 uskill 浜х墿锛圤F-04 v1锛氱‘瀹氭€х敓鎴愶紝涓嶄緷璧?LLM锛?*/
export function generateUskillFromSession(session: PlanSession): AgentGenerationResult {
  const log: string[] = []
  assertPlanConfirmed(session)
  const artifactKind = resolvePlanArtifactKind(session)
  if (artifactKind === 'undecided') {
    throw new Error('鏂规涓皻鏈槑纭骇鐗╃被鍨嬶紝璇峰厛鍦?Plan 涓‘璁?uskill 鎴?uplugin')
  }
  if (!isUskillPlan(session)) {
    throw new Error('褰撳墠浼氳瘽浜х墿绫诲瀷涓嶆槸 uskill锛岃浣跨敤 generateUpluginFromSession')
  }

  const draft = session.dispatchDraft ?? {}
  const dispatch = buildDispatchFromDraft(draft, session.planSummary)
  log.push('宸蹭粠 dispatchDraft 鏋勫缓 dispatch 閰嶇疆')

  const slug = inferUskillSlug(session)
  const name = inferDisplayName(session)
  const keywords = draft.keywords?.length ? draft.keywords : dispatch.keywords
  const permissions = parseUskillPermissions(session)

  const manifest: SkillManifest = {
    id: `u/${slug}@1.0.0`,
    name,
    version: '1.0.0',
    category: 'skill',
    skillType: dispatch.mode === 'autonomous' ? 'proactive' : 'rule',
    description: dispatch.summary,
    author: 'Ackem User',
    license: 'AGPL-3.0',
    main: 'skill.json',
    engineVersion: '>=0.1.0 <2.0.0',
    triggers: dispatch.mode === 'autonomous' ? ['keyword', 'scheduled'] : ['keyword'],
    keywords,
    permissions,
    timeoutMs: 5000,
    adultModeSafe: true,
    tags: ['openforu', 'user-created'],
    conflicts: [],
    dispatch
  }

  const skillConfig = buildSkillConfig(session, manifest, dispatch)
  log.push(`鐢熸垚 manifest id=${manifest.id}`)

  return {
    manifest,
    files: {
      'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
      'skill.json': `${JSON.stringify(skillConfig, null, 2)}\n`
    },
    suggestedPermissions: permissions,
    permissionReasons: Object.fromEntries(
      permissions.map((p) => [p, `Plan 鏂规澹版槑鐨?${p} 鏉冮檺`])
    ),
    generationLog: log
  }
}

export type GeneratedUskillBundle = AgentGenerationResult & {
  skillConfig: UskilConfig
  dirName: string
}

export function generateUskillBundle(session: PlanSession): GeneratedUskillBundle {
  const base = generateUskillFromSession(session)
  const skillConfig = JSON.parse(base.files['skill.json']) as UskilConfig
  const dirName = inferUskillSlug(session)
  return { ...base, skillConfig, dirName }
}

export type GeneratedUpluginBundle = {
  manifest: PluginManifest
  meta: UpluginMeta
  dirName: string
  files: Record<string, string>
  generationLog: string[]
}

/** 浠庡凡纭 Plan 浼氳瘽鐢熸垚 uplugin 浜х墿锛圤F-06 v1锛氭ā鏉?+ inject hook锛屼笉缂栬瘧鐢ㄦ埛 TS锛?*/
export function generateUpluginFromSession(session: PlanSession): GeneratedUpluginBundle {
  const log: string[] = []
  assertPlanConfirmed(session)
  if (!isUpluginPlan(session)) {
    throw new Error('褰撳墠浼氳瘽浜х墿绫诲瀷涓嶆槸 uplugin锛岃浣跨敤 generateUskillFromSession')
  }

  const draft = session.dispatchDraft ?? {}
  const dispatch = buildDispatchFromDraft(draft, session.planSummary)
  log.push('宸蹭粠 dispatchDraft 鏋勫缓 dispatch 閰嶇疆')

  const slug = inferUskillSlug(session)
  const name = inferDisplayName(session)
  const keywords = draft.keywords?.length ? draft.keywords : dispatch.keywords
  const permissions = parseUpluginPermissions(session)
  const behavior = planBehaviorText(session, dispatch.summary)

  const manifest: PluginManifest = {
    id: `u/${slug}@1.0.0`,
    name,
    version: '1.0.0',
    category: 'plugin',
    pluginType: 'behavior',
    description: dispatch.summary,
    author: 'Ackem User',
    license: 'AGPL-3.0',
    main: 'plugin.meta.json',
    engineVersion: '>=0.1.0 <2.0.0',
    permissions,
    fallbackPermissions: ['readonly'],
    dependencies: [],
    tags: ['openforu', 'user-created'],
    compatiblePersonalities: [],
    homepage: '',
    dispatch: {
      ...dispatch,
      subtype: dispatch.subtype ?? 'keyword_hint',
      personality_hint: dispatch.personality_hint ?? 'neutral'
    }
  }

  const meta: UpluginMeta = {
    version: '1.0.0',
    injectTemplate: buildUpluginInjectTemplate(manifest, behavior),
    generatedBy: 'openforu-v1-template'
  }

  const files: Record<string, string> = {
    'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'plugin.meta.json': `${JSON.stringify(meta, null, 2)}\n`,
    'README.md': `# ${name}\n\nOpenForU uplugin銆傝Е鍙戝悗閫氳繃 beforeUserMessage 娉ㄥ叆涓婁笅鏂囨垨 Surface 鐣岄潰銆俓n\n${behavior}\n`
  }

  const uiSpec = session.designSpec?.ui
  if (uiSpec?.type === 'surface' && uiSpec.designBrief) {
    const title = uiSpec.surfaceTitle ?? name
    const actions = uiSpec.primaryActions.length ? uiSpec.primaryActions : ['寮€濮?, '閲嶇疆']
    const widgetId =
      uiSpec.widgetId ??
      inferWidgetIdFromText(session.designSpec?.purpose ?? name)
    const widgetConfig = uiSpec.widgetConfig ?? defaultWidgetConfig(widgetId, actions)
    const interactionScript =
      uiSpec.interactionScript ?? buildInteractionScriptForWidget(widgetId, actions)
    const html = buildWidgetHtml(widgetId, title, widgetConfig, actions)
    meta.surface = withSurfaceInvokeDefaults({
      enabled: true,
      title,
      widget: widgetId,
      widgetConfig,
      interactionScript,
      requiredLevel: uiSpec.requiredLevel ?? widgetRequiredLevel(widgetId),
      html
    })
    meta.generatedBy = 'openforu-design-spec-surface'
    files['surface.html'] = html
    files['plugin.meta.json'] = `${JSON.stringify(meta, null, 2)}\n`
    log.push(`宸叉牴鎹?Design Spec 鐢熸垚 Widget Surface (${widgetId})`)
  }

  log.push(`鐢熸垚 uplugin manifest id=${manifest.id}`)

  return {
    manifest,
    meta,
    dirName: slug,
    files,
    generationLog: log
  }
}

export function generateUpluginBundle(session: PlanSession): GeneratedUpluginBundle {
  return generateUpluginFromSession(session)
}
