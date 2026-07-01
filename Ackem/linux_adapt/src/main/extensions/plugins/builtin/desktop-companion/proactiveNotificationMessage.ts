import type { TimeContext } from './desktop-companion'
import { stripChannelControlTags } from '../../../../channels/channelControlTags'

/** 去掉末尾未闭合的括号动作，如「(歪了歪」 */
function dropIncompleteTrailingAside(s: string): string {
  const openCn = s.lastIndexOf('（')
  const openEn = s.lastIndexOf('(')
  const openIdx = Math.max(openCn, openEn)
  if (openIdx < 0) return s

  const closeCn = s.lastIndexOf('）')
  const closeEn = s.lastIndexOf(')')
  const closeIdx = Math.max(closeCn, closeEn)
  if (closeIdx > openIdx) return s

  if (openIdx < s.length - 28) return s
  return s.slice(0, openIdx).trimEnd()
}

function truncateAtBoundary(s: string, max: number): string {
  if (s.length <= max) return s
  const slice = s.slice(0, max)
  const lastPunct = Math.max(
    slice.lastIndexOf('。'),
    slice.lastIndexOf('！'),
    slice.lastIndexOf('？'),
    slice.lastIndexOf('…'),
    slice.lastIndexOf('，')
  )
  if (lastPunct >= Math.floor(max * 0.35)) return slice.slice(0, lastPunct + 1)
  return `${slice.trimEnd()}…`
}

const NARRATION_ONLY =
  /^(?:[（(].*[）)]|[（(][^）)]*)$/u

const META_NARRATION =
  /作为.{0,8}(?:AI|ai).{0,6}伴侣|AI伴侣|AI意识|我正盯着屏幕|按捺不(?:住|让)|心跳(?:越|越)|该不会又想起|他以前总|真是个别扭/u

/** 桌面通知必须是可直接对用户说的完整短句，不能是括号旁白/状态描写 */
export function sanitizeDesktopProactiveMessage(raw: string, maxChars = 72): string | null {
  let t = stripChannelControlTags(raw.trim()).replace(/\s+/g, ' ')
  if (!t) return null

  t = t.replace(/^[""「『]|["」』]$/g, '').trim()

  // 整段包在括号里 → 多半是旁白，直接丢弃
  if (NARRATION_ONLY.test(t)) return null

  // 去掉句首括号动作块
  while (/^[（(]/u.test(t)) {
    const close = t.search(/[）)]/u)
    if (close <= 0) return null
    t = t.slice(close + 1).trim()
  }

  t = dropIncompleteTrailingAside(t)
  t = t.replace(/[（(][^）)]{0,24}[）)]/gu, '').trim()

  if (!t || META_NARRATION.test(t)) return null
  if (/^[（(]/u.test(t)) return null

  if (t.length > maxChars) t = truncateAtBoundary(t, maxChars)

  t = t.replace(/[，,、—-]+$/u, '').trim()
  if (t.length < 2) return null

  if (!/(?:[。！？…~～?!]|[）)]$)/u.test(t)) {
    if (t.length > 18) {
      const cut = Math.max(t.lastIndexOf('，'), t.lastIndexOf('。'), t.lastIndexOf('！'))
      if (cut >= 4) t = t.slice(0, cut + 1)
    }
    if (!/(?:[。！？…~～?!]$)/u.test(t)) t += '。'
  }

  return t.length >= 2 && t.length <= maxChars + 4 ? t : null
}

export function templateDesktopProactiveMessage(timeCtx: TimeContext): string {
  if (timeCtx.timeOfDay === 'late_night' || timeCtx.timeOfDay === 'night') {
    return '还没睡吗？'
  }
  if (timeCtx.timeOfDay === 'morning') {
    return '早安，今天怎么样？'
  }
  if (timeCtx.hour >= 11 && timeCtx.hour < 14) {
    return '吃饭了吗？'
  }
  if (timeCtx.timeOfDay === 'evening') {
    return '忙完了没？'
  }
  return '在吗？想你了。'
}
