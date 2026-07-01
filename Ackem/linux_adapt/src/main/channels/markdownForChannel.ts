import { stripSplitMarkers } from '../chat/pacedStreamEmitter'
import { stripChannelControlTags } from './channelControlTags'

const CONTROL_TAG_RE = /\[(?:SPLIT|emoji:[^\]]+|sticker:[a-zA-Z0-9_-]+)\]/gi

/** 单条微信 bubble：去 markdown / 控制 tag，保留 emoji */
export function formatBubbleForWeixin(raw: string, maxLen = 3800): string {
  let text = stripChannelControlTags(raw.replace(CONTROL_TAG_RE, '').trim())
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

  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen - 1)}…`
}

/** @deprecated 整段单条发送；微信多 bubble 请用 formatBubbleForWeixin */
export function formatTextForWeixin(raw: string, maxLen = 3800): string {
  return formatBubbleForWeixin(stripSplitMarkers(raw), maxLen)
}
