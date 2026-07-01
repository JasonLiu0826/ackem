/**
 * Plan Agent 每轮注入的会话真相快照 — 防止与 UI/Spec 状态矛盾的幻觉
 */
import type { PlanSession } from './planSession'
import { evaluateDesignSpecGate, finalizeDesignSpec } from './planDesignSpec'
import { formatWidgetCatalogForPrompt } from './openforuWidgetCatalog'
import type { AgentRunPhase } from './openforuAgentTypes'

export type PlanGroundingInput = {
  session: PlanSession
  agentPhase?: AgentRunPhase | null
}

export function buildPlanSessionGrounding(input: PlanGroundingInput): string {
  const { session, agentPhase } = input
  const spec = session.designSpec ? finalizeDesignSpec(session.designSpec) : null
  const gate = evaluateDesignSpecGate(spec)

  const lines: string[] = [
    '【会话真相快照 — 必须遵守，不得与下列事实矛盾】',
    `- planConfirmed: ${session.planConfirmed ? 'true' : 'false'}`,
    `- deployedExtensionId: ${session.deployedUskillId ?? '(未部署)'}`,
    `- refineMode: ${session.refineMode ? 'true' : 'false'}`
  ]

  if (spec) {
    lines.push(
      `- artifactKind: ${spec.artifactKind}`,
      `- ui.type: ${spec.ui.type}`,
      `- wireframeApproved: ${spec.ui.wireframeApproved ? 'true' : 'false'}`,
      `- designSpecGate.ready: ${gate.ready ? 'true' : 'false'}`,
      gate.missing.length ? `- designSpecGate.missing: ${gate.missing.join('；')}` : '- designSpecGate.missing: (无)'
    )
    if (spec.ui.type === 'surface' && spec.ui.widgetId) {
      lines.push(`- widgetId: ${spec.ui.widgetId}`)
      lines.push(`- primaryActions: ${spec.ui.primaryActions.join('、')}`)
    }
  } else {
    lines.push('- designSpec: (尚未生成)')
  }

  if (agentPhase) {
    lines.push(`- agentPipelinePhase: ${agentPhase}`)
  }

  lines.push(
    '',
    '硬性禁令（违反即视为错误回复）：',
    '- 若 wireframeApproved=true：禁止要求用户点击「界面 OK」',
    '- 若 planConfirmed=true 或 deployedExtensionId 非空：禁止说「即将部署」「将自动执行部署」',
    '- 若 agentPipelinePhase=done：禁止说部署进行中',
    '- 禁止声称已生成代码/已部署（除非快照显示 deployedExtensionId）',
    '- Surface 能力不得超出下方 Widget Catalog；未实装功能写入 openQuestions',
    '- **不要**在正文写「下一步操作指引」（由 Ackem UI 侧栏展示）',
    '',
    formatWidgetCatalogForPrompt()
  )

  return lines.join('\n')
}
