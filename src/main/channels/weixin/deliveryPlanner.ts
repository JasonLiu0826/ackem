import { formatBubbleForWeixin } from '../markdownForChannel'
import {
  insertBreathCommas,
  looksLikeStructuredContent,
  RUNON_SOFT_LIMIT,
  splitRunOnBubbles,
  stripTrailingSeparators
} from '../../chat/humanizeReply'
import { getWeixinDeliveryProfile, type WeixinDeliveryProfile } from './deliveryProfiles'
import {
  insertInlineEmoji,
  pickContextEmoji,
  planStandaloneEmojiBurst
} from './emojiContext'
import { resolveStickerEntry } from './stickerRegistry'

export type OutboundBubbleKind = 'text' | 'emoji' | 'sticker'

export type OutboundBubble = {
  kind: OutboundBubbleKind
  body: string
  delayBeforeMs: number
}

const TOKEN_RE = /\[SPLIT\]|\[emoji:([^\]]+)\]|\[sticker:([a-zA-Z0-9_-]+)\]/gi

type ParsedSegment =
  | { type: 'text'; value: string }
  | { type: 'emoji'; value: string; repeat: 1 | 3 }
  | { type: 'sticker'; value: string }

function parseExplicitSegments(raw: string): ParsedSegment[] {
  const segments: ParsedSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  TOKEN_RE.lastIndex = 0
  while ((match = TOKEN_RE.exec(raw)) !== null) {
    const before = raw.slice(lastIndex, match.index).trim()
    if (before) segments.push({ type: 'text', value: before })

    const token = match[0]
    if (/^\[SPLIT\]$/i.test(token)) {
      /* marker only */
    } else if (token.startsWith('[emoji:')) {
      const payload = (match[1] ?? '').trim()
      const repeat = /×3|x3|\*3/i.test(payload) ? 3 : 1
      const emoji = payload.replace(/×3|x3|\*3/i, '').trim()
      if (emoji) segments.push({ type: 'emoji', value: emoji, repeat: repeat as 1 | 3 })
    } else if (token.startsWith('[sticker:')) {
      const id = (match[2] ?? '').trim()
      if (id) segments.push({ type: 'sticker', value: id })
    }

    lastIndex = match.index + token.length
  }

  const tail = raw.slice(lastIndex).trim()
  if (tail) segments.push({ type: 'text', value: tail })

  if (segments.length === 0 && raw.trim()) {
    segments.push({ type: 'text', value: raw.trim() })
  }

  return segments
}

const ENDS_WITH_PUNCT_RE = /[，,、；;：:。！？!?…]$/u

/** 合并多条时补断句：前一条已经以标点收尾就不重复补 */
function joinWithBreath(parts: string[]): string {
  return parts.reduce((acc, part) => {
    if (!acc) return part
    return ENDS_WITH_PUNCT_RE.test(acc) ? acc + part : `${acc}，${part}`
  }, '')
}

const SENTENCE_BREAK =
  /(?<=[。！？!?…])\s*|(?<=[；;])\s*|(?<=[，,])\s*(?=你|我|他|她|别|才|哼|哈|诶)/u
const INTERJECTIONS = new Set(['哼', '哈', '诶', '啊', '哦', '嘛', '呢', '吧'])

/** 仅按句读 / 换行分条，不因字数硬切（超长单句保留完整） */
function splitTextByStyle(text: string): string[] {
  // 结构化判定必须看"格式化之前"的原文：formatBubbleForWeixin 会去掉反引号/井号，
  // 格式化之后再判断就认不出代码块了（会被当普通句子切碎）。
  const structured = looksLikeStructuredContent(text)
  const cleaned = formatBubbleForWeixin(text)
  if (!cleaned) return []
  // 代码 / 表格 / 列表 / 链接：原样一条，别拆也别补标点
  if (structured || looksLikeStructuredContent(cleaned)) return [cleaned]

  const parts = cleaned
    .split(/\n+/)
    // 模型整段不喘气时先按软断点拆成短句，再走下面的句读切分
    .flatMap((line) => splitRunOnBubbles(line, RUNON_SOFT_LIMIT))
    .flatMap((line) => line.split(SENTENCE_BREAK).map((p) => p.trim()).filter(Boolean))
    .map(insertBreathCommas)
    // 句读切点常落在逗号后：剥掉结尾逗号，别让每条以「，」收尾
    .map(stripTrailingSeparators)
    .map((p) => p.trim())
    .filter(Boolean)

  return parts.length ? parts : [cleaned]
}

function mergeTinyFragments(parts: string[], maxChars: number): string[] {
  const out: string[] = []
  for (const p of parts) {
    const t = p.trim()
    if (!t) continue
    const prev = out[out.length - 1]
    if (prev !== undefined && t.length <= 3 && !INTERJECTIONS.has(t)) {
      // 合并必须带断句：直接拼接就是"两句连成一串"的根源
      out[out.length - 1] = joinWithBreath([prev, t])
    } else if (prev !== undefined && prev.length + t.length <= maxChars) {
      // 合并上限卡死在 maxChars（以前留 +8 的余量，会把刚拆开的短句又粘回长条）
      out[out.length - 1] = joinWithBreath([prev, t])
    } else {
      out.push(t)
    }
  }
  return out
}

