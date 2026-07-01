import type { PlanDispatchDraft, PlanSummary } from './planSession'

/** V-08：Plan Agent 每轮可选结构化块（与 Markdown 双通道） */
export type PlanDispatchProgress = {
  keywords?: string[]
  habits?: string[]
  scenarios?: string[]
  summary?: string
  mode?: string
  permissions?: string[]
}

export type PlanStructuredSummary = {
  title?: string
  oneLiner?: string
  artifactType?: string
  trigger?: string
  output?: string
  permissions?: string
  capabilities?: string[]
  constraints?: string[]
}

export type PlanTurnStructured = {
  artifactType?: string
  dispatchProgress?: PlanDispatchProgress
  planSummary?: PlanStructuredSummary
  uiDesign?: PlanUiDesignStructured
  shouldConverge?: boolean
  confirmed?: Record<string, string>
}

export type PlanUiDesignStructured = {
  type?: 'surface' | 'injection_only' | 'none'
  userGoal?: string
  primaryActions?: string[]
  sections?: Array<{ id: string; label: string; content: string }>
  slash?: string[]
}

const STRUCTURED_FENCE_RE = /```(?:json|plan-structured)\s*([\s\S]*?)```/i

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const list = v.map((x) => String(x).trim()).filter(Boolean)
  return list.length ? list : undefined
}

function normalizeStructured(raw: Record<string, unknown>): PlanTurnStructured | null {
  const dpRaw = raw.dispatchProgress
  const dispatchProgress =
    dpRaw && typeof dpRaw === 'object'
      ? ({
          keywords: asStringArray((dpRaw as Record<string, unknown>).keywords),
          habits: asStringArray((dpRaw as Record<string, unknown>).habits),
          scenarios: asStringArray((dpRaw as Record<string, unknown>).scenarios),
          summary:
            typeof (dpRaw as Record<string, unknown>).summary === 'string'
              ? (dpRaw as Record<string, unknown>).summary as string
              : undefined,
          mode:
            typeof (dpRaw as Record<string, unknown>).mode === 'string'
              ? (dpRaw as Record<string, unknown>).mode as string
              : undefined,
          permissions: asStringArray((dpRaw as Record<string, unknown>).permissions)
        } satisfies PlanDispatchProgress)
      : undefined

  const psRaw = raw.planSummary
  const planSummary =
    psRaw && typeof psRaw === 'object'
      ? ({
          title: typeof (psRaw as Record<string, unknown>).title === 'string' ? (psRaw as Record<string, unknown>).title as string : undefined,
          oneLiner:
            typeof (psRaw as Record<string, unknown>).oneLiner === 'string'
              ? (psRaw as Record<string, unknown>).oneLiner as string
              : undefined,
          artifactType:
            typeof (psRaw as Record<string, unknown>).artifactType === 'string'
              ? (psRaw as Record<string, unknown>).artifactType as string
              : undefined,
          trigger:
            typeof (psRaw as Record<string, unknown>).trigger === 'string'
              ? (psRaw as Record<string, unknown>).trigger as string
              : undefined,
          output:
            typeof (psRaw as Record<string, unknown>).output === 'string'
              ? (psRaw as Record<string, unknown>).output as string
              : undefined,
          permissions:
            typeof (psRaw as Record<string, unknown>).permissions === 'string'
              ? (psRaw as Record<string, unknown>).permissions as string
              : undefined,
          capabilities: asStringArray((psRaw as Record<string, unknown>).capabilities),
          constraints: asStringArray((psRaw as Record<string, unknown>).constraints)
        } satisfies PlanStructuredSummary)
      : undefined

  const uiRaw = raw.uiDesign
  const uiDesign =
    uiRaw && typeof uiRaw === 'object'
      ? ({
          type:
            (uiRaw as Record<string, unknown>).type === 'surface' ||
            (uiRaw as Record<string, unknown>).type === 'injection_only' ||
            (uiRaw as Record<string, unknown>).type === 'none'
              ? ((uiRaw as Record<string, unknown>).type as PlanUiDesignStructured['type'])
              : undefined,
          userGoal:
            typeof (uiRaw as Record<string, unknown>).userGoal === 'string'
              ? ((uiRaw as Record<string, unknown>).userGoal as string)
              : undefined,
          primaryActions: asStringArray((uiRaw as Record<string, unknown>).primaryActions),
          slash: asStringArray((uiRaw as Record<string, unknown>).slash),
          sections: Array.isArray((uiRaw as Record<string, unknown>).sections)
            ? ((uiRaw as Record<string, unknown>).sections as unknown[])
                .map((sec) => {
                  if (!sec || typeof sec !== 'object') return null
                  const o = sec as Record<string, unknown>
                  const id = typeof o.id === 'string' ? o.id.trim() : ''
                  const label = typeof o.label === 'string' ? o.label.trim() : ''
                  const content = typeof o.content === 'string' ? o.content.trim() : ''
                  if (!id || !label) return null
                  return { id, label, content: content || label }
                })
                .filter((x): x is { id: string; label: string; content: string } => x != null)
            : undefined
        } satisfies PlanUiDesignStructured)
      : undefined

  let confirmed: Record<string, string> | undefined
  const confRaw = raw.confirmed
  if (confRaw && typeof confRaw === 'object') {
    confirmed = {}
    for (const [k, v] of Object.entries(confRaw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) confirmed[k] = v.trim()
    }
    if (!Object.keys(confirmed).length) confirmed = undefined
  }

  const artifactType = typeof raw.artifactType === 'string' ? raw.artifactType.trim() : undefined
  const shouldConverge = raw.shouldConverge === true

  if (
    !artifactType &&
    !dispatchProgress &&
    !planSummary &&
    !uiDesign &&
    !confirmed &&
    !shouldConverge
  ) {
    return null
  }

  return {
    artifactType: artifactType || undefined,
    dispatchProgress,
    planSummary,
    uiDesign,
    shouldConverge: shouldConverge || undefined,
    confirmed
  }
}

