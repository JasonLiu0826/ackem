/**
 * Plan Agent 姣忚疆娉ㄥ叆鐨勪細璇濈湡鐩稿揩鐓?鈥?闃叉涓?UI/Spec 鐘舵€佺煕鐩剧殑骞昏
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
    '銆愪細璇濈湡鐩稿揩鐓?鈥?蹇呴』閬靛畧锛屼笉寰椾笌涓嬪垪浜嬪疄鐭涚浘銆?,
    `- planConfirmed: ${session.planConfirmed ? 'true' : 'false'}`,
    `- deployedExtensionId: ${session.deployedUskillId ?? '(鏈儴缃?'}`,
    `- refineMode: ${session.refineMode ? 'true' : 'false'}`
  ]

  if (spec) {
    lines.push(
      `- artifactKind: ${spec.artifactKind}`,
      `- ui.type: ${spec.ui.type}`,
      `- wireframeApproved: ${spec.ui.wireframeApproved ? 'true' : 'false'}`,
      `- designSpecGate.ready: ${gate.ready ? 'true' : 'false'}`,
      gate.missing.length ? `- designSpecGate.missing: ${gate.missing.join('锛?)}` : '- designSpecGate.missing: (鏃?'
    )
    if (spec.ui.type === 'surface' && spec.ui.widgetId) {
      lines.push(`- widgetId: ${spec.ui.widgetId}`)
      lines.push(`- primaryActions: ${spec.ui.primaryActions.join('銆?)}`)
    }
  } else {
    lines.push('- designSpec: (灏氭湭鐢熸垚)')
  }

  if (agentPhase) {
    lines.push(`- agentPipelinePhase: ${agentPhase}`)
  }

  lines.push(
    '',
    '纭€х浠わ紙杩濆弽鍗宠涓洪敊璇洖澶嶏級锛?,
    '- 鑻?wireframeApproved=true锛氱姝㈣姹傜敤鎴风偣鍑汇€岀晫闈?OK銆?,
    '- 鑻?planConfirmed=true 鎴?deployedExtensionId 闈炵┖锛氱姝㈣銆屽嵆灏嗛儴缃层€嶃€屽皢鑷姩鎵ц閮ㄧ讲銆?,
    '- 鑻?agentPipelinePhase=done锛氱姝㈣閮ㄧ讲杩涜涓?,
    '- 绂佹澹扮О宸茬敓鎴愪唬鐮?宸查儴缃诧紙闄ら潪蹇収鏄剧ず deployedExtensionId锛?,
    '- Surface 鑳藉姏涓嶅緱瓒呭嚭涓嬫柟 Widget Catalog锛涙湭瀹炶鍔熻兘鍐欏叆 openQuestions',
    '- **涓嶈**鍦ㄦ鏂囧啓銆屼笅涓€姝ユ搷浣滄寚寮曘€嶏紙鐢?Ackem UI 渚ф爮灞曠ず锛?,
    '',
    formatWidgetCatalogForPrompt()
  )

  return lines.join('\n')
}