function clampBubbleCount(parts: string[], profile: WeixinDeliveryProfile): string[] {
  const [minB, maxB] = profile.bubbleRange
  let merged = mergeTinyFragments(parts, profile.maxCharsPerBubble)

  if (merged.length > maxB) {
    const head = merged.slice(0, maxB - 1)
    // 超出条数上限时必须合并，但一定要带断句，否则几段话又粘成一串
    const tail = joinWithBreath(merged.slice(maxB - 1))
    merged = [...head, tail]
  }

  while (merged.length < minB && merged.length === 1 && merged[0].length > 14) {
    const s = merged[0]
    const at = s.indexOf('，', Math.floor(s.length / 2))
    if (at <= 0) break
    // 切点在逗号上：上一条要把逗号剥掉，否则一条消息以「，」收尾，很突兀
    const head = stripTrailingSeparators(s.slice(0, at + 1)).trim()
    const rest = s.slice(at + 1).trim()
    if (!head || !rest) break
    merged = [head, rest]
  }

  return merged.filter(Boolean)
}

/**
 * 两条气泡之间的停顿。
 * 基础值是"反应时间"，typingMsPerChar 是按字数累加的打字时间——
 * 短句像秒回，长句像真的在敲键盘，这是最能骗过人的一处细节。
 */
function randomGap(profile: WeixinDeliveryProfile, rng: () => number, textLen = 0): number {
  const [a, b] = profile.gapMs
  const base = Math.round(a + rng() * (b - a))
  const typing = textLen > 0 ? Math.round(textLen * (profile.typingMsPerChar ?? 0)) : 0
  return base + typing
}

function pushTextBubbles(
  bubbles: OutboundBubble[],
  parts: string[],
  args: {
    presetId: string
    userText: string
    emotion: { aro: number; aff: number }
    profile: WeixinDeliveryProfile
    rng: () => number
    initialDelay: number
  }
): number {
  let delayAcc = args.initialDelay
  const clamped = clampBubbleCount(parts, args.profile)

  for (let i = 0; i < clamped.length; i++) {
    const piece = clamped[i]
    // 补逗号已在 splitTextByStyle 里做过（且那里能看到原文），这里不再二次改写
    let body = piece
    const inline = pickContextEmoji({
      presetId: args.presetId,
      userText: args.userText,
      bubbleText: body,
      aro: args.emotion.aro,
      aff: args.emotion.aff,
      profile: args.profile,
      rng: args.rng
    })
    if (inline) body = insertInlineEmoji(body, inline)

    bubbles.push({
      kind: 'text',
      body: formatBubbleForWeixin(body),
      delayBeforeMs: bubbles.length === 0 && i === 0 ? 0 : delayAcc || randomGap(args.profile, args.rng, body.length)
    })
    // 下一句的停顿按"下一句要打多少字"来估
    delayAcc = randomGap(args.profile, args.rng, (clamped[i + 1] ?? '').length)
  }
  return delayAcc
}

export function planWeixinDelivery(args: {
  rawAssistant: string
  presetId: string
  userText: string
  emotion: { aro: number; aff: number; intensity?: number }
  rng?: () => number
}): OutboundBubble[] {
  const rng = args.rng ?? Math.random
  const profile = getWeixinDeliveryProfile(args.presetId)
  const parsed = parseExplicitSegments(args.rawAssistant)
  const bubbles: OutboundBubble[] = []
  let delayAcc = 0

  for (const seg of parsed) {
    if (seg.type === 'emoji') {
      bubbles.push({
        kind: 'emoji',
        body: seg.value.repeat(seg.repeat),
        delayBeforeMs: bubbles.length === 0 ? 0 : delayAcc || randomGap(profile, rng)
      })
      delayAcc = randomGap(profile, rng)
    } else if (seg.type === 'sticker') {
      if (resolveStickerEntry(seg.value)) {
        bubbles.push({
          kind: 'sticker',
          body: seg.value,
          delayBeforeMs: bubbles.length === 0 ? 0 : delayAcc || randomGap(profile, rng)
        })
        delayAcc = randomGap(profile, rng)
      }
    } else if (seg.type === 'text') {
      const parts = splitTextByStyle(seg.value)
      delayAcc = pushTextBubbles(bubbles, parts, {
        presetId: args.presetId,
        userText: args.userText,
        emotion: args.emotion,
        profile,
        rng,
        initialDelay: delayAcc
      })
    }
  }

  const burst = planStandaloneEmojiBurst({
    profile,
    userText: args.userText,
    aro: args.emotion.aro,
    aff: args.emotion.aff,
    bubbleCount: bubbles.filter((b) => b.kind === 'text').length,
    rng
  })
  if (burst && !bubbles.some((b) => b.kind === 'emoji')) {
    bubbles.push({
      kind: 'emoji',
      body: burst.emoji.repeat(burst.repeat),
      delayBeforeMs: randomGap(profile, rng)
    })
  }

  return bubbles.filter((b) => b.body.trim())
}
