import type { PlanArtifactKind } from './planArtifact'
import type { AgentRunMeta } from './openforuAgentTypes'
import {
  AGENT_PHASE_PERCENT,
  AGENT_PHASE_TO_DEPLOY_STEP
} from './openforuAgentTypes'
import { planStageIndex, type PlanStageId } from './planUi'

export type PlanDeployStepId =
  | 'confirm'
  | 'generate'
  | 'validate'
  | 'write'
  | 'register'
  | 'notify'

export type PlanDeployStepState = 'done' | 'active' | 'pending' | 'skipped' | 'error'

export const PLAN_DEPLOY_STEPS: { id: PlanDeployStepId; label: string }[] = [
  { id: 'confirm', label: '确认方案' },
  { id: 'generate', label: '生成 manifest / skill.json' },
  { id: 'validate', label: '校验 dispatch 配置' },
  { id: 'write', label: '写入磁盘' },
  { id: 'register', label: '注册并激活' },
  { id: 'notify', label: '通知主聊天' }
]

export type PlanDeployStepView = {
  id: PlanDeployStepId
  label: string
  state: PlanDeployStepState
}

export type PlanWorkspaceProgress = {
  percent: number
  currentLabel: string
  deploySteps: PlanDeployStepView[]
  showDeployPipeline: boolean
  deployComplete: boolean
  deployError?: string
}

const STAGE_PERCENT: Record<PlanStageId, number> = {
  understand: 12,
  design: 28,
  generate: 48,
  validate: 62,
  deploy: 72
}

function inferDeployActiveStep(lastAssistantMsg: string, busy: boolean): PlanDeployStepId {
  if (/部署失败|❌/.test(lastAssistantMsg)) return 'write'
  if (/部署完成|✅/.test(lastAssistantMsg)) return 'notify'
  if (/正在生成|⏳/.test(lastAssistantMsg)) return busy ? 'generate' : 'validate'
  if (busy) return 'generate'
  return 'generate'
}

const REPAIR_PHASE_LABEL = '自动修复中'

function stepStatesFromAgentRun(run: AgentRunMeta): PlanDeployStepView[] {
  if (run.status === 'completed' || run.phase === 'done') {
    return PLAN_DEPLOY_STEPS.map((s) => ({ ...s, state: 'done' as const }))
  }

  if (run.status === 'cancelled' || run.phase === 'cancelled') {
    return PLAN_DEPLOY_STEPS.map((s) => ({
      ...s,
      state: s.id === 'confirm' ? ('done' as const) : ('pending' as const)
    }))
  }

  if (run.status === 'failed' || run.phase === 'failed') {
    const active =
      AGENT_PHASE_TO_DEPLOY_STEP[run.phase] ??
      AGENT_PHASE_TO_DEPLOY_STEP.deploying ??
      'write'
    return PLAN_DEPLOY_STEPS.map((s) => {
      if (s.id === 'confirm') return { ...s, state: 'done' as const }
      const idx = PLAN_DEPLOY_STEPS.findIndex((x) => x.id === s.id)
      const activeIdx = PLAN_DEPLOY_STEPS.findIndex((x) => x.id === active)
      if (idx < activeIdx) return { ...s, state: 'done' as const }
      if (s.id === active) return { ...s, state: 'error' as const }
      return { ...s, state: 'pending' as const }
    })
  }

  const activeId = AGENT_PHASE_TO_DEPLOY_STEP[run.phase] ?? 'generate'
  const activeIdx = PLAN_DEPLOY_STEPS.findIndex((s) => s.id === activeId)

  return PLAN_DEPLOY_STEPS.map((s, i) => {
    if (s.id === 'confirm') return { ...s, state: 'done' as const }
    if (i < activeIdx) return { ...s, state: 'done' as const }
    if (s.id === activeId) return { ...s, state: 'active' as const }
    return { ...s, state: 'pending' as const }
  })
}

function labelFromAgentRun(run: AgentRunMeta): string {
  if (run.status === 'completed' || run.phase === 'done') {
    return '部署完成 · 可在主聊天触发'
  }
  if (run.status === 'failed' || run.phase === 'failed') {
    return run.lastError ? `部署失败 · ${run.lastError}` : '部署失败 · 请查看对话或重试'
  }
  if (run.status === 'cancelled' || run.phase === 'cancelled') {
    return '部署已取消'
  }
  if (run.phase === 'verifying') {
    return '触发验证（smoke）'
  }
  if (run.phase === 'repairing') {
    const n = run.repairAttempts > 0 ? run.repairAttempts : 1
    return `${REPAIR_PHASE_LABEL}（第 ${n} 次）`
  }
  const active = PLAN_DEPLOY_STEPS.find(
    (s) => s.id === (AGENT_PHASE_TO_DEPLOY_STEP[run.phase] ?? 'generate')
  )
  return active?.label ?? '部署进行中'
}

export function shouldUseAgentDeployProgress(
  agentRun: AgentRunMeta | null | undefined,
  planConfirmed: boolean
): boolean {
  if (!agentRun || agentRun.kind !== 'deploy_pipeline') return false
  if (agentRun.status === 'cancelled') return true
  return planConfirmed || agentRun.status === 'running' || agentRun.status === 'failed'
}

