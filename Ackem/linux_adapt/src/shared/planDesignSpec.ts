/**
 * OpenForU Design Spec — Create 轨设计规格（程序 + UI）
 * 单一真相源：确认方案、generate、verify、Delivery Card
 */
import type { PlanDispatchDraft, PlanSession, PlanSummary } from './planSession'
import { parsePlanStructuredBlock } from './planStructured'
import { resolvePlanArtifactKind, type PlanArtifactKind } from './planArtifact'
import { inferTierFromPermissionIds } from './openforuCapabilityTier'
import {
  buildInteractionScriptForWidget,
  type InteractionRequiredLevel,
  type InteractionStep
} from './openforuInteraction'
import {
  defaultWidgetConfig,
  inferWidgetIdFromText,
  type OpenForUWidgetId,
  widgetRequiredLevel
} from './openforuWidgets'
import { validateWidgetUiClaims } from './openforuWidgetCatalog'

export type PlanUiType = 'surface' | 'injection_only' | 'none'

export type PlanUiLayout = 'single_column' | 'dual_column' | 'dashboard'

export type PlanUiSection = {
  id: string
  label: string
  content: string
}

export type PlanUiState = {
  id: string
  label: string
  visible: string[]
}

export type PlanUiInteraction = {
  control: string
  when: string
  effect: string
}

export type PlanUiDesignBrief = {
  userGoal: string
  layout: PlanUiLayout
  sections: PlanUiSection[]
  states: PlanUiState[]
  interactions: PlanUiInteraction[]
  feedback: string[]
  accessibility?: string[]
}

export type PlanDesignSpecUi = {
  required: boolean
  type: PlanUiType
  surfaceTitle?: string
  primaryActions: string[]
  /** OID Widget 模板 */
  widgetId?: OpenForUWidgetId
  widgetConfig?: Record<string, unknown>
  interactionScript?: InteractionStep[]
  requiredLevel?: InteractionRequiredLevel
  openHint?: string
  designBrief?: PlanUiDesignBrief
  wireframeApproved: boolean
}

export type PlanDesignSpecTrigger = {
  keywords: string[]
  slash: string[]
  mode: string
  subtype?: string
}

export type PlanDesignSpecPermissions = {
  requested: string[]
  tier: 'T0' | 'T1' | 'T2'
  userFacingReason?: string
}

export type PlanDesignSpecAcceptance = {
  smokeMessages: string[]
  expectContextInjection: boolean
  expectSurfaceOpenable: boolean
  expectNotification: boolean
}

export type PlanDesignSpec = {
  version: '1.0.0'
  artifactKind: PlanArtifactKind
  displayName: string
  slug: string
  purpose: string
  trigger: PlanDesignSpecTrigger
  permissions: PlanDesignSpecPermissions
  ui: PlanDesignSpecUi
  acceptance: PlanDesignSpecAcceptance
  constraints?: {
    noNetwork?: boolean
    adultModeSafe?: boolean
  }
  openQuestions: string[]
}

export type DesignSpecGateResult = {
  ready: boolean
  missing: string[]
}

/** mergeDesignSpec 的 patch — ui/trigger/acceptance 允许深层 Partial */
export type PlanDesignSpecPatch = Omit<
  Partial<PlanDesignSpec>,
  'ui' | 'trigger' | 'acceptance' | 'permissions'
> & {
  ui?: Partial<PlanDesignSpecUi>
  trigger?: Partial<PlanDesignSpecTrigger>
  acceptance?: Partial<PlanDesignSpecAcceptance>
  permissions?: Partial<PlanDesignSpecPermissions>
}

function slugifyKeyword(raw: string, fallback: string): string {
  const ascii = raw.match(/[a-z0-9]+/gi)?.join('-').toLowerCase().replace(/^-|-$/g, '')
  if (ascii && ascii.length >= 2) return ascii.slice(0, 32)
  return fallback
}

