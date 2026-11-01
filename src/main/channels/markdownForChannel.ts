import { stripSplitMarkers } from '../chat/pacedStreamEmitter'
import { stripChannelControlTags } from './channelControlTags'

const CONTROL_TAG_RE = /\[(?:SPLIT|emoji:[^\]]+|sticker:[a-zA-Z0-9_-]+)\]/gi

/** 单条微信 bubble：去 markdown / 控制 tag，保留 emoji */
export function formatBubbleForWeixin(raw: string, maxLen = 3800): string {
  let text = stripChannelControlTags(raw.replace(CONTROL_TAG_RE, '').trim())
  // 先把 ``` 围栏代码块摘出来：下面去 markdown 的规则会把三个反引号当成
  // 行内代码吃掉一个，导致微信里收到的代码少反引号、还混进逗号。
  const fences: string[] = []
  text = text.replace(/```[\s\S]*?```/g, (block) => {
    fences.push(block)
    return `\u0000FENCE${fences.length - 1}\u0000`
  })
  text = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '· ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // 还原代码块（原样保留，不再走 markdown 清理）
  text = text.replace(/\u0000FENCE(\d+)\u0000/g, (_, i: string) => fences[Number(i)] ?? '')

  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen - 1)}…`
}

/** @deprecated 整段单条发送；微信多 bubble 请用 formatBubbleForWeixin */
export function formatTextForWeixin(raw: string, maxLen = 3800): string {
  return formatBubbleForWeixin(stripSplitMarkers(raw), maxLen)
}
