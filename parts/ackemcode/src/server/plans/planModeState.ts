import type { AckemCodeSettings, PermissionMode } from '../../shared/types.js'
import type { PermissionBroker } from '../agent/permissions.js'
import { ensurePlanFile } from './plans.js'

export type PlanAllowedPrompt = {
  tool: 'bash' | 'Bash' | string
  prompt: string
}

export type PlanSessionSlice = {
  mode: PermissionMode
  prePlanMode: PermissionMode | null
  hasExitedPlanMode: boolean
  needsPlanModeExitAttachment: boolean
  planEnterAttachmentFullSent: boolean
  planFileExists: boolean
  planExploreCount: number
  planExploreFoci: string[]
}

export function enterPlanModeSession(
  session: PlanSessionSlice,
  fromMode: PermissionMode,
  sessionId: string,
  settings: Pick<AckemCodeSettings, 'plansDirectory'>,
  cwd: string
): Promise<string> {
  if (session.mode !== 'plan') {
    session.prePlanMode = fromMode
  }
  session.mode = 'plan'
  session.planEnterAttachmentFullSent = false
  session.planExploreCount = 0
  session.planExploreFoci = []
  return ensurePlanFile(sessionId, settings, cwd)
}

export function exitPlanModeApproved(
  session: PlanSessionSlice,
  targetMode?: PermissionMode
): PermissionMode {
  const restore =
    targetMode && targetMode !== 'plan'
      ? targetMode
      : session.prePlanMode && session.prePlanMode !== 'plan'
        ? session.prePlanMode
        : 'default'
  session.mode = restore
  session.prePlanMode = null
  session.hasExitedPlanMode = true
  session.needsPlanModeExitAttachment = true
  session.planEnterAttachmentFullSent = false
  return restore
}

export function exitPlanModeRejected(
  session: PlanSessionSlice,
  kind: 'keep_planning' | 'exit_to_default'
): PermissionMode {
  if (kind === 'exit_to_default') {
    const restore =
      session.prePlanMode && session.prePlanMode !== 'plan'
        ? session.prePlanMode
        : 'default'
    session.mode = restore
    session.prePlanMode = null
    session.hasExitedPlanMode = true
    session.needsPlanModeExitAttachment = true
    session.planEnterAttachmentFullSent = false
    return restore
  }
  return session.mode
}

/** CC buildPermissionUpdates allowedPrompts → session allow rules. */
export function applyPlanAllowedPrompts(
  permissions: PermissionBroker,
  prompts: PlanAllowedPrompt[] | undefined
): void {
  if (!prompts?.length) return
  for (const p of prompts) {
    const tool =
      String(p.tool).toLowerCase() === 'bash' ? 'bash' : String(p.tool).toLowerCase()
    const desc = String(p.prompt ?? '').trim()
    if (!desc) continue
    permissions.rememberSessionRule(`${tool}(prompt: ${desc})`)
  }
}

export function isPlanModeInterviewEnabled(
  settings: Pick<AckemCodeSettings, 'planModeInterviewPhase'>
): boolean {
  return settings.planModeInterviewPhase !== false
}
