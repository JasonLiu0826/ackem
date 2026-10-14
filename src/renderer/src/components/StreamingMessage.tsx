import { MarkdownContent } from './MarkdownContent'

type Props = {
  text: string
  /** 流式进行中显示光标，正文始终使用同一套 Markdown 排版 */
  active?: boolean
  className?: string
}

/** 流式与完成态共用 Markdown 排版；外层不保留 HTML 标签之间的格式换行 */
export function StreamingMessage({ text, active = false, className }: Props): JSX.Element {
  return (
    <div
      className={['streaming-message whitespace-normal', className]
        .filter(Boolean)
        .join(' ')}
    >
      <MarkdownContent source={text} chat />
      {active ? <span className="streaming-message-cursor" aria-hidden /> : null}
    </div>
  )
}
