import { loadSettings } from '../../settings'
import { formatBubbleForWeixin } from '../markdownForChannel'
import { runCompanionTurn } from '../companionTurn'
import { CompanionTurnError } from '../types'
import { extractTextFromMessage } from './api'
import { planWeixinDelivery } from './deliveryPlanner'
import { planWeixinDocumentDelivery } from './documentDelivery'
import { sendWeixinOutboundSequence } from './outboundSequence'
import { enqueuePeerTurn } from './queue'
import {
  loadContextToken,
  markMessageSeen,
  resolveWeixinBoundAgentId,
  saveContextToken
} from './store'
import { recordWeixinAckemActivity } from './activity'
import type { WeixinAccount, WeixinMessage } from './types'
import { createLogger } from '../../logger'
import { sessionIdForAgent } from '../../social/agents/agentPaths'
import { loadMergedRecentMessages } from '../../chat/unifiedChatHistory'

const log = createLogger('weixin-bridge')

export function enqueueInboundWeixinMessage(
  msg: WeixinMessage,
  account: WeixinAccount,
  dataRoot: string
): void {
  if (msg.message_type !== 1) return
  const peerId = msg.from_user_id
  if (!peerId) return
  if (msg.message_id != null && markMessageSeen(dataRoot, msg.message_id)) return

  if (msg.context_token) saveContextToken(dataRoot, peerId, msg.context_token)
  recordWeixinAckemActivity(dataRoot)

  void enqueuePeerTurn(peerId, () => handleInboundMessage(msg, account, dataRoot))
}

async function handleInboundMessage(
  msg: WeixinMessage,
  account: WeixinAccount,
  dataRoot: string
): Promise<void> {
  const peerId = msg.from_user_id!
  const contextToken =
    msg.context_token ?? loadContextToken(dataRoot, peerId) ?? undefined
  const text = extractTextFromMessage(msg)

  if (!text) {
      await sendWeixinOutboundSequence({
        account,
        peerId,
        contextToken,
        bubbles: [{ kind: 'text', body: '我暂时只能读懂文字消息哦～直接打字给我就好。', delayBeforeMs: 0 }],
        dataRoot
      })
    return
  }

  const boundAgentId = resolveWeixinBoundAgentId(dataRoot, account)
  const sessionId = sessionIdForAgent(boundAgentId)
  const recentMessages = loadMergedRecentMessages(dataRoot, 24, sessionId)
  const settings = loadSettings()

  let rawReply: string
  let turnId: string | undefined
  let documentDelivery: {
    cardBody: string
    displayTitle: string
    kind: 'knowledge' | 'plan' | 'search' | 'table'
  } | undefined
  let hints = {
    presetId: settings.personalityPresetId,
    aro: 0,
    aff: 0,
    intensity: 0
  }

  try {
    const result = await runCompanionTurn({
      channel: 'weixin',
      sessionId,
      targetAgentId: boundAgentId,
      userText: text,
      recentMessages,
      options: { skipDispatch: true }
    })
    rawReply = result.assistantText
    turnId = result.turnId
    documentDelivery = result.documentDelivery
    if (result.deliveryHints) hints = { ...hints, ...result.deliveryHints }
  } catch (e) {
    if (e instanceof CompanionTurnError) {
      if (e.code === 'EMBEDDING_WARMING') {
        rawReply = '记忆引擎还在预热，请稍等半分钟再试～'
      } else if (e.code === 'NO_API') {
        rawReply = '我这边还没配置好对话模型，请在 Ackem 设置里填写 API 后再试。'
      } else {
        rawReply = '没听清，你再说一次？'
      }
    } else {
      log.error('turn failed', e)
      rawReply = '刚才有点卡，你再发一次好吗？'
    }
  }

  if (!rawReply.trim()) rawReply = '…'

  const bubbles = documentDelivery
    ? planWeixinDocumentDelivery({
        companionReply: rawReply,
        cardBodyMarkdown: documentDelivery.cardBody,
        displayTitle: documentDelivery.displayTitle,
        userQuestion: text,
        presetId: hints.presetId
      })
    : planWeixinDelivery({
        rawAssistant: rawReply,
        presetId: hints.presetId,
        userText: text,
        emotion: { aro: hints.aro, aff: hints.aff, intensity: hints.intensity }
      })

  if (bubbles.length === 0) {
    bubbles.push({ kind: 'text', body: formatBubbleForWeixin(rawReply), delayBeforeMs: 0 })
  }

  log.info('outbound plan', {
    presetId: hints.presetId,
    boundAgentId,
    bubbles: bubbles.length,
    document: Boolean(documentDelivery),
    turnId,
  })

  await sendWeixinOutboundSequence({
    account,
    peerId,
    contextToken,
    bubbles,
    dataRoot
  })
}
