import type { SearchCardPayload } from '../../../shared/searchCard'
import { MarkdownContent } from './MarkdownContent'
import { CopyButton } from './CopyButton'
export function legacyPaperMarkdown(row: SearchCardPayload): string {
  let text = row.cardBody?.trim() || row.error || row.query
  const missing = row.sources.filter(s => !text.includes(s.url) && /^https?:\/\//i.test(s.url))
  if (missing.length) text += '\n\n参考来源：\n' + missing.map(s => `- [${s.title.replace(/[\[\]\r\n]/g, '')}](${s.url.replace(/\s/g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')})`).join('\n')
  return text
}
export function LegacyPaperMessage(props: SearchCardPayload): JSX.Element {
  const text = legacyPaperMarkdown(props)
  return <article className="chat-message message-assistant"><div className="chat-message-author">Ackem</div><MarkdownContent source={text} chat /><div className="chat-message-actions"><CopyButton text={text} iconOnly /></div></article>
}
