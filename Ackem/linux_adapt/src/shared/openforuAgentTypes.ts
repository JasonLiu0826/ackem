import type { PlanDeployStepId } from './planDeploySteps'
import type { PlanArtifactKind } from './planArtifact'

/** AC-1+ 生效；AC-0 实际走 deterministic */
export type GenerateStrategy =
  | 'auto'
  | 'deterministic'
  | 'hybrid_skill'
  | 'hybrid_inject'
  | 'llm_generate'
  | 'llm_uplugin_code'

/** 设置项：auto 按产物类型选 hybrid */
export type OpenForUGenerateStrategySetting = GenerateStrategy | 'auto'

export type AgentRunPhase =
  | 'queued'
  | 'planning'
  | 'generating'
  | 'validating'
  | 'repairing'
  | 'deploying'
  | 'verifying'
  | 'done'
  | 'failed'
  | 'cancelled'

export type AgentRunKind = 'plan_turn' | 'deploy_pipeline' | 'regenerate_only'

export type AgentRunStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export type AgentEventKind =
  | 'phase_change'
  | 'log'
  | 'progress'
  | 'artifact'
  | 'validation'
  | 'error'
  | 'repair'

export interface AgentRunMeta {
  runId: string
  sessionId: string
  kind: AgentRunKind
  phase: AgentRunPhase
  status: AgentRunStatus
  artifactKind: PlanArtifactKind
  strategy: GenerateStrategy
  startedAt: string
  updatedAt: string
  repairAttempts: number
  maxRepairAttempts: number
  llmRepairAttempts?: number
  maxLlmRepairAttempts?: number
  /** 交付收敛：第几轮 generate→deploy→verify */
  deliveryRound?: number
  maxDeliveryRounds?: number
  lastError?: string
  deployedExtensionId?: string
}

export interface AgentEventPayload {
  stepId?: PlanDeployStepId
  percent?: number
  errors?: string[]
  warnings?: string[]
  filePath?: string
  repairAttempt?: number
}

export interface AgentEvent {
  runId: string
  sessionId: string
  ts: string
  phase: AgentRunPhase
  kind: AgentEventKind
  message: string
  payload?: AgentEventPayload
}

export const DEFAULT_MAX_REPAIR_ATTEMPTS = 6

/** P2：LLM 修复 bundle（在确定性修复之后） */
export const DEFAULT_MAX_LLM_REPAIR_ATTEMPTS = 3

/** 完整 generate→deploy→verify 收敛轮次（持久交付） */
export const DEFAULT_MAX_DELIVERY_ROUNDS = 5

export const AGENT_PHASE_TO_DEPLOY_STEP: Partial<Record<AgentRunPhase, PlanDeployStepId>> = {
  generating: 'generate',
  validating: 'validate',
  repairing: 'validate',
  deploying: 'write',
  verifying: 'register',
  done: 'notify'
}

export const AGENT_PHASE_PERCENT: Partial<Record<AgentRunPhase, number>> = {
  queued: 0,
  generating: 48,
  validating: 62,
  repairing: 65,
  deploying: 80,
  verifying: 90,
  done: 100
}
