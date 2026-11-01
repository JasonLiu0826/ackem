// [qq] — CQ 码转义、消息段构建、入站纯文本提取
// OneBot v11 允许 message 以「消息段数组」或「CQ 码字符串」两种形式出现，这里都要处理。

import type { OneBotSegment } from './types'

/** CQ 码文本转义（官方规定的四个字符） */
export function escapeCqText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/,/g, '&#44;')
}

/** CQ 码文本反转义 */
export function unescapeCqText(text: string): string {
  return text
    .replace(/&#44;/g, ',')
    .replace(/&#93;/g, ']')
    .replace(/&#91;/g, '[')
    .replace(/&amp;/g, '&')
}

export function textSegment(text: string): OneBotSegment {
  return { type: 'text', data: { text } }
}

/** QQ 经典小黄脸表情段 */
export function faceSegment(id: string | number): OneBotSegment {
  return { type: 'face', data: { id: String(id) } }
}

/** 图片段：file 支持 http(s) URL、本地绝对路径、base64:// 前缀 */
export function imageSegment(file: string): OneBotSegment {
  return { type: 'image', data: { file } }
}

/** 语音段：record 支持 http(s) URL、本地绝对路径、base64:// 前缀 */
export function recordSegment(file: string): OneBotSegment {
  return { type: 'record', data: { file } }
}

/** 引用回复段 */
export function replySegment(messageId: string | number): OneBotSegment {
  return { type: 'reply', data: { id: String(messageId) } }
}

/** @ 某人；qq 传 'all' 表示 @全体成员 */
export function atSegment(qq: string | number): OneBotSegment {
  return { type: 'at', data: { qq: String(qq) } }
}

const CQ_STRING_RE = /\[CQ:([a-zA-Z_]+)((?:,[^\]]*)?)\]/g

/**
 * CQ 码字符串 → 消息段数组。
 * NapCat 在 report_format 为 string 时会这样上报。
 */
export function parseCqString(raw: string): OneBotSegment[] {
  const segments: OneBotSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  CQ_STRING_RE.lastIndex = 0
  while ((match = CQ_STRING_RE.exec(raw)) !== null) {
    const before = raw.slice(lastIndex, match.index)
    if (before) segments.push(textSegment(unescapeCqText(before)))

    const type = match[1]
    const data: Record<string, unknown> = {}
    const paramBody = (match[2] ?? '').replace(/^,/, '')
    if (paramBody) {
      for (const pair of paramBody.split(',')) {
        const eq = pair.indexOf('=')
        if (eq <= 0) continue
        const key = pair.slice(0, eq).trim()
        const value = unescapeCqText(pair.slice(eq + 1))
        if (key) data[key] = value
      }
    }
    segments.push({ type, data })
    lastIndex = match.index + match[0].length
  }

  const tail = raw.slice(lastIndex)
  if (tail) segments.push(textSegment(unescapeCqText(tail)))

  return segments
}

/** message 字段归一到消息段数组 */
export function normalizeSegments(message: OneBotSegment[] | string | undefined): OneBotSegment[] {
  if (Array.isArray(message)) return message
  if (typeof message === 'string') return parseCqString(message)
  return []
}

/**
 * 从入站消息里提取「能给人读懂的文字」。
 * - 文本段直接拼接
 * - face 段还原成 [表情] 这种可读占位，避免模型收到空串
 * - image / record 给出可读占位，便于模型知道「对方发了图/语音」
 * - at 段在私聊里通常是自己，转成可读文本
 * - reply 段忽略（引用内容已在历史里）
 */
export function extractPlainText(message: OneBotSegment[] | string | undefined): string {
  const segments = normalizeSegments(message)
  const parts: string[] = []

  for (const seg of segments) {
    switch (seg.type) {
      case 'text': {
        const text = typeof seg.data.text === 'string' ? seg.data.text : ''
        if (text) parts.push(text)
        break
      }
      case 'face': {
        parts.push('[表情]')
        break
      }
      case 'mface':
      case 'image': {
        const summary = typeof seg.data.summary === 'string' ? seg.data.summary : ''
        // 图片会作为多模态内容真正传给模型；这里只留一个极轻的锚点，
        // 避免它把"[图片]"当成"我看过了"而不去看真正的图。
        parts.push(summary ? `[图:${summary}]` : '[图]')
        break
      }
      case 'record': {
        parts.push('[他发来一条语音，你听不到里面的内容]')
        break
      }
      case 'video': {
        parts.push('[他发来一段视频，你看不到视频画面和声音]')
        break
      }
      case 'file': {
        parts.push('[他发来一个文件，你看不到文件内容]')
        break
      }
      case 'at': {
        const qq = typeof seg.data.qq === 'string' ? seg.data.qq : ''
        if (qq === 'all') parts.push('@全体成员')
        else if (qq) parts.push(`@${qq}`)
        break
      }
      case 'reply':
      case 'json':
      case 'xml':
      case 'poke':
      case 'dice':
      case 'rps':
      case 'shake':
      case 'markdown': {
        // 这些段不承载可读语义，或由上层单独处理
        break
      }
      default: {
        // 未知段：若带 text 字段就取，否则忽略
        const text = typeof seg.data.text === 'string' ? seg.data.text : ''
        if (text) parts.push(text)
        break
      }
    }
  }

  return parts.join('').trim()
}

/**
 * 提取入站消息里的图片地址。
 * OneBot 的 image 段一般带 url（可直接下载）；没有 url 时退回 file 字段
 * （NapCat 常把本地路径或 base64:// 放在 file 里）。
 */
export function extractImageUrls(segments: OneBotSegment[] | string | undefined): string[] {
  const segs = normalizeSegments(segments)
  const out: string[] = []
  for (const seg of segs) {
    if (seg.type !== 'image') continue
    const data = (seg.data ?? {}) as Record<string, unknown>
    const url = typeof data.url === 'string' ? data.url.trim() : ''
    const file = typeof data.file === 'string' ? data.file.trim() : ''
    const picked = url || file
    if (picked) out.push(picked)
  }
  return out
}

/** 提取入站语音段引用（NapCat 的 file/url） */
export function extractRecordFiles(segments: OneBotSegment[] | string | undefined): string[] {
  const segs = normalizeSegments(segments)
  const out: string[] = []
  for (const seg of segs) {
    if (seg.type !== 'record') continue
    const data = (seg.data ?? {}) as Record<string, unknown>
    const file = typeof data.file === 'string' ? data.file.trim() : ''
    const url = typeof data.url === 'string' ? data.url.trim() : ''
    const picked = file || url
    if (picked) out.push(picked)
  }
  return out
}

/**
 * 把超长文本按 QQ 单条上限切成多段，优先在句读处断开。
 * 只在单条气泡超限时兜底使用。
 */
/**
 * 入站文本最后一道闸：剥掉会干扰模型的特殊标签，并截断超长内容。
 * 出站有 sanitizeOutboundText 清洗，入站此前完全没有——
 * 谁发一句 <system_reminder> 或几万字长文，都会原样进 prompt。
 */
export function clampInboundText(text: string, maxLen = 2000): string {
  let t = text
  // 大模型内部标签（DeepSeek / Qwen 风格）
  t = t.replace(/<\|[^|]+\|>/g, '')
  // XML 风格成对标签
  t = t.replace(/<(system_reminder|system|internal|ds_safety)[\s\S]*?<\/\1>/gi, '')
  if (t.length > maxLen) {
    t = t.slice(0, maxLen) + `\n[消息太长，仅显示前 ${maxLen} 字]`
  }
  return t.trim()
}

export function splitOverlongText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]

  const out: string[] = []
  let rest = text
  while (rest.length > maxLen) {
    let cut = -1
    for (const mark of ['。', '！', '？', '…', '\n', '；', '，']) {
      const at = rest.lastIndexOf(mark, maxLen)
      if (at > cut) cut = at
    }
    if (cut <= 0) cut = maxLen - 1
    out.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1).trim()
  }
  if (rest) out.push(rest)
  return out.filter(Boolean)
}
