import type { ChannelPlan } from '../../shared/channelPlan'

/**
 * cwd 回显净化 (阶段 2 E2E 发现): grounding/确认卡会把 cwd 显示给用户,
 * 控制字符、引号与超长串在显示层剥离——正常路径完整可见, 攻击串失去形状。
 * 判决账本侧另有 write-boundary 脱敏, 此处只管用户可见的显示面。
 */
export function sanitizeCwdForDisplay(cwd: string): string {
  const cleaned = cwd.replace(/[\x00-\x1f\x7f"'`<>]/g, '')
  return cleaned.length > 200 ? `${cleaned.slice(0, 200)}…` : cleaned
}

export function writeGrounding(
  plan: Pick<ChannelPlan, 'channel' | 'pendingConfirm' | 'cwd' | 'extensionId'> & {
    intent?: ChannelPlan['intent']
    tag?: ChannelPlan['tag']
    params?: ChannelPlan['params']
  }
): string {
  const cwdDisplay = plan.cwd ? sanitizeCwdForDisplay(plan.cwd) : ''
  const status = plan.pendingConfirm
    ? `尚未开始。等待确认${plan.pendingConfirm}${cwdDisplay ? `：${cwdDisplay}` : ''}`
    : plan.channel === 'work'
      ? '任务已开始，尚未完成。'
      : plan.channel === 'plugin'
        ? plan.extensionId
          ? `将调口袋：${plan.extensionId}`
          : '将调口袋里的手'
        : '本轮不伸手'

  return [
    `【本轮通道】${plan.channel}`,
    `【状态】${status}`,
    '【禁止】不可说已读取文件、已改盘、已入库、已开始计时，除非本轮事实里已经发生。对用户把 work 叫做任务，禁止说工人。'
  ].join('\n')
}
