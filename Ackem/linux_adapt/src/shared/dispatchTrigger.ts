export type DispatchTriggerStatus = {
  extensionId: string
  extensionName: string
  kind: 'skill' | 'plugin' | 'gamemode'
}

export function formatDispatchTriggerLabel(t: DispatchTriggerStatus): string {
  if (t.kind === 'skill') return `已触发 ${t.extensionName} Skill`
  if (t.kind === 'plugin') return `已触发 ${t.extensionName} 插件`
  return `已触发 ${t.extensionName}`
}

export function resolveDispatchTriggerStatus(
  dispatchResult?: {
    decision?: string
    extensionId?: string
    reasoning?: string
  },
  catalogEntry?: {
    id: string
    name: string
    category: 'skill' | 'plugin' | 'gamemode'
  }
): DispatchTriggerStatus | undefined {
  if (!dispatchResult?.extensionId) return undefined
  const triggered =
    dispatchResult.decision === 'auto_invoke' ||
    dispatchResult.reasoning === 'user_confirmed_ask'
  if (!triggered) return undefined
  return {
    extensionId: dispatchResult.extensionId,
    extensionName: catalogEntry?.name ?? dispatchResult.extensionId,
    kind: catalogEntry?.category ?? 'plugin'
  }
}
