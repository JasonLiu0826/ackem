import { loadChatHistoryFromDb } from '../../db/repos/chatHistory'
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
  normalizePeerSessionId,
  saveContextToken
} from './store'
import { recordWeixinAckemActivity } from './activity'
import type { WeixinAccount, WeixinMessage } from './types'
import { createLogger } from '../../logger'

const log = createLogger('weixin-bridge')

function loadRecentMessages(
  dataRoot: string,
  sessionId: string,
  limit = 24
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const raw = loadChatHistoryFromDb(dataRoot, sessionId)
  const rows = Array.isArray(raw) ? raw : []
  const msgs: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as { kind?: string; role?: string; content?: string }
    if (r.kind !== 'message') continue
    if (r.role !== 'user' && r.role !== 'assistant') continue
    if (!r.content?.trim()) continue
    msgs.push({ role: r.role, content: r.content })
  }
  return msgs.slice(-limit)
}

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
        bubbles: [{ kind: 'text', body: '鎴戞殏鏃跺彧鑳借鎳傛枃瀛楁秷鎭摝锝炵洿鎺ユ墦瀛楃粰鎴戝氨濂姐€?, delayBeforeMs: 0 }],
        dataRoot
      })
    return
  }

  const sessionId = normalizePeerSessionId(peerId)
  const recentMessages = loadRecentMessages(dataRoot, sessionId)
  const settings = loadSettings()

  let rawReply: string
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
      userText: text,
      recentMessages,
      options: { skipDispatch: true }
    })
    rawReply = result.assistantText
    documentDelivery = result.documentDelivery
    if (result.deliveryHints) hints = { ...hints, ...result.deliveryHints }
  } catch (e) {
    if (e instanceof CompanionTurnError) {
      if (e.code === 'EMBEDDING_WARMING') {
        rawReply = '璁板繂寮曟搸杩樺湪棰勭儹锛岃绋嶇瓑鍗婂垎閽熷啀璇曪綖'
      } else if (e.code === 'NO_API') {
        rawReply = '鎴戣繖杈硅繕娌￠厤缃ソ瀵硅瘽妯″瀷锛岃鍦?Ackem 璁剧疆閲屽～鍐?API 鍚庡啀璇曘€?
      } else {
        rawReply = '娌″惉娓咃紝浣犲啀璇翠竴娆★紵'
      }
    } else {
      log.error('turn failed', e)
      rawReply = '鍒氭墠鏈夌偣鍗★紝浣犲啀鍙戜竴娆″ソ鍚楋紵'
    }
  }

  if (!rawReply.trim()) rawReply = '鈥?

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
    bubbles: bubbles.length,
    document: Boolean(documentDelivery)
  })

  await sendWeixinOutboundSequence({
    account,
    peerId,
    contextToken,
    bubbles,
    dataRoot
  })
}
