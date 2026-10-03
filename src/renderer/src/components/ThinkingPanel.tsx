import { useState } from 'react'

/**
 * DeepSeek 式思考折叠面板 (阶段 3-4 感知层前端收口):
 * - 思考中: 灰度单行「思考中…」+ 展开箭头, 实时累计 reasoning 文本;
 * - 完成: 自动折叠为「已深度思考」灰度行, 点击可展开回看;
 * - 折叠上限 4 行, 超出内部滚动, 不挤压正文 (设计 §17.2 显示规格)。
 * 纯展示组件; 文本由 ChatPage 从 chat:reasoning 事件累计。
 */

export type ThinkingState = 'idle' | 'thinking' | 'done'

export function ThinkingPanel({
  state,
  text,
  defaultExpanded = false
}: {
  state: ThinkingState
  text: string
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  if (state === 'idle' || !text.trim()) return null

  const label =
    state === 'thinking' ? '思考中…' : `已深度思考（${text.length} 字）`
  const preview = text.replace(/\s+/g, ' ').trim().slice(-120)

  return (
    <div
      className="mb-1 rounded-lg bg-surface-inset/40 px-3 py-1.5 text-[11px] leading-relaxed text-ink-muted"
      data-testid="thinking-panel"
    >
      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-left text-ink-muted/80 hover:text-ink-muted"
        onClick={() => setExpanded((v) => !v)}
        data-testid="thinking-toggle"
      >
        <span
          className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}
          aria-hidden
        >
          ▸
        </span>
        <span data-testid="thinking-label">{label}</span>
        {!expanded && state === 'thinking' && (
          <span className="truncate opacity-70" data-testid="thinking-preview">
            {preview}
          </span>
        )}
      </button>
      {expanded && (
        <div
          className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap border-t border-surface-inset/60 pt-1"
          data-testid="thinking-body"
        >
          {text}
        </div>
      )}
    </div>
  )
}
