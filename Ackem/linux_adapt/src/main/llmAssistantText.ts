/** 从 OpenAI 兼容响应中取出 assistant 正文（含 DeepSeek thinking 模型的 reasoning_content） */

export function extractJsonPayloadFromText(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]?.trim()) return fence[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)

  return null
}

export function resolveAssistantMessageText(message?: {
  content?: string | null
  reasoning_content?: string | null
}): string {
  if (!message) return ''
  const content = (message.content ?? '').trim()
  if (content) return message.content ?? ''

  const reasoning = (message.reasoning_content ?? '').trim()
  if (!reasoning) return ''

  const json = extractJsonPayloadFromText(reasoning)
  return json ?? reasoning
}
