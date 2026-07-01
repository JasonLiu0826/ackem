import type { PlanSession } from '../../../../shared/planSession'
import type { PlanDesignSpec } from '../../../../shared/planDesignSpec'
import { deliveryCardFromDesignSpec, formatFailureCard } from '../../../../shared/planDeliveryCard'
import type { VerifyAgentOutput } from './verifyAgent'

/** 部署成功后写入一条 Delivery Card（取代多条进度消息） */
export function appendPlanDeliveryCard(
  session: PlanSession,
  extensionId: string,
  verify: VerifyAgentOutput,
  spec: PlanDesignSpec | null | undefined
): PlanSession {
  const name = spec?.displayName ?? extensionId
  if (verify.ok || verify.skipped) {
    const card = spec
      ? deliveryCardFromDesignSpec(spec, extensionId, verify.ok, {
          verifySkipped: verify.skipped
        })
      : `✅ **交付 · ${name}**\n\n扩展 \`${extensionId}\` 已部署。${verify.skipped ? '\n\n_验收 smoke 已跳过。_' : '\n\n_触发验证通过。_'}`
    session.messages.push({ role: 'assistant', content: card })
  } else {
    session.messages.push({
      role: 'assistant',
      content: formatFailureCard({
        kind: 'create',
        displayName: name,
        phase: '运行时验收',
        error: verify.errors.join('；') || '触发验证未通过',
        actions: [
          '扩展中心重新启用并测试 slash',
          '发送【重新部署】再试',
          '修改方案后重新确认'
        ],
        technicalDetails: verify.warnings
      })
    })
  }
  return session
}
