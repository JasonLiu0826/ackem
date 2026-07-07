import {
  fetchTypingTicket,
  sendWeixinMessage,
  sendWeixinTyping
} from './api'
import type { OutboundBubble } from './deliveryPlanner'
import { formatBubbleForWeixin } from '../markdownForChannel'
import { sendStickerPlaceholder } from './stickerRegistry'
import { recordWeixinAckemActivity } from './activity'
import type { WeixinAccount } from './types'
import { createLogger } from '../../logger'

const log = createLogger('weixin-outbound')

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function typing(
  account: WeixinAccount,
  peerId: string,
  contextToken: string | undefined,
  status: 1 | 2
): Promise<void> {
  try {
    const ticket = await fetchTypingTicket({
      token: account.token,
      baseUrl: account.baseUrl,
      ilinkUserId: peerId,
      contextToken
    })
    if (!ticket) return
    await sendWeixinTyping({
      token: account.token,
      baseUrl: account.baseUrl,
      ilinkUserId: peerId,
      typingTicket: ticket,
      status
    })
  } catch {
    /* non-critical */
  }
}

export async function sendWeixinOutboundSequence(args: {
  account: WeixinAccount
  peerId: string
  contextToken?: string
  bubbles: OutboundBubble[]
  dataRoot?: string
}): Promise<void> {
  const { account, peerId, contextToken, bubbles, dataRoot } = args
  if (bubbles.length === 0) return

  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i]
    if (b.delayBeforeMs > 0) await sleep(b.delayBeforeMs)

    await typing(account, peerId, contextToken, 1)

    if (b.kind === 'text' || b.kind === 'emoji') {
      const text = formatBubbleForWeixin(b.body, 4000)
      if (!text) continue
      const res = await sendWeixinMessage({
        token: account.token,
        baseUrl: account.baseUrl,
        toUserId: peerId,
        text,
        contextToken
      })
      if (res.ret !== 0) log.warn('send failed', { ret: res.ret, kind: b.kind })
    } else if (b.kind === 'sticker') {
      const sent = await sendStickerPlaceholder(b.body)
      if (!sent) log.debug('sticker skipped (reserved)', { id: b.body })
    }
  }

  await typing(account, peerId, contextToken, 2)
  if (dataRoot) recordWeixinAckemActivity(dataRoot)
}
