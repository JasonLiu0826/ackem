// [qq] — 入站消息 → companionTurn → 拟人化出站
//
// 关键取舍（对齐用户要求「QQ 聊天和 ACKM 内置聊天回复逻辑一样」）：
// - 统一走 runCompanionTurn，共享同一套人格预设、记忆检索、情绪状态机
// - 不传 channel: 'weixin' 的 lite / 结构化特化分支，QQ 走默认完整路径
// - 仅保留 skipDispatch: true（与微信一致）：手机端渠道不触发桌面操作派发

import { loadSettings } from '../../settings'
import { broadcastToRenderers } from '../../rendererBroadcast'
import { CompanionTurnError } from '../types'
import { runCompanionTurn } from '../companionTurn'
import {
  appendConversationTurn,
  loadRecentConversationMessages,
  resolveConversationSessionId
} from '../conversation'
import { planWeixinDelivery, type OutboundBubble } from '../weixin/deliveryPlanner'
import { planWeixinDocumentDelivery } from '../weixin/documentDelivery'
import { getWeixinDeliveryProfile } from '../weixin/deliveryProfiles'
import { formatBubbleForWeixin } from '../markdownForChannel'
import { stripTrailingSeparators } from '../../chat/humanizeReply'
import { clampInboundText, extractImageUrls, extractPlainText, extractRecordFiles } from './cqCode'
import { transcribeRecord } from './voiceInput'
import { isChannelOwner } from '../ownerGate'
import { capEmojiDensity, capNicknameDensity, detectPhysicalPresence, insertBreathCommas } from './sanitize'
import { resolveInboundImages } from './imageInput'
import { sendQqOutboundSequence, type QqBubble } from './outboundSequence'
import {
  emotionToMemeMood,
  isStickerRequest,
  memeToDataUri,
  pickMeme,
  requestedMemeMood
} from './memes'
import { markQqMessageSeen, saveQqPeer } from './store'
import { recordQqInboundActivity } from './proactive'
import type { OneBotClient } from './onebot'
import type { OneBotMessageEvent, QqAccount } from './types'
import { createLogger } from '../../logger'

const log = createLogger('qq-bridge')

/** 同一 QQ 用户串行处理，避免情绪状态与记忆 ingest 乱序 */
const peerChains = new Map<string, Promise<void>>()

function enqueuePeer(peerKey: string, fn: () => Promise<void>): void {
  const prev = peerChains.get(peerKey) ?? Promise.resolve()
  const next = prev
    .catch(() => {})
    .then(fn)
    .catch((e) => {
      log.error('peer turn failed', { peerKey, error: e instanceof Error ? e.message : String(e) })
    })
  peerChains.set(peerKey, next)
  void next.finally(() => {
    if (peerChains.get(peerKey) === next) peerChains.delete(peerKey)
  })
}

/** 入站消息入口：过滤 → 去重 → 排队处理 */
export function enqueueInboundQqMessage(args: {
  event: OneBotMessageEvent
  account: QqAccount
  client: OneBotClient
  dataRoot: string
}): void {
  const { event, account, client, dataRoot } = args

  const userId = event.user_id
  if (userId == null) return

  // 自己发的消息不回复，避免自问自答死循环
  const selfId = String(event.self_id ?? account.selfId ?? '')
  if (selfId && String(userId) === selfId) return

  // 第一版只处理私聊；群聊需要 @ 才响应，留给后续阶段
  if (event.message_type !== 'private') return

  const messageId = event.message_id
  if (messageId != null && markQqMessageSeen(dataRoot, selfId, messageId)) {
    log.debug('duplicate message ignored', { messageId })
    return
  }

  // 机主绑定：只响应主人（首个私聊自动绑定），陌生人消息直接丢弃
  if (!isChannelOwner('qq', String(userId))) return

  const sender = event.sender
  saveQqPeer(dataRoot, String(userId), sender?.card || sender?.nickname)
  // 主动搭话的「双方都闲着」判断：任何入站消息都算活跃
  recordQqInboundActivity(dataRoot)

  enqueuePeer(`${selfId}:${userId}`, () =>
    handleInbound({ event, account, client, dataRoot, userId: String(userId) })
  )
}

