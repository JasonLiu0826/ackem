import { useState } from 'react'
import { t } from '../lib/i18n'
import type { PlanDispatchDraft } from '../../../shared/planSession'
import { DISPATCH_DRAFT_FIELDS, isDispatchDraftComplete } from '../../../shared/planUi'

type Props = {
  draft: PlanDispatchDraft
  variant?: 'inline' | 'sidebar'
}

export function PlanDispatchDraftPanel({ draft, variant = 'inline' }: Props): JSX.Element {
  const complete = isDispatchDraftComplete(draft)
  const filled = DISPATCH_DRAFT_FIELDS.filter((f) => {
    const v = draft[f.key]
    return Array.isArray(v) ? v.length > 0 : Boolean(v)
  }).length

  const isSidebar = variant === 'sidebar'
  const [expanded, setExpanded] = useState(!isSidebar)

  const keywordChips = (draft.keywords ?? []).slice(0, 3)

  if (isSidebar && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="plan-dispatch-panel flex w-full items-center justify-between rounded-lg border border-surface-inset/40 bg-surface-inset/10 px-2.5 py-2 text-left"
      >
        <span className="text-[11px] font-medium text-ink">
          Dispatch {filled}/{DISPATCH_DRAFT_FIELDS.length}
          {complete ? ' · 齐全' : ''}
        </span>
        <span className="text-[10px] text-ink-muted">▸</span>
      </button>
    )
  }

  return (
    <div
      className={`plan-dispatch-panel ${
        isSidebar
          ? 'rounded-lg border border-surface-inset/40 bg-surface-inset/10 p-2.5'
          : 'max-h-28 shrink-0 overflow-y-auto border-b border-surface-inset/30 bg-surface-inset/10 px-4 py-2'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink">Dispatch 采集</span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${complete ? 'text-success' : 'text-ink-muted'}`}>
            {filled}/{DISPATCH_DRAFT_FIELDS.length}
            {complete ? ' · 齐全' : ''}
          </span>
          {isSidebar ? (
            <button
              type="button"
              className="text-[10px] text-ink-muted hover:text-ink"
              onClick={() => setExpanded(false)}
            >
              ▾
            </button>
          ) : null}
        </div>
      </div>
      {isSidebar && keywordChips.length > 0 && !expanded ? null : (
        <ul
          className={`gap-y-1 text-[11px] leading-snug ${
            isSidebar ? 'flex flex-col' : 'grid grid-cols-2 gap-x-3'
          }`}
        >
          {DISPATCH_DRAFT_FIELDS.map((f) => {
            const v = draft[f.key]
            const ok = Array.isArray(v) ? v.length > 0 : Boolean(v)
            const display = Array.isArray(v) ? v.join(' · ') : (v as string | undefined)
            const maxLen = isSidebar ? 80 : 48
            return (
              <li key={f.key} className={ok ? 'text-ink' : 'text-ink-muted'}>
                <span>{ok ? '✓' : '○'} </span>
                <span className="font-medium">{f.label.split(' ')[0]}</span>
                {display
                  ? `: ${display.slice(0, maxLen)}${display.length > maxLen ? '…' : ''}`
                  : ''}
              </li>
            )
          })}
        </ul>
      )}
      {isSidebar && expanded && keywordChips.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {keywordChips.map((k) => (
            <span
              key={k}
              className="rounded-full bg-surface-inset px-2 py-0.5 text-[10px] text-ink-muted"
            >
              {k}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