/** u/ext-b4f13dfb@1.0.0 → ext-b4f13dfb */
export function extensionIdToSlug(extensionId: string): string {
  return extensionId.replace(/^u\//, '').replace(/@.*$/, '')
}

/** 优先从 keywords 中取可作 manifest id 的 ASCII slug（与 generate 策略对齐） */
function pickSpecSlug(keywords: string[], displayName: string, sessionId: string): string {
  for (const kw of keywords) {
    if (kw.startsWith('/') || kw === '帮忙') continue
    const slug = slugifyKeyword(kw, '')
    if (slug.length >= 2) return slug
  }
  return slugifyKeyword(displayName, `ext-${sessionId.slice(0, 8)}`)
}

/** Refine / 已部署扩展：复用原 slug，避免「继续优化」部署出第二个 uplugin */
export function resolveDesignSpecSlug(
  session: PlanSession,
  keywords: string[],
  displayName: string
): string {
  const linked = session.linkedExtensionId ?? session.deployedUskillId
  if (session.refineMode && linked?.startsWith('u/')) {
    return extensionIdToSlug(linked)
  }
  if (session.designSpec?.slug?.trim()) {
    return session.designSpec.slug.trim()
  }
  if (session.deployedUskillId?.startsWith('u/')) {
    return extensionIdToSlug(session.deployedUskillId)
  }
  return pickSpecSlug(keywords, displayName, session.id)
}

export function normalizeSlashList(keywords: string[]): string[] {
  const out: string[] = []
  for (const kw of keywords) {
    const t = kw.trim()
    if (!t) continue
    const slash = t.startsWith('/') ? t : `/${t.replace(/\s+/g, '')}`
    if (!out.includes(slash)) out.push(slash)
  }
  return out
}

/** 从 slash / keywords 推导验收 smoke 句（持久化 Spec 空数组时回填） */
export function deriveSmokeMessages(spec: PlanDesignSpec): string[] {
  const kept = (spec.acceptance.smokeMessages ?? []).map((s) => s.trim()).filter(Boolean)
  if (kept.length) return kept
  const slash =
    spec.trigger.slash?.map((s) => s.trim()).filter(Boolean).length ?
      spec.trigger.slash
    : normalizeSlashList(spec.trigger.keywords)
  return [
    ...slash,
    ...spec.trigger.keywords.slice(0, 2).map((k) => k.trim()).filter((k) => k.length >= 2)
  ].filter(Boolean)
}

function finalizeSurfaceWidgetFields(spec: PlanDesignSpec): PlanDesignSpec {
  if (spec.ui.type !== 'surface') return spec
  const combined = [spec.purpose, spec.displayName, spec.trigger.keywords.join(' ')].join(' ')
  const widgetId = spec.ui.widgetId ?? inferWidgetIdFromText(combined)
  const primaryActions =
    spec.ui.primaryActions?.length ? spec.ui.primaryActions : ['开始', '重置']
  const widgetConfig = spec.ui.widgetConfig ?? defaultWidgetConfig(widgetId, primaryActions)
  const interactionScript =
    spec.ui.interactionScript?.length ?
      spec.ui.interactionScript
    : buildInteractionScriptForWidget(widgetId, primaryActions)
  const requiredLevel = spec.ui.requiredLevel ?? widgetRequiredLevel(widgetId)
  return {
    ...spec,
    ui: {
      ...spec.ui,
      widgetId,
      widgetConfig,
      interactionScript,
      requiredLevel,
      primaryActions
    }
  }
}

/** merge 后补齐 slash / smoke / widget，避免空数组覆盖自动推导值 */
export function finalizeDesignSpec(spec: PlanDesignSpec): PlanDesignSpec {
  const slash =
    spec.trigger.slash?.map((s) => s.trim()).filter(Boolean).length ?
      spec.trigger.slash
    : normalizeSlashList(spec.trigger.keywords)
  const smokeMessages = deriveSmokeMessages({ ...spec, trigger: { ...spec.trigger, slash } })
  return finalizeSurfaceWidgetFields({
    ...spec,
    trigger: { ...spec.trigger, slash },
    acceptance: { ...spec.acceptance, smokeMessages }
  })
}

export function inferUiTypeFromText(text: string): PlanUiType {
  const t = text.toLowerCase()
  if (/按钮|面板|窗口|界面|点击|输入框|列表|进度|图表|surface|ui/.test(t)) return 'surface'
  if (/提醒|注入|语气|对话|回复/.test(t)) return 'injection_only'
  return 'none'
}

export function buildDefaultDesignBrief(
  displayName: string,
  purpose: string,
  primaryActions: string[]
): PlanUiDesignBrief {
  return {
    userGoal: purpose || `使用 ${displayName}`,
    layout: 'single_column',
    sections: [
      { id: 'main', label: displayName, content: purpose || displayName },
      { id: 'controls', label: '操作', content: primaryActions.join(' / ') || '主操作' }
    ],
    states: [{ id: 'idle', label: '默认', visible: primaryActions.length ? [primaryActions[0]] : ['主界面'] }],
    interactions: primaryActions.map((control) => ({
      control,
      when: 'idle',
      effect: `执行 ${control}`
    })),
    feedback: ['操作后界面文案或样式即时变化']
  }
}

export function buildDesignSpecFromSession(session: PlanSession): PlanDesignSpec | null {
  const kind = resolvePlanArtifactKind(session)
  if (kind === 'undecided') return null

  const draft = session.dispatchDraft ?? {}
  const summary = session.planSummary
  const keywords = [...(draft.keywords ?? [])].filter(Boolean)
  if (!keywords.length && summary?.trigger) {
    keywords.push(...summary.trigger.split(/[·,，、;；|│]/).map((s) => s.trim()).filter(Boolean))
  }
  const keywordTitle = keywords.find((k) => !k.startsWith('/') && k !== '帮忙' && k.length >= 2)
  const displayName =
    keywordTitle ||
    (draft.summary?.trim() && draft.summary.trim().length <= 28 ? draft.summary.trim() : undefined) ||
    summary?.output?.trim()?.slice(0, 28) ||
    draft.summary?.trim()?.slice(0, 28) ||
    keywords[0] ||
    '自定义扩展'
  const purpose =
    draft.summary?.trim() ||
    summary?.output?.trim() ||
    displayName
  const slug = resolveDesignSpecSlug(session, keywords, displayName)
  const perms = draft.permissions?.length ? [...draft.permissions] : ['engine_read']
  const tier = inferTierFromPermissionIds(perms)
  const slash = normalizeSlashList(keywords)

  const combinedText = [
    purpose,
    summary?.output,
    summary?.trigger,
    ...(draft.scenarios ?? []),
    ...(draft.habits ?? [])
  ]
    .filter(Boolean)
    .join(' ')
  let uiType: PlanUiType = kind === 'uplugin' ? 'surface' : inferUiTypeFromText(combinedText)
  if (uiType === 'none' && kind === 'uskill') uiType = 'injection_only'

  const primaryActions =
    uiType === 'surface' ? ['开始', '重置'].slice(0, Math.max(2, Math.min(4, keywords.length || 2))) : []

  const existing = session.designSpec
  const widgetId =
    existing?.ui.widgetId ?? inferWidgetIdFromText(combinedText || displayName)

  const ui: PlanDesignSpecUi = {
    required: uiType === 'surface',
    type: uiType,
    surfaceTitle: displayName,
    primaryActions: existing?.ui.primaryActions?.length ? existing.ui.primaryActions : primaryActions,
    widgetId: uiType === 'surface' ? widgetId : undefined,
    widgetConfig:
      uiType === 'surface' ?
        (existing?.ui.widgetConfig ?? defaultWidgetConfig(widgetId, primaryActions))
      : undefined,
    interactionScript:
      uiType === 'surface' ?
        (existing?.ui.interactionScript ??
          buildInteractionScriptForWidget(widgetId, primaryActions))
      : undefined,
    requiredLevel: uiType === 'surface' ? widgetRequiredLevel(widgetId) : undefined,
    openHint: '主聊天 slash 会自动打开独立窗口；或在扩展中心点「打开窗口」',
    designBrief:
      existing?.ui.designBrief ??
      (uiType === 'surface' ? buildDefaultDesignBrief(displayName, purpose, primaryActions) : undefined),
    wireframeApproved: existing?.ui.wireframeApproved ?? uiType !== 'surface'
  }

  const smokeMessages = [
    ...slash,
    ...keywords.slice(0, 2).filter((k) => k.length >= 2)
  ].filter(Boolean)

  return {
    version: '1.0.0',
    artifactKind: kind,
    displayName,
    slug,
    purpose,
    trigger: {
      keywords: keywords.length ? keywords : ['帮忙'],
      slash: existing?.trigger.slash?.length ? existing.trigger.slash : slash,
      mode: draft.mode?.trim() || 'dispatched',
      subtype: 'keyword_hint'
    },
    permissions: {
      requested: perms,
      tier,
      userFacingReason: summary?.permissions?.trim()
    },
    ui,
    acceptance: {
      smokeMessages: existing?.acceptance.smokeMessages?.length
        ? existing.acceptance.smokeMessages
        : smokeMessages,
      expectContextInjection: uiType !== 'none',
      expectSurfaceOpenable: uiType === 'surface',
      expectNotification: perms.includes('system_notification')
    },
    constraints: { adultModeSafe: true },
    openQuestions: existing?.openQuestions ?? []
  }
}

export function mergeDesignSpec(
  prev: PlanDesignSpec | null | undefined,
  patch: PlanDesignSpecPatch
): PlanDesignSpec {
  if (!prev) {
    throw new Error('mergeDesignSpec 需要已有 Spec')
  }
  const uiPatch: Partial<PlanDesignSpecUi> = patch.ui ?? {}
  const prevUi = prev.ui
  const uiChanged =
    (uiPatch.widgetId !== undefined && uiPatch.widgetId !== prevUi.widgetId) ||
    (uiPatch.primaryActions?.length &&
      uiPatch.primaryActions.join('|') !== prevUi.primaryActions.join('|')) ||
    (uiPatch.designBrief &&
      JSON.stringify(uiPatch.designBrief) !== JSON.stringify(prevUi.designBrief))

  const wireframeApproved =
    uiChanged && prevUi.wireframeApproved ? false : (uiPatch.wireframeApproved ?? prevUi.wireframeApproved)

  return {
    ...prev,
    ...patch,
    trigger: { ...prev.trigger, ...patch.trigger },
    permissions: { ...prev.permissions, ...patch.permissions },
    ui: {
      ...prev.ui,
      ...patch.ui,
      wireframeApproved,
      designBrief: patch.ui?.designBrief
        ? { ...prev.ui.designBrief!, ...patch.ui.designBrief }
        : prev.ui.designBrief
    },
    acceptance: { ...prev.acceptance, ...patch.acceptance },
    openQuestions: patch.openQuestions ?? prev.openQuestions
  }
}

export function evaluateDesignSpecGate(spec: PlanDesignSpec | null | undefined): DesignSpecGateResult {
  const missing: string[] = []
  if (!spec) {
    return { ready: false, missing: ['设计规格尚未生成'] }
  }
  const s = finalizeDesignSpec(spec)
  if (spec.artifactKind === 'undecided') missing.push('产物类型未确定（uskill / uplugin）')
  if (!s.displayName?.trim()) missing.push('displayName')
  if (!s.slug?.trim()) missing.push('slug')
  if (!s.purpose?.trim()) missing.push('purpose')
  if (!s.trigger.keywords?.length) missing.push('至少 1 个触发关键词')
  if (!s.trigger.slash?.length) missing.push('至少 1 个 slash 命令（以 / 开头）')
  if (!s.acceptance.smokeMessages?.length) missing.push('验收 smoke 句子')
  if (s.openQuestions?.length) {
    missing.push(`待澄清：${s.openQuestions.join('；')}`)
  }
  if (s.ui.type === 'surface') {
    if (!s.ui.primaryActions?.length) missing.push('Surface 主操作按钮')
    if (!s.ui.widgetId) missing.push('Surface widgetId（OID 模板）')
    if (!s.ui.interactionScript?.length) missing.push('interactionScript（Gate3 交互验收）')
    if (!s.ui.designBrief?.userGoal?.trim()) missing.push('UI 用户目标（designBrief.userGoal）')
    if (!s.ui.designBrief?.sections?.length) missing.push('UI 区块（designBrief.sections）')
    if (!s.ui.wireframeApproved) missing.push('界面方案尚未确认（请点击「界面 OK」）')
    const briefText = [
      s.ui.designBrief?.userGoal ?? '',
      ...(s.ui.designBrief?.sections?.map((x) => x.content) ?? [])
    ].join('\n')
    for (const msg of validateWidgetUiClaims(
      s.ui.widgetId,
      s.purpose,
      briefText,
      s.ui.primaryActions
    )) {
      missing.push(msg)
    }
  }
  return { ready: missing.length === 0, missing }
}

export function syncSessionDesignSpec(session: PlanSession): PlanSession {
  const built = buildDesignSpecFromSession(session)
  if (!built) return session
  let merged = session.designSpec ? mergeDesignSpec(built, session.designSpec) : built
  merged = mergeDesignSpecFromStructuredMessages(session, merged)
  return { ...session, designSpec: finalizeDesignSpec(merged) }
}

/** 从 Plan Agent 结构化 uiDesign 块累积合并 Surface 设计 */
export function mergeDesignSpecFromStructuredMessages(
  session: PlanSession,
  spec: PlanDesignSpec
): PlanDesignSpec {
  let out = spec
  for (const m of session.messages) {
    if (m.role !== 'assistant') continue
    const structured = parsePlanStructuredBlock(m.content)
    const ui = structured?.uiDesign
    if (!ui || ui.type !== 'surface') continue

    const sections =
      ui.sections?.length ?
        ui.sections
      : out.ui.designBrief?.sections?.length ?
        out.ui.designBrief.sections
      : [{ id: 'main', label: '主区', content: ui.userGoal?.trim() || out.purpose }]

    const primaryActions =
      ui.primaryActions?.length ? ui.primaryActions : out.ui.primaryActions

    out = mergeDesignSpec(out, {
      ui: {
        type: 'surface',
        required: true,
        primaryActions,
        wireframeApproved: out.ui.wireframeApproved,
        designBrief: {
          userGoal: ui.userGoal?.trim() || out.ui.designBrief?.userGoal || out.purpose,
          layout: out.ui.designBrief?.layout ?? 'single_column',
          sections,
          states: out.ui.designBrief?.states ?? [{ id: 'idle', label: '默认', visible: sections.map((s) => s.id) }],
          interactions: primaryActions.map((control) => ({
            control,
            when: 'idle',
            effect: `执行 ${control}`
          })),
          feedback: out.ui.designBrief?.feedback ?? ['操作后界面文案或样式即时变化']
        }
      },
      trigger: ui.slash?.length ? { ...out.trigger, slash: normalizeSlashList(ui.slash) } : undefined
    })
  }
  return out
}

export function formatDesignSpecWireframeAscii(spec: PlanDesignSpec): string {
  const ui = spec.ui
  if (ui.type !== 'surface' || !ui.designBrief) {
    return ui.type === 'injection_only'
      ? '本扩展仅通过对话注入生效，无独立界面。'
      : '本扩展无独立界面。'
  }
  const b = ui.designBrief
  const actions = ui.primaryActions.map((a) => `[ ${a} ]`).join('  ')
  const sections = b.sections.map((s) => `· ${s.label}：${s.content}`).join('\n')
  const states = b.states.map((s) => `${s.label} → ${s.visible.join(', ')}`).join('\n')
  return [
    `目标：${b.userGoal}`,
    `布局：${b.layout}`,
    '┌─────────────────────────────┐',
    `│  ${ui.surfaceTitle ?? spec.displayName}`,
    sections ? `│  ${sections.replace(/\n/g, '\n│  ')}` : '',
    actions ? `│  ${actions}` : '',
    '└─────────────────────────────┘',
    states ? `状态流：\n${states}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}