async function handleInbound(args: {
  event: OneBotMessageEvent
  account: QqAccount
  client: OneBotClient
  dataRoot: string
  userId: string
}): Promise<void> {
  const { event, client, dataRoot, userId } = args
  const text = clampInboundText(extractPlainText(event.message))
  const target = { kind: 'private' as const, userId }

  // 图片要真的交给模型看，而不是压成「[图片]」两个字
  const imageRefs = extractImageUrls(event.message)
  const userImages = imageRefs.length > 0 ? await resolveInboundImages(imageRefs) : []

  // 语音消息：先转文字，再走正常对话（转失败才回退到"看不了"）
  const recordRefs = extractRecordFiles(event.message)
  let voiceText = ''
  if (recordRefs.length > 0 && !text) {
    for (const ref of recordRefs) {
      const t = await transcribeRecord(client, ref)
      if (t) {
        voiceText = clampInboundText(`[语音转文字] ${t}`)
        break
      }
    }
  }

  // 有图但一张都没解析出来：必须告诉她"看不到"，否则她会对着 [图] 编内容
  let userText = text || voiceText
  if (imageRefs.length > 0 && userImages.length === 0) {
    userText = userText.replace(
      /\[图(?::[^\]]*)?\]/g,
      '[他发来一张图片，但没加载出来，你看不到内容]'
    )
    log.warn('inbound images all failed', { refs: imageRefs.length })
  }

  if (!userText && userImages.length === 0) {
    // 只收到语音/文件等确实无法解析的内容时，给一句自然回应保持对话不断
    await sendQqOutboundSequence({
      client,
      target,
      bubbles: [{ kind: 'text', body: '这个我看不了耶 打字跟我说嘛', delayBeforeMs: 0 }],
      voice: { dataRoot }
    })
    return
  }

  const settings = loadSettings()
  // 三端统一会话：QQ 写进桌面正在用的那一份历史，桌面/微信都看得到。
  // QQ 号只用于「把回复发回这个人」，不再作为历史分区。
  const sessionId = resolveConversationSessionId(settings.activeSessionId)
  const recentMessages = loadRecentConversationMessages(dataRoot, sessionId)

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
      channel: 'qq',
      sessionId,
      userText,
      userImages,
      recentMessages,
      options: { skipDispatch: true }
    })
    rawReply = result.assistantText
    documentDelivery = result.documentDelivery
    if (result.deliveryHints) hints = { ...hints, ...result.deliveryHints }
  } catch (e) {
    if (e instanceof CompanionTurnError) {
      if (e.code === 'EMBEDDING_WARMING') {
        rawReply = '记忆引擎还在预热，等我半分钟～'
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

  // 长语音：模型被要求「唱一段/念一段长的」时会在开头写 [长语音]，
  // 这轮不拆气泡、不走概率，整段直接合成一条语音（≤maxSeconds）。
  // 26 字的 run-on 拆分只对普通聊天有用，会把长段切成碎句，所以这里必须绕过。
  const longVoice = /^\s*\[长语音\]\s*/.exec(rawReply)
  if (longVoice) {
    const longText = rawReply.slice(longVoice[0].length).replace(/\[SPLIT\]/gi, ' ').trim()
    log.info('long voice requested', { chars: longText.length })
    await sendQqOutboundSequence({
      client,
      target,
      bubbles: [{ kind: 'text', body: longText, delayBeforeMs: 0 }],
      voice: { dataRoot },
      forceLongVoice: true
    })
    return
  }

  // 结构化卡片（知识/计划/表格）：正文必须一起发，否则 QQ 只能看到一句敷衍的开场
  let bubbles: QqBubble[] = documentDelivery
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
    bubbles = [{ kind: 'text', body: formatBubbleForWeixin(rawReply), delayBeforeMs: 0 }]
  }

  // 表情包：平时按人格的 stickerAffinity 概率触发，参考大肥鱼 meme_manager 的
  // 「约三条回复一张图」——发图太密会立刻显得不像人。
  // 但他要是直接开口要，就不能再靠概率撞：库里有图却不发，比不发更假。
  const profile = getWeixinDeliveryProfile(hints.presetId)
  const askedForSticker = isStickerRequest(text)
  if (askedForSticker || Math.random() < profile.stickerAffinity) {
    const mood = requestedMemeMood(text) ?? emotionToMemeMood(hints.aro, hints.aff, text, rawReply)
    const meme = pickMeme({ dataRoot, mood })
    const uri = meme ? memeToDataUri(meme) : null
    log.info('sticker attach', {
      asked: askedForSticker,
      mood,
      meme: meme?.id ?? null,
      uri: Boolean(uri)
    })
    if (uri) {
      bubbles.push({
        kind: 'image',
        body: uri,
        // 主动翻相册要 1.4~3.2 秒；被点名要的时候翻得更快，否则像没听清
        delayBeforeMs: askedForSticker
          ? 500 + Math.round(Math.random() * 700)
          : 1400 + Math.round(Math.random() * 1800)
      })
    }
  }

  // 称呼额度：真人不会一直叫。
  // ① 会话刚开始（前 3 轮）允许叫一次，把关系"点"起来；
  // ② 之后连续聊天归零，正常说话不再带称呼；
  // ③ 情绪明显起伏时再放一次额度，用来表达"我这话是说给你听的"。
  // 只看对话进度：前 3 轮（6 条历史）允许一次，之后归零。
  // 之前用「情绪起伏」当条件，但 |aff|>0.65 几乎恒真，等于每轮都放行。
  const historyLen = recentMessages.length
  const isFreshConversation = historyLen < 6
  const nicknameBudget = isFreshConversation ? 1 : 0

  const textBodies = bubbles.filter((b) => b.kind === 'text').map((b) => b.body as string)
  if (textBodies.length > 0) {
    // ① 断句：长句在前面补一个停顿，否则读起来是糊的
    // ② emoji：整轮最多留 1 个（她靠语气词表达情绪，不靠表情）
    // ③ 称呼：按对话进度给额度，聊开了就一个都不留
    // ⓪ 媒介自觉：命中"看着你""跑不掉"这类物理在场表述就记下来
    //   （先只观测不改写，避免自动改写把句子弄得更怪）
    for (const body of textBodies) {
      const hits = detectPhysicalPresence(body)
      if (hits.length > 0) {
        log.warn('physical presence leak', { hits: hits.map((h) => h.why), text: body.slice(0, 40) })
      }
    }

    let next = textBodies.map(insertBreathCommas)
    // 原生 emoji 从"整轮最多 1 个"收紧到"约八轮才允许 1 个"：
    // 之前每轮都留一颗，聊十轮就是十颗，看起来仍然像机器人。
    next = capEmojiDensity(next, Math.random() < 0.12 ? 1 : 0)
    const petTokens = settings.freyaPetName?.trim() ? [settings.freyaPetName.trim()] : []
    next = capNicknameDensity(next, nicknameBudget, petTokens)

    const changed =
      next.length !== textBodies.length || next.some((t, i) => t !== textBodies[i])
    if (changed) {
      let cursor = 0
      bubbles = bubbles.filter((b) => {
        if (b.kind !== 'text') return true
        const body = next[cursor++]
        if (!body) return false
        ;(b as { body: string }).body = body
        return true
      })
      log.info('outbound trimmed', {
        nicknameBudget,
        fresh: isFreshConversation,
        before: textBodies.length,
        after: next.length
      })
    }
  }

  log.info('outbound plan', { presetId: hints.presetId, bubbles: bubbles.length })

  await sendQqOutboundSequence({ client, target, bubbles, voice: { dataRoot } })

  // 把这一轮写进三端共用的那一份历史。
  // 存"用户实际看到的那句话"，而不是带 [SPLIT] 的模型原始输出——
  // 否则这段历史回填进上下文时会把分段标记喂回模型。
  try {
    const visibleReply =
      stripTrailingSeparators(rawReply.replace(/\[SPLIT\]/gi, ' ').replace(/\s{2,}/g, ' ').trim()) ||
      rawReply
    const { appended } = await appendConversationTurn({
      dataRoot,
      sessionId,
      channel: 'qq',
      peerId: userId,
      userText,
      assistantText: visibleReply
    })
    // 桌面正开着：把新消息实时推过去，不用重开窗口才能看到 QQ 里聊了什么
    if (appended.length > 0) {
      broadcastToRenderers('chat:history-appended', { sessionId, channel: 'qq', rows: appended })
    }
  } catch (e) {
    log.warn('chat history persist failed', { error: String(e) })
  }
}
