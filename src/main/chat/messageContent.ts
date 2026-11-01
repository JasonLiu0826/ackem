// [chat/messageContent] — 把多模态 content 压成纯文本
// 之前直接 JSON.stringify(parts) 会把 base64 图片整段塞给模型，
// 模型就会把这段 JSON 原样"复读"出来，看起来像乱码。

type ContentPart = {
  type?: string
  text?: string
  image_url?: { url?: string }
}

export function flattenMessageContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (content == null) return ''
  if (Array.isArray(content)) {
    const pieces: string[] = []
    for (const raw of content) {
      if (typeof raw === 'string') {
        pieces.push(raw)
        continue
      }
      if (!raw || typeof raw !== 'object') continue
      const part = raw as ContentPart
      if (part.type === 'text' && typeof part.text === 'string') {
        pieces.push(part.text)
      } else if (part.type === 'image_url') {
        // 图片只留占位，绝不把 data URI / URL 塞进文本上下文
        pieces.push('[图片]')
      } else if (typeof part.text === 'string') {
        pieces.push(part.text)
      }
    }
    return pieces.join('\n').trim()
  }
  if (typeof content === 'object') {
    const part = content as ContentPart
    if (part.type === 'text' && typeof part.text === 'string') return part.text
    if (part.type === 'image_url') return '[图片]'
    try {
      return JSON.stringify(content)
    } catch {
      return String(content)
    }
  }
  return String(content)
}
