import type { AckemCodeSettings, PermissionMode } from '../../shared/types.js'
import { effectivePlanExploreAgents } from '../agent/agentCollaboration.js'
import type { PermissionBroker } from '../agent/permissions.js'
import {
  getPlanFilePath,
  planExists,
  readPlan,
  clearPlanSlug
} from './plans.js'
import {
  applyPlanAllowedPrompts,
  enterPlanModeSession,
  exitPlanModeApproved,
  exitPlanModeRejected,
  isPlanModeInterviewEnabled,
  type PlanSessionSlice
} from './planModeState.js'

export type PlanBridgeSession = PlanSessionSlice & {
  id: string
  runtimeCwd?: string
}

export function createPlanBridge(
  session: PlanBridgeSession,
  settings: AckemCodeSettings,
  permissions: PermissionBroker,
  emit: (event: import('../../shared/types.js').AgentEvent) => void
) {
  const cwd = () => session.runtimeCwd || settings.cwd || process.cwd()

  return {
    getPlanFilePath: (): string | null => {
      if (!session.id) return null
      return getPlanFilePath(session.id, settings, cwd())
    },
    getPrePlanMode: (): PermissionMode | null => session.prePlanMode,
    planModeInterviewPhase: isPlanModeInterviewEnabled(settings),
    plansDirectory: settings.plansDirectory,
    onEnterPlanMode: async (fromMode: PermissionMode): Promise<string> => {
      const fp = await enterPlanModeSession(
        session,
        fromMode,
        session.id,
        settings,
        cwd()
      )
      const exists = await planExists(session.id, settings, cwd())
      session.planFileExists = exists
      emit({ type: 'plan_mode_entered', planFilePath: fp, planExists: exists })
      return fp
    },
    onExitPlanModeApproved: async (
      nextMode: PermissionMode,
      opts?: { allowedPrompts?: Array<{ tool: string; prompt: string }> }
    ): Promise<void> => {
      applyPlanAllowedPrompts(permissions, opts?.allowedPrompts)
      const mode = exitPlanModeApproved(session, nextMode)
      emit({ type: 'mode_changed', mode })
    },
    onExitPlanModeRejected: async (
      kind: 'keep_planning' | 'exit_to_default'
    ): Promise<void> => {
      const mode = exitPlanModeRejected(session, kind)
      if (kind === 'exit_to_default') {
        emit({ type: 'mode_changed', mode })
      }
    },
    onPlanFileUpdated: (planFilePath: string, chars: number): void => {
      session.planFileExists = chars > 0
      emit({ type: 'plan_file_updated', planFilePath, chars })
    },
    getPlanRuntime: () => ({
      planFilePath: getPlanFilePath(session.id, settings, cwd()),
      planEnterAttachmentFullSent: session.planEnterAttachmentFullSent,
      needsPlanModeExitAttachment: session.needsPlanModeExitAttachment,
      hasExitedPlanMode: session.hasExitedPlanMode,
      prePlanMode: session.prePlanMode,
      interviewPhase: isPlanModeInterviewEnabled(settings),
      exploreN: effectivePlanExploreAgents(settings),
      planFileExists: session.planFileExists
    }),
    setPlanEnterAttachmentFullSent: (v: boolean) => {
      session.planEnterAttachmentFullSent = v
    },
    consumePlanModeExitAttachment: (): boolean => {
      if (!session.needsPlanModeExitAttachment) return false
      session.needsPlanModeExitAttachment = false
      return true
    },
    transitionModeManual: async (
      from: PermissionMode,
      to: PermissionMode
    ): Promise<void> => {
      if (to === 'plan' && from !== 'plan') {
        await enterPlanModeSession(session, from, session.id, settings, cwd())
        const fp = getPlanFilePath(session.id, settings, cwd())
        const exists = await planExists(session.id, settings, cwd())
        session.planFileExists = exists
        emit({ type: 'plan_mode_entered', planFilePath: fp, planExists: exists })
      } else if (from === 'plan' && to !== 'plan') {
        exitPlanModeApproved(session, to)
      }
      session.mode = to
    },
    clearPlanSession: (): void => {
      clearPlanSlug(session.id)
      session.prePlanMode = null
      session.hasExitedPlanMode = false
      session.needsPlanModeExitAttachment = false
      session.planEnterAttachmentFullSent = false
      session.planFileExists = false
    },
    readPlanForSlash: async (): Promise<{ path: string; content: string }> => {
      const fp = getPlanFilePath(session.id, settings, cwd())
      const content = await readPlan(session.id, settings, cwd())
      return { path: fp, content }
    }
  }
}

export function newPlanSessionFields(): Pick<
  PlanBridgeSession,
  | 'prePlanMode'
  | 'hasExitedPlanMode'
  | 'needsPlanModeExitAttachment'
  | 'planEnterAttachmentFullSent'
  | 'planFileExists'
> {
  return {
    prePlanMode: null,
    hasExitedPlanMode: false,
    needsPlanModeExitAttachment: false,
    planEnterAttachmentFullSent: false,
    planFileExists: false
  }
}
