import { useMemo } from 'react'
import { t } from '../lib/i18n'
import type { PlanSummary } from '../../../shared/planSession'
import type { PlanArtifactDeployStatus } from '../../../shared/planArtifact'
import { planSummaryToMarkdown } from '../../../shared/planUi'
import { renderMarkdown } from './md'

type Props = {
  summary: PlanSummary
  artifactStatus?: PlanArtifactDeployStatus
  confirmed: boolean
  confirmedAt?: string
  canConfirm: boolean
  busy?: boolean
  onConfirm: () => void
  onRevise: () => void
  /** preview：选项卡上方只读摘要；sidebar：侧栏完整确认卡 */
  variant?: 'sidebar' | 'preview'
}

export function PlanSummaryCard({
  summary,
  artifactStatus,
  confirmed,
  confirmedAt,
  canConfirm,
  busy,
  onConfirm,
  onRevise,
  variant = 'sidebar'
}: Props): JSX.Element {
  const isPreview = variant === 'preview'
  const confirmDisabled = busy || !canConfirm || artifactStatus?.kind === 'undecided'
  const confirmLabel = artifactStatus?.confirmButtonLabel ?? '确认方案，准备生成'
  const summaryTableHtml = useMemo(() => {
    const md = planSummaryToMarkdown(summary)
    return md ? renderMarkdown(md) : ''
  }, [summary])

  return (
    <div
      className={`rounded-xl border p-4 ${
        confirmed
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : isPreview
            ? 'border-surface-inset/60 bg-surface/40'
            : 'border-accent/30 bg-accent/5'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">
          {isPreview ? '📋 方案摘要' : '📋 方案确认'}
        </h4>
        {confirmed && (
          <span className="text-[10px] text-success">
            已确认{confirmedAt ? ` · ${new Date(confirmedAt).toLocaleString('zh-CN')}` : ''}
          </span>
        )}
      </div>

      {artifactStatus && (
        <div
          className={`mb-3 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed ${
            artifactStatus.kind === 'uskill'
              ? 'border-emerald-500/30 bg-emerald-500/5 text-ink'
              : artifactStatus.kind === 'uplugin'
                ? 'border-amber-500/30 bg-amber-500/5 text-ink'
                : 'border-accent/30 bg-accent/5 text-ink'
          }`}
        >
          <p className="font-medium">产物：{artifactStatus.label}</p>
          <p className="mt-1 text-ink-muted">{artifactStatus.hint}</p>
        </div>
      )}

      {summaryTableHtml ? (
        <div
          className="plan-md-content plan-summary-table [&_table]:my-0 [&_div:first-child]:my-0"
          dangerouslySetInnerHTML={{ __html: summaryTableHtml }}
        />
      ) : null}

      {isPreview && !confirmed && (
        <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
          请先看完摘要，再选下方「按这个方案开始」确认，或选「我想改」继续调整。
        </p>
      )}

      {!confirmed && !isPreview && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-accent py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRevise}
            className="flex-1 rounded-lg border border-surface-inset py-2 text-xs text-ink-muted hover:text-ink disabled:opacity-40"
          >
            我想改
          </button>
        </div>
      )}

      {confirmed && (
        <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
          {artifactStatus?.kind === 'uplugin'
            ? 'Plugin 方案已锁定。生成与部署会在确认后自动执行（Worker 注入 / notify / fetch / 定时 tick；T2 权限部署时批准）。'
            : artifactStatus?.kind === 'uskill'
              ? 'Skill 方案已锁定。生成与部署会在确认后自动执行（关键词或 autonomous 定时主动）。'
              : '方案已锁定。请继续与 Agent 明确产物类型后再部署。'}
        </p>
      )}

      {!canConfirm && !confirmed && !isPreview && (
        <p className="mt-2 text-[10px] text-accent">
          请先与 Agent 补齐 dispatch 四维（habits / scenarios / summary / keywords）。
        </p>
      )}

      {canConfirm && artifactStatus?.kind === 'undecided' && !confirmed && !isPreview && (
        <p className="mt-2 text-[10px] text-accent">
          请先与 Agent 明确选择 uskill 或 uplugin，再确认方案。
        </p>
      )}
    </div>
  )
}
