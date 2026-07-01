import { formatBubbleForWeixin } from '../markdownForChannel'
import type { OutboundBubble } from './deliveryPlanner'
import { getWeixinDeliveryProfile } from './deliveryProfiles'
import { markdownToWeixinPlain, splitWeixinDocumentChunks } from './markdownToWeixinPlain'
import { sanitizeAckemIdentityInMarkdown } from '../../paperCard/ackemProductIdentity'

const DOC_GAP_MS: [number, number] = [600, 1100]

function docGap(rng: () => number): number {
  const [a, b] = DOC_GAP_MS
  return Math.round(a + rng() * (b - a))
}

export type WeixinDocumentKind = 'knowledge' | 'plan' | 'search' | 'table'

/** 结构化纸面卡 → 微信文档模式 bubble 序列（伴侣短评 + 分块正文） */
export function planWeixinDocumentDelivery(args: {
  companionReply: string
  cardBodyMarkdown: string
  displayTitle?: string
  userQuestion?: string
  presetId: string
  rng?: () => number
}): OutboundBubble[] {
  const rng = args.rng ?? Math.random
  getWeixinDeliveryProfile(args.presetId)

  const bubbles: OutboundBubble[] = []
  const intro = formatBubbleForWeixin(args.companionReply.trim())
  if (intro) {
    bubbles.push({ kind: 'text', body: intro, delayBeforeMs: 0 })
  }

  let plain = markdownToWeixinPlain(
    args.userQuestion
      ? sanitizeAckemIdentityInMarkdown(args.cardBodyMarkdown, args.userQuestion)
      : args.cardBodyMarkdown
  )
  const title = args.displayTitle?.trim()
  if (title && !plain.includes(`【${title}】`)) {
    plain = `【${title}】\n\n${plain}`
  }

  const chunks = splitWeixinDocumentChunks(plain)
  let delayAcc = docGap(rng)

  for (const chunk of chunks) {
    const body = formatBubbleForWeixin(chunk, 3900)
    if (!body) continue
    bubbles.push({
      kind: 'text',
      body,
      delayBeforeMs: bubbles.length === 0 ? 0 : delayAcc
    })
    delayAcc = docGap(rng)
  }

  if (bubbles.length === 0 && plain) {
    bubbles.push({ kind: 'text', body: formatBubbleForWeixin(plain), delayBeforeMs: 0 })
  }

  return bubbles
}
