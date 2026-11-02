// [qq] — 出站发送序列（拟人化节奏的执行层）
//
// 「不像机器人」的落点：
// - 一条 AI 回复先被 deliveryPlanner 拆成多条短气泡，这里按随机间隔逐条发出
// - OneBot 没有「正在输入」状态接口，所以间隔本身就是模拟思考/打字的唯一手段
// - 人格预设决定的 bubbleRange / gapMs 来自复用的 deliveryProfiles，QQ 与微信体验一致
// - 表情包按概率穿插，和文字一样带随机延迟，不整包连发

import { formatBubbleForWeixin } from '../markdownForChannel'
import type { OutboundBubble } from '../weixin/deliveryPlanner'
import { imageSegment, recordSegment, splitOverlongText, textSegment } from './cqCode'
import {
  isTtsHealthy,
  loadQqVoiceConfig,
  recordFileValue,
  shouldSpeak,
  splitForVoice,
  synthesizeSilk
} from './qqVoice'
import { hasSendableContent, sanitizeOutboundText } from './sanitize'
import type { OneBotClient } from './onebot'
import { QQ_MAX_TEXT_PER_MESSAGE } from './types'
import { createLogger } from '../../logger'

const log = createLogger('qq-outbound')

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export type QqTarget =
  | { kind: 'private'; userId: string }
  | { kind: 'group'; groupId: string }

/** 在通用气泡基础上增加图片气泡（表情包走这里） */
export type QqBubble = OutboundBubble | { kind: 'image'; body: string; delayBeforeMs: number }

export type QqSendOutcome = {
  attempted: number
  sent: number
  failed: number
  images: number
  /** 其中以语音消息发出的条数 */
  voices: number
}

/**
 * 按 bubbles 顺序逐条发送。
 * 返回发送统计，便于上层记录与状态广播；单条失败不中断整轮。
 */
export async function sendQqOutboundSequence(args: {
  client: OneBotClient
  target: QqTarget
  bubbles: QqBubble[]
  /** 传了才会有语音：dataRoot 用于读 channels/qq-voice.json 与落盘 silk */
  voice?: { dataRoot: string }
  /** [长语音] 触发：跳过概率与字数上限，整段作为一条语音发（仍受 maxSeconds 保护） */
  forceLongVoice?: boolean
}): Promise<QqSendOutcome> {
  const { client, target, bubbles } = args
  const outcome: QqSendOutcome = { attempted: 0, sent: 0, failed: 0, images: 0, voices: 0 }
  if (bubbles.length === 0) return outcome

  // 语音配置只读一次：整轮回复共用同一份概率/开关
  const voiceCfg = args.voice ? loadQqVoiceConfig(args.voice.dataRoot) : null

  for (const bubble of bubbles) {
    if (bubble.delayBeforeMs > 0) await sleep(bubble.delayBeforeMs)

    // 图片气泡：body 是 base64:// 或 http(s) URL
    if (bubble.kind === 'image') {
      if (!bubble.body) continue
      outcome.attempted += 1
      const payload = [imageSegment(bubble.body)]
      const res =
        target.kind === 'private'
          ? await client.sendPrivateMessage(target.userId, payload)
          : await client.sendGroupMessage(target.groupId, payload)
      if (res.ok) {
        outcome.sent += 1
        outcome.images += 1
      } else {
        outcome.failed += 1
        log.warn('qq image send failed', { target: target.kind, error: res.error })
      }
      continue
    }

    // 贴纸占位在 QQ 上没有对应资源，直接跳过（表情包走 image 气泡）
    if (bubble.kind === 'sticker') {
      log.debug('sticker skipped on qq', { id: bubble.body })
      continue
    }

    // 最后一刻清洗：模型偶尔会把内部标签当正文吐出来
    const sanitized = sanitizeOutboundText(
      formatBubbleForWeixin(bubble.body, QQ_MAX_TEXT_PER_MESSAGE)
    )
    if (!hasSendableContent(sanitized)) continue

    // 单条超限时按句读兜底切分，避免被 OneBot 端截断
    const chunks = splitOverlongText(sanitized, QQ_MAX_TEXT_PER_MESSAGE)

    for (const chunk of chunks) {
      outcome.attempted += 1

      // 语音分支：长文本按句末标点切成多条语音，单条控制在 maxChars / maxSeconds 内
      if (voiceCfg && args.voice && chunks.length === 1) {
        const decision = args.forceLongVoice
          ? { speak: true as const }
          : shouldSpeak({ text: sanitized, cfg: voiceCfg })
        if (decision.speak && (await isTtsHealthy(voiceCfg.ttsUrl))) {
          // 长语音（[长语音] / forceLongVoice）按「整段合成一条」的契约处理，只受 maxSeconds 保护；
          // 普通概率语音才按 maxChars 切（语速变慢后 55 秒只够 ~200 字，避免超时被退回文字）。
          const pieces = args.forceLongVoice ? [sanitized] : splitForVoice(sanitized, voiceCfg.maxChars)
          let spoken = 0
          let aborted = false
          for (const piece of pieces) {
            const voice = await synthesizeSilk({
              dataRoot: args.voice.dataRoot,
              text: piece,
              cfg: voiceCfg
            })
            if (!voice) {
              aborted = true
              break
            }
            // 合成出来超长（> maxSeconds）就不发了：QQ 单条上限 60 秒，硬发会被截断
            if (voice.seconds > voiceCfg.maxSeconds) {
              log.warn('qq voice too long, fallback to text', {
                seconds: voice.seconds,
                limit: voiceCfg.maxSeconds,
                chars: piece.length
              })
              aborted = true
              break
            }
            const payload = [recordSegment(recordFileValue(voice, voiceCfg.sendMode))]
            const res =
              target.kind === 'private'
                ? await client.sendPrivateMessage(target.userId, payload)
                : await client.sendGroupMessage(target.groupId, payload)
            if (!res.ok) {
              outcome.failed += 1
              log.warn('qq voice send failed, falling back to text', { error: res.error })
              aborted = true
              break
            }
            spoken += 1
            log.info('qq voice sent', {
              seconds: voice.seconds,
              gen: voice.genSeconds,
              part: `${spoken}/${pieces.length}`
            })
          }
          if (spoken > 0) {
            outcome.sent += spoken
            outcome.voices += spoken
            if (!aborted) continue
            // 中途失败：已经发出去的语音保留，剩下的文字补发，避免整段丢失
            const rest = pieces.slice(spoken).join('')
            if (rest.trim()) {
              outcome.attempted += 1
              const res =
                target.kind === 'private'
                  ? await client.sendPrivateMessage(target.userId, [textSegment(rest)])
                  : await client.sendGroupMessage(target.groupId, [textSegment(rest)])
              if (res.ok) outcome.sent += 1
              else outcome.failed += 1
            }
            continue
          }
        }
      }

      const payload = [textSegment(chunk)]
      const res =
        target.kind === 'private'
          ? await client.sendPrivateMessage(target.userId, payload)
          : await client.sendGroupMessage(target.groupId, payload)

      if (res.ok) {
        outcome.sent += 1
      } else {
        outcome.failed += 1
        log.warn('qq send failed', { target: target.kind, error: res.error })
      }
    }
  }

  log.info('qq outbound done', outcome)
  return outcome
}