/** 从 assistant 文本解析 ```json / ```plan-structured 块 */
export function parsePlanStructuredBlock(content: string): PlanTurnStructured | null {
  const tryParse = (s: string): PlanTurnStructured | null => {
    try {
      const j = JSON.parse(s) as Record<string, unknown>
      return normalizeStructured(j)
    } catch {
      return null
    }
  }

  const trimmed = content.trim()
  const fence = trimmed.match(STRUCTURED_FENCE_RE)
  if (fence?.[1]) {
    const inner = tryParse(fence[1].trim())
    if (inner) return inner
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const salvage = tryParse(trimmed.slice(start, end + 1))
    if (salvage) return salvage
  }

  return null
}

/** 剥离结构化 JSON 块，供 Plan 对话区展示 */
export function stripPlanStructuredBlock(content: string): string {
  return content.replace(STRUCTURED_FENCE_RE, '').trim()
}

function mergeStringField(prev: string | undefined, next: string | undefined): string | undefined {
  const n = next?.trim()
  if (!n) return prev
  const p = prev?.trim()
  if (!p || n.length >= p.length) return n
  return p
}

function mergeStringList(prev: string[] | undefined, next: string[] | undefined): string[] | undefined {
  if (!next?.length) return prev
  const merged = [...(prev ?? [])]
  for (const item of next) {
    if (!merged.includes(item)) merged.push(item)
  }
  return merged.length ? merged : prev
}

/** 结构化 JSON → dispatchDraft（累积合并） */
export function mergeDispatchDraftFromStructured(
  prev: PlanDispatchDraft,
  structured: PlanTurnStructured
): PlanDispatchDraft {
  const next: PlanDispatchDraft = { ...prev }
  const dp = structured.dispatchProgress

  if (structured.artifactType?.trim()) {
    next.artifactType = mergeStringField(next.artifactType, structured.artifactType)
  }

  if (structured.confirmed) {
    for (const [k, v] of Object.entries(structured.confirmed)) {
      const key = k.trim().toLowerCase()
      if (key === '类型' || key === 'artifact' || key === 'artifacttype') {
        next.artifactType = mergeStringField(next.artifactType, v)
      } else if (key === 'mode' || key === '调度模式') {
        next.mode = mergeStringField(next.mode, v)
      } else if (key === 'summary' || key === '摘要' || key === '功能摘要') {
        next.summary = mergeStringField(next.summary, v)
      } else if (key === 'habits' || key === '习惯') {
        next.habits = mergeStringList(next.habits, v.split(/[·,，、;；|│]/).map((s) => s.trim()).filter(Boolean))
      } else if (key === 'scenarios' || key === '场景') {
        next.scenarios = mergeStringList(next.scenarios, v.split(/[·,，、;；|│]/).map((s) => s.trim()).filter(Boolean))
      } else if (key === 'keywords' || key === '关键词') {
        next.keywords = mergeStringList(next.keywords, v.split(/[·,，、;；|│]/).map((s) => s.trim()).filter(Boolean))
      } else if (key === 'permissions' || key === '权限') {
        next.permissions = mergeStringList(next.permissions, v.split(/[·,，、;；|│]/).map((s) => s.trim()).filter(Boolean))
      }
    }
  }

  if (dp) {
    next.summary = mergeStringField(next.summary, dp.summary)
    next.mode = mergeStringField(next.mode, dp.mode)
    next.habits = mergeStringList(next.habits, dp.habits)
    next.scenarios = mergeStringList(next.scenarios, dp.scenarios)
    next.keywords = mergeStringList(next.keywords, dp.keywords)
    next.permissions = mergeStringList(next.permissions, dp.permissions)
  }

  const ps = structured.planSummary
  if (ps) {
    next.artifactType = mergeStringField(next.artifactType, ps.artifactType)
    if (ps.oneLiner?.trim()) {
      next.summary = mergeStringField(next.summary, ps.oneLiner)
    }
    if (ps.trigger?.trim() && !next.mode) {
      next.mode = ps.trigger
    }
    if (ps.permissions?.trim()) {
      next.permissions = mergeStringList(
        next.permissions,
        ps.permissions.split(/[·,，、;；|│]/).map((s) => s.trim()).filter(Boolean)
      )
    }
  }

  next.updatedAt = new Date().toISOString()
  return next
}

/** 结构化 planSummary → PlanSummary（供确认卡） */
export function planSummaryFromStructured(structured: PlanTurnStructured): PlanSummary | null {
  const ps = structured.planSummary
  if (!ps) return null

  const rawLines: string[] = []
  if (ps.artifactType?.trim()) rawLines.push(`| 类型 | ${ps.artifactType.trim()} |`)
  if (ps.trigger?.trim()) rawLines.push(`| 触发 | ${ps.trigger.trim()} |`)
  if (ps.output?.trim()) rawLines.push(`| 输出 | ${ps.output.trim()} |`)
  if (ps.permissions?.trim()) rawLines.push(`| 权限 | ${ps.permissions.trim()} |`)
  if (ps.capabilities?.length) rawLines.push(`| 能力 | ${ps.capabilities.join('、')} |`)
  if (ps.constraints?.length) rawLines.push(`| 约束 | ${ps.constraints.join('、')} |`)

  if (!rawLines.length && !ps.oneLiner?.trim()) return null

  return {
    artifactType: ps.artifactType?.trim(),
    trigger: ps.trigger?.trim(),
    output: ps.output?.trim() ?? ps.oneLiner?.trim(),
    permissions: ps.permissions?.trim(),
    rawLines
  }
}
