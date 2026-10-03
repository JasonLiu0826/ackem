import type { ChatMessage, MessageContentPart } from './types.js'

export function flattenMessageContent(
  content: ChatMessage['content']
): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const bits: string[] = []
  let images = 0
  let docs = 0
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    if (part.type === 'text' && part.text) bits.push(part.text)
    else if (part.type === 'image_url') images += 1
    else if (part.type === 'document') docs += 1
  }
  if (images) bits.push(`[${images} image(s) attached]`)
  if (docs) bits.push(`[${docs} PDF document(s) attached]`)
  return bits.join('\n')
}

export function messageContentParts(
  content: ChatMessage['content']
): MessageContentPart[] | null {
  return Array.isArray(content) ? content : null
}

/** Drop raw base64 before writing sessions to disk. */
export function stripBinaryContentParts(
  content: ChatMessage['content']
): ChatMessage['content'] {
  if (!Array.isArray(content)) return content
  return content.map((part) => {
    if (part.type === 'image_url') {
      return { type: 'text' as const, text: '[image omitted from session save — re-read the file]' }
    }
    if (part.type === 'document') {
      return { type: 'text' as const, text: '[PDF omitted from session save — re-read the file]' }
    }
    return part
  })
}

export function countMediaParts(content: ChatMessage['content']): {
  images: number
  documents: number
} {
  if (!Array.isArray(content)) return { images: 0, documents: 0 }
  let images = 0
  let documents = 0
  for (const part of content) {
    if (part.type === 'image_url') images += 1
    if (part.type === 'document') documents += 1
  }
  return { images, documents }
}

/** ~high-detail image tokens; native PDF is a larger blob. */
export const ESTIMATED_TOKENS_PER_IMAGE = 1600
export const ESTIMATED_TOKENS_PER_NATIVE_PDF = 4000

export type PortableMediaPart = {
  kind: 'image' | 'pdf'
  mime: string
  base64: string
  label?: string
}

export type MediaToPartsOpts = {
  /** DeepSeek vision: original; OpenAI/Gemini/Qwen: high. */
  detail?: 'low' | 'high' | 'auto' | 'original'
  /** Keep Anthropic document blocks; drop them on OpenAI-compat hosts. */
  nativePdf?: boolean
}

export function mediaToContentParts(
  media: PortableMediaPart[],
  opts?: MediaToPartsOpts
): MessageContentPart[] {
  const detail = opts?.detail ?? 'high'
  const parts: MessageContentPart[] = []
  for (const m of media) {
    if (m.kind === 'image') {
      parts.push({
        type: 'image_url',
        image_url: {
          url: `data:${m.mime};base64,${m.base64}`,
          detail
        }
      })
    } else if (m.kind === 'pdf') {
      if (!opts?.nativePdf) continue
      parts.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: m.mime || 'application/pdf',
          data: m.base64
        }
      })
    }
  }
  return parts
}

export function mediaFollowUpMessage(
  media: PortableMediaPart[],
  opts?: MediaToPartsOpts
): ChatMessage | null {
  const parts = mediaToContentParts(media, opts)
  if (!parts.length) return null
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Attached media from the last tool result(s). Use these images/PDF pages together with the extracted text. Do not claim you cannot see them.'
      },
      ...parts
    ]
  }
}
