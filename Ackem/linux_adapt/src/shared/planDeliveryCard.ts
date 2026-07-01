import type { PlanDesignSpec } from './planDesignSpec'

export type DeliveryCardKind = 'create' | 'refine'

export type DeliveryCardInput = {
  kind: DeliveryCardKind
  displayName: string
  extensionId: string
  version?: string
  previousVersion?: string
  purpose: string
  keywords: string[]
  slash: string[]
  uiType: 'surface' | 'injection_only' | 'none'
  openHint?: string
  permissionsGranted?: string[]
  permissionsPending?: string[]
  smokeExample: string
  verifyOk: boolean
  verifySkipped?: boolean
  diffSummary?: string[]
}

export type FailureCardInput = {
  kind: DeliveryCardKind
  displayName: string
  phase: string
  error: string
  actions: string[]
  technicalDetails?: string[]
}

export function formatDeliveryCard(input: DeliveryCardInput): string {
  const icon = input.verifyOk ? '✅' : '⚠️'
  const title =
    input.kind === 'refine' && input.previousVersion
      ? `${icon} **已优化 · ${input.displayName}**（${input.previousVersion} → ${input.version ?? '新版本'}）`
      : `${icon} **交付 · ${input.displayName}**`

  const triggerLines = [
    input.keywords.length ? `- 说：${input.keywords.slice(0, 3).join('、')}` : null,
    input.slash.length ? `- 或发送：${input.slash.slice(0, 4).map((s) => `\`${s}\``).join(' · ')}` : null
  ].filter(Boolean)

  const uiBlock =
    input.uiType === 'surface'
      ? `**界面**\n${input.openHint ?? '扩展中心 → 打开界面'}`
      : input.uiType === 'injection_only'
        ? '**界面**\n无独立窗口；主聊天触发后通过对话注入生效。'
        : null

  const permBlock =
    input.permissionsPending?.length
      ? `**权限**\n待批准：${input.permissionsPending.join('、')} — 请到扩展中心点击「授予并启用」。`
      : input.permissionsGranted?.length
        ? `**权限**\n已授予：${input.permissionsGranted.join('、')}`
        : null

  const verifyNote = input.verifySkipped
    ? '\n\n_验收：文本 smoke 已跳过（如纯快捷键触发）；请实机验证。_'
    : input.verifyOk
      ? '\n\n_验收：触发验证通过。_'
      : '\n\n_验收：未通过，扩展已禁用。_'

  const diffBlock = input.diffSummary?.length
    ? `\n\n**变更**\n${input.diffSummary.map((d) => `- ${d}`).join('\n')}`
    : ''

  return [
    title,
    '',
    '**是什么**',
    input.purpose,
    '',
    '**怎么触发**',
    ...triggerLines,
    uiBlock,
    permBlock,
    '',
    '**试一下**',
    input.smokeExample,
    diffBlock,
    verifyNote
  ]
    .filter(Boolean)
    .join('\n')
}

export function formatFailureCard(input: FailureCardInput): string {
  return [
    `⚠️ **未完成 · ${input.displayName}**`,
    '',
    '**卡在哪**',
    `${input.phase} · ${input.error}`,
    '',
    '**你可以**',
    ...input.actions.map((a) => `- ${a}`),
    input.technicalDetails?.length
      ? `\n<details><summary>技术详情</summary>\n\n${input.technicalDetails.map((d) => `- ${d}`).join('\n')}\n</details>`
      : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export function deliveryCardFromDesignSpec(
  spec: PlanDesignSpec,
  extensionId: string,
  verifyOk: boolean,
  opts?: Partial<DeliveryCardInput>
): string {
  return formatDeliveryCard({
    kind: 'create',
    displayName: spec.displayName,
    extensionId,
    purpose: spec.purpose,
    keywords: spec.trigger.keywords,
    slash: spec.trigger.slash,
    uiType: spec.ui.type,
    openHint: spec.ui.openHint,
    smokeExample: spec.acceptance.smokeMessages[0] ?? spec.trigger.slash[0] ?? '',
    verifyOk,
    ...opts
  })
}
