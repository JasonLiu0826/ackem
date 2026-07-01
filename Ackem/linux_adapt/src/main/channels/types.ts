export type CompanionChannelId = 'ui' | 'weixin' | string

export type CompanionTurnInput = {
  channel: CompanionChannelId
  sessionId: string
  userText: string
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  turnIndex?: number
  options?: {
    skipDispatch?: boolean
  }
}

export type CompanionTurnResult = {
  assistantText: string
  turnId: string
  skipLlm?: boolean
  deliveryHints?: {
    presetId: string
    aro: number
    aff: number
    intensity?: number
  }
  /** 微信结构化交付：纸面卡 Markdown 正文（由 bridge 转纯文本分条发送） */
  documentDelivery?: {
    cardBody: string
    displayTitle: string
    kind: 'knowledge' | 'plan' | 'search' | 'table'
  }
}

export type CompanionTurnErrorCode = 'EMBEDDING_WARMING' | 'NO_API' | 'EMPTY_INPUT'

export class CompanionTurnError extends Error {
  constructor(
    message: string,
    readonly code: CompanionTurnErrorCode
  ) {
    super(message)
    this.name = 'CompanionTurnError'
  }
}
