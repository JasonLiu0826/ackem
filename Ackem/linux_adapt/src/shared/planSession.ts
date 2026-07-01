/** OpenForU Plan 会话持久化结构（data/openforu/sessions/<id>.json） */

export type PlanMessage = { role: 'user' | 'assistant'; content: string }

/** dispatch 四维 + 元数据，供 OF-04 生成 manifest 使用 */
export type PlanDispatchDraft = {
  artifactType?: string
  mode?: string
  summary?: string
  habits?: string[]
  scenarios?: string[]
  keywords?: string[]
  permissions?: string[]
  updatedAt?: string
}

/** Agent 输出的 📋 方案摘要（确认卡数据源） */
export type PlanSummary = {
  artifactType?: string
  trigger?: string
  output?: string
  permissions?: string
  extras?: string
  rawLines: string[]
}

export type PlanSession = {
  id: string
  createdAt: string
  messages: PlanMessage[]
  dispatchDraft?: PlanDispatchDraft
  planSummary?: PlanSummary | null
  planConfirmed?: boolean
  planConfirmedAt?: string
  /** OF-04：已部署的 uskill id */
  deployedUskillId?: string
  deployedAt?: string
  /** Create/Refine 轨设计规格 */
  designSpec?: import('./planDesignSpec').PlanDesignSpec | null
  /** Refine 模式：关联已部署扩展 id */
  linkedExtensionId?: string
  refineMode?: boolean
}

export function emptyDispatchDraft(): PlanDispatchDraft {
  return {}
}

export function normalizePlanSession(raw: Partial<PlanSession> & { id: string; createdAt: string }): PlanSession {
  return {
    id: raw.id,
    createdAt: raw.createdAt,
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    dispatchDraft: raw.dispatchDraft ?? emptyDispatchDraft(),
    planSummary: raw.planSummary ?? null,
    planConfirmed: raw.planConfirmed ?? false,
    planConfirmedAt: raw.planConfirmedAt,
    deployedUskillId: raw.deployedUskillId,
    deployedAt: raw.deployedAt,
    designSpec: raw.designSpec ?? null,
    linkedExtensionId: raw.linkedExtensionId,
    refineMode: raw.refineMode ?? false
  }
}

export function createEmptyPlanSession(sessionId: string, welcomeMessage: string): PlanSession {
  return normalizePlanSession({
    id: sessionId,
    createdAt: new Date().toISOString(),
    messages: [{ role: 'assistant', content: welcomeMessage }],
    dispatchDraft: emptyDispatchDraft(),
    planSummary: null,
    planConfirmed: false
  })
}

/** 渲染层组 PlanSession 快照（缺 createdAt 时用占位，不影响业务逻辑） */
export function buildPlanSessionView(
  partial: Omit<PlanSession, 'createdAt'> & { createdAt?: string }
): PlanSession {
  return normalizePlanSession({
    createdAt: partial.createdAt ?? new Date(0).toISOString(),
    ...partial
  })
}

export type PlanSessionMeta = Pick<
  PlanSession,
  | 'dispatchDraft'
  | 'planSummary'
  | 'planConfirmed'
  | 'planConfirmedAt'
  | 'deployedUskillId'
  | 'deployedAt'
  | 'designSpec'
  | 'linkedExtensionId'
  | 'refineMode'
>

/** IPC 载荷：用 null 显式表示「未部署」，避免 JSON 省略 undefined 导致前端状态残留 */
export type PlanSessionMetaPayload = {
  [K in keyof PlanSessionMeta]: PlanSessionMeta[K] extends string | undefined
    ? string | null | undefined
    : PlanSessionMeta[K]
}

export function planSessionMeta(session: PlanSession): PlanSessionMetaPayload {
  return {
    dispatchDraft: session.dispatchDraft ?? emptyDispatchDraft(),
    planSummary: session.planSummary ?? null,
    planConfirmed: session.planConfirmed ?? false,
    planConfirmedAt: session.planConfirmedAt ?? null,
    deployedUskillId: session.deployedUskillId ?? null,
    deployedAt: session.deployedAt ?? null,
    designSpec: session.designSpec ?? null,
    linkedExtensionId: session.linkedExtensionId ?? null,
    refineMode: session.refineMode ?? false
  }
}
