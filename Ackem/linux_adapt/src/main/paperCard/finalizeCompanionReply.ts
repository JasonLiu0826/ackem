/** 纸面卡后伴侣跟评：去掉未闭合的动作描写，并保证句末完整 */
export function finalizePaperCardCompanionReply(text: string, maxChars = 140): string {
  let t = text.trim()
  if (!t) return t

  if (t.length > maxChars) {
    t = t.slice(0, maxChars)
  }

  t = dropIncompleteTrailingAside(t)

  t = t.replace(/[，,、—-]+$/u, '').trim()
  if (!t) return t

  if (!/(?:[。！？…~～]|[）)]$)/u.test(t)) {
    t += '。'
  }

  return t
}

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

  // 未闭合片段靠近句尾时才裁掉，避免误伤正常括号
  if (openIdx < s.length - 24) return s
  return s.slice(0, openIdx).trimEnd()
}