function stepStatesForDeploy(input: {
  planConfirmed: boolean
  deployedUskillId?: string
  busy: boolean
  lastAssistantMsg: string
  deployFailed: boolean
}): PlanDeployStepView[] {
  const { planConfirmed, deployedUskillId, busy, lastAssistantMsg, deployFailed } = input

  if (!planConfirmed) {
    return PLAN_DEPLOY_STEPS.map((s) => ({
      ...s,
      state: s.id === 'confirm' ? 'pending' : 'pending'
    }))
  }

  if (deployedUskillId) {
    return PLAN_DEPLOY_STEPS.map((s) => ({ ...s, state: 'done' as const }))
  }

  if (deployFailed) {
    const active = inferDeployActiveStep(lastAssistantMsg, false)
    return PLAN_DEPLOY_STEPS.map((s) => {
      if (s.id === 'confirm') return { ...s, state: 'done' as const }
      const idx = PLAN_DEPLOY_STEPS.findIndex((x) => x.id === s.id)
      const activeIdx = PLAN_DEPLOY_STEPS.findIndex((x) => x.id === active)
      if (idx < activeIdx) return { ...s, state: 'done' as const }
      if (s.id === active) return { ...s, state: 'error' as const }
      return { ...s, state: 'pending' as const }
    })
  }

  const activeId = inferDeployActiveStep(lastAssistantMsg, busy)
  const activeIdx = PLAN_DEPLOY_STEPS.findIndex((s) => s.id === activeId)

  return PLAN_DEPLOY_STEPS.map((s, i) => {
    if (s.id === 'confirm') return { ...s, state: 'done' as const }
    if (i < activeIdx) return { ...s, state: 'done' as const }
    if (s.id === activeId) return { ...s, state: 'active' as const }
    return { ...s, state: 'pending' as const }
  })
}

export function resolvePlanWorkspaceProgress(input: {
  planStage: PlanStageId
  planConfirmed: boolean
  deployedUskillId?: string
  busy: boolean
  artifactKind: PlanArtifactKind
  lastAssistantMsg?: string
  /** AC-0：优先于聊天 regex 解析 */
  agentRun?: AgentRunMeta | null
}): PlanWorkspaceProgress {
  const lastAssistantMsg = input.lastAssistantMsg ?? ''
  const deployFailedFromChat = /部署失败|❌\s*\*\*部署失败/.test(lastAssistantMsg)
  // 仅以会话 persisted 的 deployedUskillId 为准，避免 agentRun 或前端残留导致假「已部署」
  const deployComplete = Boolean(input.deployedUskillId)
  const agentRun = input.agentRun
  const useAgent = shouldUseAgentDeployProgress(agentRun, input.planConfirmed)

  if (input.artifactKind === 'undecided') {
    const percent = STAGE_PERCENT[input.planStage]
    const stageLabel = ['理解需求', '设计方案', '生成代码', '校验', '部署'][planStageIndex(input.planStage)]
    return {
      percent,
      currentLabel: stageLabel,
      deploySteps: PLAN_DEPLOY_STEPS.map((s) => ({ ...s, state: 'pending' as const })),
      showDeployPipeline: false,
      deployComplete: false
    }
  }

  const deployFailed =
    useAgent && agentRun
      ? agentRun.status === 'failed' || agentRun.phase === 'failed'
      : deployFailedFromChat

  const deploySteps =
    useAgent && agentRun
      ? stepStatesFromAgentRun(agentRun)
      : stepStatesForDeploy({
          planConfirmed: input.planConfirmed,
          deployedUskillId: input.deployedUskillId,
          busy: input.busy,
          lastAssistantMsg,
          deployFailed: deployFailedFromChat
        })

  let percent = STAGE_PERCENT[input.planStage]
  if (deployComplete) {
    percent = 100
  } else if (useAgent && agentRun?.status === 'cancelled') {
    percent = 68
  } else if (useAgent && agentRun) {
    percent = AGENT_PHASE_PERCENT[agentRun.phase] ?? percent
  } else if (input.planConfirmed) {
    const doneCount = deploySteps.filter((s) => s.state === 'done').length
    const activeCount = deploySteps.some((s) => s.state === 'active') ? 0.5 : 0
    percent = Math.min(98, 68 + ((doneCount + activeCount) / PLAN_DEPLOY_STEPS.length) * 30)
  }

  const activeStep = deploySteps.find((s) => s.state === 'active')
  const currentLabel = deployComplete
    ? '部署完成 · 可在主聊天触发'
    : useAgent && agentRun
      ? labelFromAgentRun(agentRun)
      : deployFailed
        ? '部署失败 · 请查看对话或重试'
        : activeStep?.label ??
          (input.planConfirmed ? '等待部署' : STAGE_PERCENT[input.planStage] >= 62 ? '待确认方案' : 'Plan 对话进行中')

  return {
    percent,
    currentLabel,
    deploySteps,
    showDeployPipeline:
      input.planConfirmed || deployComplete || deployFailed || (useAgent && Boolean(agentRun)),
    deployComplete,
    deployError: deployFailed
      ? useAgent && agentRun?.lastError
        ? agentRun.lastError
        : '部署未成功'
      : undefined
  }
}
