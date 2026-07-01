/** 去掉主进程 status 末尾省略号，由 UI 三点动画表达「进行中」 */
export function normalizeChatActivityLabel(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  return t.replace(/[…\.。]+$/u, '')
}
