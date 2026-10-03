export type Channel = 'chat' | 'plugin' | 'work'
export type WorkKind = 'job' | 'factory'
export type ChatDelivery = 'prose' | 'paper_card'
export type IntentKind = 'chat' | 'ask' | 'use' | 'create' | 'update' | 'work'
export type PendingConfirm =
  | 'create'
  | 'update'
  | 'work_job'
  | 'use_missing'
  | 'plugin_ask'
  | 'plugin_use'

export type ChannelPlan = {
  channel: Channel
  intent: IntentKind
  tag: string | null
  chatDelivery?: ChatDelivery
  formatHint?: string
  extensionId?: string
  candidateExtensionIds?: string[]
  candidates?: Array<{ id: string; name: string }>
  workKind?: WorkKind
  cwd?: string
  ackemCodeSessionId?: string
  pendingConfirm?: PendingConfirm
  planId?: string
  version?: number
  summary?: string
  params: Record<string, unknown>
  grounding: string
}

export type PendingChannelAction = {
  planId: string
  createdAt: number
  sourceText: string
  plan: ChannelPlan
  catalogRevision: string
  expiresAt: number
}

export type TurnConfirm = {
  planId: string
  accepted: boolean
  cwd?: string
  extensionId?: string
}

export type ChannelPendingView = {
  planId: string
  kind: PendingConfirm
  askMessage: string
  cwd?: string
  candidates?: Array<{ id: string; name: string }>
}
