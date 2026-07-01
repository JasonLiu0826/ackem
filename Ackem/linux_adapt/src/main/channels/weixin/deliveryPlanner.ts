import { formatBubbleForWeixin } from '../markdownForChannel'
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

const SENTENCE_BREAK =
  /(?<=[。！？!?…])\s*|(?<=[；;])\s*|(?<=[，,])\s*(?=你|我|他|她|别|才|哼|哈|诶)/u
const INTERJECTIONS = new Set(['哼', '哈', '诶', '啊', '哦', '嘛', '呢', '吧'])

/** 仅按句读 / 换行分条，不因字数硬切（超长单句保留完整） */
function splitTextByStyle(text: string): string[] {
  const cleaned = formatBubbleForWeixin(text)
  if (!cleaned) return []

  const parts = cleaned
    .split(/\n+/)
    .flatMap((line) => line.split(SENTENCE_BREAK).map((p) => p.trim()).filter(Boolean))

  return parts.length ? parts : [cleaned]
}

function mergeTinyFragments(parts: string[], maxChars: number): string[] {
  const out: string[] = []
  for (const p of parts) {
    const t = p.trim()
    if (!t) continue
    if (out.length > 0 && t.length <= 3 && !INTERJECTIONS.has(t)) {
      out[out.length - 1] = `${out[out.length - 1]}${t}`
    } else if (out.length > 0 && out[out.length - 1].length + t.length <= maxChars + 8) {
      out[out.length - 1] = `${out[out.length - 1]}${t}`
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
    const tail = merged.slice(maxB - 1).join('')
    merged = [...head, tail]
  }

  while (merged.length < minB && merged.length === 1 && merged[0].length > 14) {
    const s = merged[0]
    const at = s.indexOf('，', Math.floor(s.length / 2))
    if (at <= 0) break
    merged = [s.slice(0, at + 1).trim(), s.slice(at + 1).trim()]
  }

  return merged.filter(Boolean)
}

function randomGap(profile: WeixinDeliveryProfile, rng: () => number): number {
  const [a, b] = profile.gapMs
  return Math.round(a + rng() * (b - a))
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
    let body = clamped[i]
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
      delayBeforeMs: bubbles.length === 0 && i === 0 ? 0 : delayAcc || randomGap(args.profile, args.rng)
    })
    delayAcc = randomGap(args.profile, args.rng)
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
