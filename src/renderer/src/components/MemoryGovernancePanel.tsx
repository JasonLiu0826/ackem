import { useCallback, useState } from 'react'
import type { MemoryControlCommand } from '../../../main/memory/contracts'
import { PermanentDeleteConfirmDialog } from './PermanentDeleteConfirmDialog'
import {
  executeConfirmedPermanentDelete,
  fetchVerifiedPermanentDeletePreview
} from '../lib/permanentDeleteFlow'

type Props = {
  sessionId: string
  timezone?: string
  factId?: string
  episodeId?: string
  onToast: (msg: string) => void
}

const NON_DELETE_LEVELS: Array<{ kind: 'mute' | 'correct' | 'forget'; label: string; hint: string }> = [
  { kind: 'mute', label: '静音', hint: '不再主动提起，仍可被追问' },
  { kind: 'correct', label: '纠正', hint: '用新摘要覆盖旧事实' },
  { kind: 'forget', label: '遗忘', hint: '软失效，保留墓碑' }
]

export function MemoryGovernancePanel({
  sessionId,
  timezone = 'Asia/Shanghai',
  factId,
  episodeId,
  onToast
}: Props): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [correctText, setCorrectText] = useState('')
  const [legacyDryRun, setLegacyDryRun] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [previewOk, setPreviewOk] = useState(false)
  const [verifiedSummary, setVerifiedSummary] = useState<string | null>(null)
  const [impactHint, setImpactHint] = useState<string | null>(null)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const target = factId
    ? ({ kind: 'fact' as const, factId })
    : episodeId
      ? ({ kind: 'episode' as const, episodeId })
      : null

  const runControl = useCallback(
    async (kind: 'mute' | 'correct' | 'forget') => {
      if (!target) {
        onToast('请先选择事实或情节 ID')
        return
      }
      setBusy(true)
      try {
        let command: MemoryControlCommand
        if (kind === 'correct') {
          command = {
            kind: 'correct',
            target,
            sessionId,
            timezone,
            replacement: { summary: correctText.trim() || '（用户纠正）' }
          }
        } else {
          command = { kind, target, sessionId, timezone }
        }
        const res = await window.ackem.memoryControl(command)
        onToast(res.ok ? `${kind} 已提交` : '治理失败')
      } catch (e) {
        onToast(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [correctText, onToast, sessionId, target, timezone]
  )

  const openDeleteFlow = useCallback(async () => {
    if (!target) {
      onToast('请先选择事实或情节 ID')
      return
    }
    setDeleteOpen(true)
    setConfirmChecked(false)
    setDeleteError(null)
    setBusy(true)
    const preview =
      target.kind === 'fact'
        ? {
            targetKind: 'fact' as const,
            targetId: target.factId,
            scope: 'memory_only' as const,
            summary: correctText.trim() || target.factId
          }
        : {
            targetKind: 'episode' as const,
            targetId: target.episodeId,
            scope: 'memory_only' as const,
            summary: target.episodeId
          }
    try {
      const v = await fetchVerifiedPermanentDeletePreview(preview)
      setPreviewOk(v.previewOk)
      setVerifiedSummary(v.verifiedSummary)
      setImpactHint(v.impactHint)
      if (v.error) setDeleteError(v.error)
    } catch (e) {
      setPreviewOk(false)
      setDeleteError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [correctText, onToast, target])

  const executeDelete = useCallback(async () => {
    if (!target || !confirmChecked || !previewOk) return
    const preview =
      target.kind === 'fact'
        ? {
            targetKind: 'fact' as const,
            targetId: target.factId,
            scope: 'memory_only' as const,
            summary: verifiedSummary ?? target.factId
          }
        : {
            targetKind: 'episode' as const,
            targetId: target.episodeId,
            scope: 'memory_only' as const,
            summary: verifiedSummary ?? target.episodeId
          }
    setBusy(true)
    setDeleteError(null)
    try {
      const res = await executeConfirmedPermanentDelete(preview, verifiedSummary, preview.summary)
      if (!res.ok) {
        setDeleteError(res.error)
        return
      }
      setDeleteOpen(false)
      onToast('永久删除已执行')
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [confirmChecked, onToast, previewOk, target, verifiedSummary])

  const runLegacyDryRun = useCallback(async () => {
    setBusy(true)
    try {
      const r = await window.ackem.memoryLegacyBackfill({ apply: false })
      const report = r.dryRunReport
      setLegacyDryRun(
        `候选 ${report.legacyFactCount} · 跳过(现代证据) ${report.skippedWithModernEvidence} · 冲突组 ${report.potentialConflicts.length} · 时间模糊 ${report.timeAmbiguity.length}`
      )
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [onToast])

  return (
    <section className="border-t border-surface-inset bg-surface-raised px-6 py-4" aria-label="记忆治理">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">四级治理</h2>
      <p className="mt-1 text-[11px] text-ink-muted">
        目标：{factId ?? episodeId ?? '（在下方输入或从审计卡带入）'}
      </p>
      {target ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {NON_DELETE_LEVELS.map((l) => (
            <button
              key={l.kind}
              type="button"
              disabled={busy}
              title={l.hint}
              className="rounded-lg border border-surface-inset px-3 py-1.5 text-xs hover:bg-surface disabled:opacity-50"
              onClick={() => void runControl(l.kind)}
            >
              {l.label}
            </button>
          ))}
          <button
            type="button"
            data-testid="governance-delete-open"
            disabled={busy}
            title="治理级删除并写墓碑"
            className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-surface disabled:opacity-50"
            onClick={() => void openDeleteFlow()}
          >
            删除
          </button>
        </div>
      ) : null}
      {factId ? (
        <div className="mt-3 flex gap-2">
          <input
            value={correctText}
            onChange={(e) => setCorrectText(e.target.value)}
            placeholder="纠正摘要（仅「纠正」使用）"
            className="field-input flex-1 rounded-lg py-1.5 text-xs"
          />
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-surface-inset pt-3">
        <button
          type="button"
          disabled={busy}
          className="rounded-lg bg-accent/90 px-3 py-1.5 text-xs text-white hover:bg-accent disabled:opacity-50"
          onClick={() => void runLegacyDryRun()}
        >
          旧库证据回填 · 仅 dry-run
        </button>
        {legacyDryRun ? <span className="text-[11px] text-ink-muted">{legacyDryRun}</span> : null}
      </div>
      <PermanentDeleteConfirmDialog
        open={deleteOpen}
        busy={busy}
        previewOk={previewOk}
        verifiedSummary={verifiedSummary}
        impactHint={impactHint}
        confirmChecked={confirmChecked}
        error={deleteError}
        onConfirmChecked={setConfirmChecked}
        onCancel={() => setDeleteOpen(false)}
        onExecute={() => void executeDelete()}
      />
    </section>
  )
}
