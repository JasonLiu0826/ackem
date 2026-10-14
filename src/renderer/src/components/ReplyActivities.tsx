import type { ReplyActivity } from '../../../shared/response'
export function ReplyActivities({ items }: { items?: ReplyActivity[] }): JSX.Element | null {
  if (!items?.length) return null
  return <details className="chat-reply-activities"><summary>处理过程 · {items.length} 项</summary><ol>{items.map((item, index) => <li key={index}><time>{new Date(item.at).toLocaleTimeString('zh-CN', { hour12: false })}</time><span>{item.text}</span></li>)}</ol></details>
}
