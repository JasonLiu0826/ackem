import type { PlanSession } from '../../../../shared/planSession'
import type { PlanArtifactKind } from '../../../../shared/planArtifact'
import { PERMISSION_GROUPS, FORBIDDEN_USER_PLUGIN_PERMISSIONS } from '../types'

export type GenerateContextPack = {
  sessionId: string
  artifactKind: PlanArtifactKind
  planSummary: string
  dispatchSummary: string
  habits: string[]
  scenarios: string[]
  keywords: string[]
  allowedPermissions: string[]
  forbiddenPermissions: string[]
}

export function buildGenerateContextPack(
  session: PlanSession,
  artifactKind: Exclude<PlanArtifactKind, 'undecided'>
): GenerateContextPack {
  const draft = session.dispatchDraft ?? {}
  return {
    sessionId: session.id,
    artifactKind,
    planSummary: session.planSummary?.output?.trim() ?? '',
    dispatchSummary: draft.summary?.trim() ?? session.planSummary?.output?.trim() ?? '',
    habits: draft.habits ?? [],
    scenarios: draft.scenarios ?? [],
    keywords: draft.keywords ?? [],
    allowedPermissions: Object.keys(PERMISSION_GROUPS).filter(
      (p) => PERMISSION_GROUPS[p].level !== 'forbidden'
    ),
    forbiddenPermissions: [...FORBIDDEN_USER_PLUGIN_PERMISSIONS]
  }
}
