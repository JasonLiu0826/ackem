type Props = {
  text: string
  /** 流式进行中：纯文本 + 光标，不做 Markdown 解析 */
  active?: boolean
  className?: string
}

/** LLM 首字流式：逐字打出，结束后再由 MarkdownContent 接管排版 */
export function StreamingMessage({ text, active = false, className }: Props): JSX.Element {
  return (
    <span
      className={['streaming-message whitespace-pre-wrap text-sm leading-relaxed', className]
        .filter(Boolean)
        .join(' ')}
    >
      {text}
      {active ? <span className="streaming-message-cursor" aria-hidden /> : null}
    </span>
  )
}
