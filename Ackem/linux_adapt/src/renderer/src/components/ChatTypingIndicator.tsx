import { t } from '../lib/i18n'

type Props = {
  /** 为空时显示默认思考文案 + 跳动三点 */
  label?: string | null
}

const THINKING_FALLBACK = '正在认真思考~'
const REPLYING_FALLBACK = '正在回复…'

function tOr(key: string, fallback: string): string {
  const v = t(key)
  return v === key ? fallback : v
}

/** 伴侣回复等待：状态文案 + 波动跳跃三点 */
export function ChatTypingIndicator({ label }: Props): JSX.Element {
  const displayLabel = label ?? tOr('chat.status.thinking', THINKING_FALLBACK)
  const ariaLabel = label ? `${label}…` : tOr('chat.status.replying', REPLYING_FALLBACK)
  return (
    <div
      className="chat-typing-indicator inline-flex items-center gap-2 text-ink-muted"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <span className="chat-typing-label text-sm">{displayLabel}</span>
      <span className="chat-typing-dots inline-flex items-end gap-[3px]" aria-hidden>
        <span className="chat-typing-dot" />
        <span className="chat-typing-dot" />
        <span className="chat-typing-dot" />
      </span>
    </div>
  )
}
