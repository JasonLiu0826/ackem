import { useState } from 'react'
import { t } from '../lib/i18n'
import type { PlanChoiceOption } from '../../../shared/planUi'
import { isPlanConfirmChoice } from '../../../shared/planUi'
import { renderInline } from './md'

type Props = {
  options: PlanChoiceOption[]
  disabled?: boolean
  /** 「按方案开始」类选项被 Design Spec 门禁挡住时的首条原因 */
  confirmGateMissing?: string | null
  onSelect: (option: PlanChoiceOption, customText?: string) => void
}

export function PlanChoiceCards({
  options,
  disabled,
  confirmGateMissing,
  onSelect
}: Props): JSX.Element | null {
  const [customDraft, setCustomDraft] = useState<Record<string, string>>({})

  if (options.length === 0) return null

  return (
    <div className="flex h-full flex-col">
      <p className="mb-2 shrink-0 text-xs font-medium text-ink">请选择一个方案</p>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {options.map((opt) => {
          const confirmBlocked =
            Boolean(confirmGateMissing) && isPlanConfirmChoice(opt) && !opt.isCustom
          const optDisabled = disabled || confirmBlocked
          return (
          <div
            key={opt.key}
            className="rounded-lg border border-surface-inset/50 bg-surface/30 p-2.5 transition hover:border-accent/35"
          >
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent/15 text-[10px] font-bold text-accent">
                {opt.key}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[13px] font-medium leading-snug text-ink [&_strong]:font-semibold"
                  dangerouslySetInnerHTML={{ __html: renderInline(opt.title) }}
                />
                {opt.body && (
                  <p
                    className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-muted [&_strong]:font-semibold"
                    dangerouslySetInnerHTML={{ __html: renderInline(opt.body) }}
                  />
                )}
              </div>
            </div>
            {opt.isCustom ? (
              <div className="mt-2 flex gap-2 pl-7">
                <input
                  type="text"
                  value={customDraft[opt.key] ?? ''}
                  onChange={(e) =>
                    setCustomDraft((d) => ({ ...d, [opt.key]: e.target.value }))
                  }
                  placeholder="输入你的方案…"
                  className="field-input min-w-0 flex-1 py-1 text-xs"
                  disabled={disabled}
                />
                <button
                  type="button"
                  disabled={optDisabled}
                  onClick={() => onSelect(opt, customDraft[opt.key])}
                  className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-40"
                >
                  提交
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={optDisabled}
                onClick={() => onSelect(opt)}
                className="mt-2 ml-7 w-[calc(100%-1.75rem)] rounded-md border border-accent/25 py-1 text-[11px] text-accent transition hover:bg-accent/10 disabled:opacity-40"
                title={confirmBlocked ? confirmGateMissing ?? undefined : undefined}
              >
                {confirmBlocked ? `还需：${confirmGateMissing}` : '选这个'}
              </button>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}
