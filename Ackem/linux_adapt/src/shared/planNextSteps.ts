/**
 * 程序化「下一步」— 不由 LLM 描述，由 UI 侧栏展示
 */
import type { PlanSession } from './planSession'
import { evaluateDesignSpecGate, finalizeDesignSpec } from './planDesignSpec'
import type { AgentRunPhase } from './openforuAgentTypes'

export type PlanNextStepAction =
  | 'continue_chat'
  | 'approve_wireframe'
  | 'confirm_plan'
  | 'wait_deploy'
  | 'test_extension'
  | 'redeploy'
  | 'none'

export type PlanNextSteps = {
  action: PlanNextStepAction
  title: string
  lines: string[]
  /** 侧栏是否应显示「界面 OK」 */
  showWireframeButton: boolean
  /** 侧栏是否应显示「确认方案」 */
  showConfirmButton: boolean
}

export function buildPlanNextSteps(
  session: PlanSession,
  opts?: { agentPhase?: AgentRunPhase | null; agentBusy?: boolean }
): PlanNextSteps {
  const spec = session.designSpec ? finalizeDesignSpec(session.designSpec) : null
  const gate = evaluateDesignSpecGate(spec)
  const phase = opts?.agentPhase ?? null
  const busy = opts?.agentBusy === true

  if (busy || (phase && !['done', 'failed', 'cancelled', null].includes(phase))) {
    return {
      action: 'wait_deploy',
      title: '交付管线运行中',
      lines: ['正在对齐 Design Spec → 校验 → 部署 → 验收', '完成后侧栏会更新交付结果'],
      showWireframeButton: false,
      showConfirmButton: false
    }
  }

  if (session.refineMode && session.linkedExtensionId) {
    return {
      action: gate.ready ? 'confirm_plan' : 'continue_chat',
      title: '继续优化',
      lines: [
        `目标 \`${session.linkedExtensionId}\``,
        gate.ready
          ? '说明改动后点击「确认方案」重新部署'
          : '在对话中描述要改什么（界面、按钮、触发方式等）',
        ...(gate.missing.length ? [`门禁：${gate.missing[0]}`] : [])
      ],
      showWireframeButton: Boolean(
        spec?.ui.type === 'surface' && spec.ui.designBrief && !spec.ui.wireframeApproved
      ),
      showConfirmButton: gate.ready
    }
  }

  // 界面确认优先于「已部署」
  if (spec?.ui.type === 'surface' && !spec.ui.wireframeApproved) {
    const slash = spec.trigger.slash?.[0] ?? spec.trigger.keywords?.[0]
    return {
      action: 'approve_wireframe',
      title: session.deployedUskillId ? '界面方案有更新 · 待确认' : '待确认界面方案',
      lines: [
        '查看下方线框图与主操作按钮',
        '确认后点击「界面 OK」',
        ...(session.deployedUskillId
          ? [
              `当前已部署 \`${session.deployedUskillId}\`，确认后可继续实机测试`,
              slash
                ? `主聊天发送 ${slash.startsWith('/') ? slash : `\`/${slash}\``}`
                : '主聊天用 slash 触发'
            ]
          : []),
        ...(gate.missing.length ? [`门禁：${gate.missing[0]}`] : [])
      ],
      showWireframeButton: true,
      showConfirmButton: false
    }
  }

  if (session.deployedUskillId) {
    const slash = spec?.trigger.slash?.[0] ?? spec?.trigger.keywords?.[0]
    return {
      action: 'test_extension',
      title: '已部署 · 实机测试',
      lines: [
        `扩展 \`${session.deployedUskillId}\``,
        slash ? `主聊天发送 ${slash.startsWith('/') ? slash : `\`/${slash}\``}` : '主聊天用关键词或 slash 触发',
        spec?.ui.type === 'surface' ? '或：扩展中心 → 打开窗口' : '观察对话注入或通知是否符合方案'
      ],
      showWireframeButton: false,
      showConfirmButton: false
    }
  }

  if (session.planConfirmed && !session.deployedUskillId) {
    return {
      action: 'redeploy',
      title: '方案已确认',
      lines: ['发送【重新部署】或等待自动收敛', '部署完成后在此查看测试指引'],
      showWireframeButton: false,
      showConfirmButton: false
    }
  }

  if (spec && gate.ready) {
    return {
      action: 'confirm_plan',
      title: '可以确认方案',
      lines: ['设计规格已就绪', '点击「确认方案」开始生成与部署'],
      showWireframeButton: false,
      showConfirmButton: true
    }
  }

  return {
    action: 'continue_chat',
    title: '继续完善方案',
    lines: gate.missing.length ? gate.missing.slice(0, 3) : ['与 Agent 对话补齐 dispatch 四维与产物类型'],
    showWireframeButton: false,
    showConfirmButton: false
  }
}
