import type { PlanSession } from '../../../../shared/planSession'

export type {
  AgentEvent,
  AgentEventKind,
  AgentEventPayload,
  AgentRunKind,
  AgentRunMeta,
  AgentRunPhase,
  AgentRunStatus,
  GenerateStrategy
} from '../../../../shared/openforuAgentTypes'

export {
  AGENT_PHASE_PERCENT as PHASE_PERCENT,
  AGENT_PHASE_TO_DEPLOY_STEP as PHASE_TO_DEPLOY_STEP,
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  DEFAULT_MAX_LLM_REPAIR_ATTEMPTS,
  DEFAULT_MAX_DELIVERY_ROUNDS
} from '../../../../shared/openforuAgentTypes'

export interface DeployAgentResult {
  session: PlanSession
  extensionId: string
  notifyText: string
}

import type { GenerateStrategy } from '../../../../shared/openforuAgentTypes'

export interface DeployPipelineInput {
  sessionId: string
  strategy?: GenerateStrategy
  maxRepairAttempts?: number
}

export interface DeployPipelineOutput extends DeployAgentResult {
  runId: string
}
