import { useCallback, useEffect, useMemo, useState } from 'react'
import { t } from '../lib/i18n'
import { useAppStore } from '../store/appStore'
import { InferenceConsentDialog, type ScanEstimatePayload } from './InferenceConsentDialog'
import { INFERENCE_CONSENT_VERSION } from '../../../shared/types'
import {
  IMPORT_CONSENT_VERSION,
  type ImportFactDraft,
  type ImportJob,
} from '../../../shared/documentImport'

type ConsentMode = 'infer' | 'memory' | null

const SUBCATEGORY_LABEL: Record<string, string> = {
  BASIC_PROFILE: '基本资料',
  LIFE_STORY: '人生经历',
  FAMILY: '家人',
  FRIENDS: '朋友',
  PARTNER: '感情',
  TASTES: '喜好',
  HEALTH: '健康',
  CAREER: '职业',
  GOALS: '目标',
  PLANS: '计划',
  ROUTINES: '习惯',
  VULNERABILITIES: '脆弱点',
  VALUES_BELIEFS: '价值观',
}

export function ImportPage(): JSX.Element {
  const pushToast = useAppStore((s) => s.pushToast)
  const [drag, setDrag] = useState(false)
  const [last, setLast] = useState<{ copied: string[]; errors: string[] } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [consentOpen, setConsentOpen] = useState(false)
  const [consentMode, setConsentMode] = useState<ConsentMode>(null)
  const [estimate, setEstimate] = useState<ScanEstimatePayload | null>(null)
  const [dialogLoading, setDialogLoading] = useState(false)
  const [pendingPaths, setPendingPaths] = useState<string[]>([])
  const [importJob, setImportJob] = useState<ImportJob | null>(null)
  const [disabledDrafts, setDisabledDrafts] = useState<Set<string>>(new Set())
  const [commitBusy, setCommitBusy] = useState(false)

  const doImport = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      const r = await window.ackem.importFiles(paths)
      setLast(r)
      setSelected(new Set(r.copied))
      setImportJob(null)
      setDisabledDrafts(new Set())
      if (r.errors.length) pushToast(r.errors[0] ?? '导入出错')
      else pushToast(`已导入 ${r.copied.length} 个文件`)
      await window.ackem.rebuildIndex()
    },
    [pushToast]
  )

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      setDrag(true)
    }
    const onDragLeave = () => setDrag(false)
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setDrag(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      const paths = files.map((f) => window.ackem.getPathForFile(f)).filter(Boolean)
      if (paths.length === 0) {
        pushToast('未解析到本地文件路径，请使用「选择文件」。')
        return
      }
      void doImport(paths)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [doImport, pushToast])

  const pick = async () => {
    const r = await window.ackem.selectFiles()
    await doImport(r.paths)
  }

  const toggleSelect = (rel: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rel)) next.delete(rel)
      else next.add(rel)
      return next
    })
  }

  const pathsForAction = useCallback(() => {
    const copied = last?.copied ?? []
    const selectedList = copied.filter((c) => selected.has(c))
    return selectedList.length > 0 ? selectedList : copied
  }, [last, selected])

  const openConsent = async (mode: ConsentMode, paths: string[]) => {
    if (paths.length === 0) {
      pushToast('请先选择文件')
      return
    }
    try {
      const est = await window.ackem.profileEstimateScan(paths)
      setEstimate(est)
      setPendingPaths(paths)
      setConsentMode(mode)
      setConsentOpen(true)
    } catch (e) {
      pushToast(e instanceof Error ? e.message : String(e))
    }
  }

  const confirmConsent = async () => {
    setDialogLoading(true)
    try {
      if (consentMode === 'infer') {
        const r = await window.ackem.profileInferFromFiles({
          relPaths: pendingPaths,
          consentAck: true,
          consentVersion: INFERENCE_CONSENT_VERSION,
        })
        if (!r.ok) {
          pushToast(r.error ?? '推断失败')
          return
        }
        pushToast('主人六维推断完成，可在设置中查看伴侣 TISOR 建议')
      } else if (consentMode === 'memory') {
        const r = await window.ackem.importParseDocuments({
          relPaths: pendingPaths,
          consentAck: true,
          consentVersion: IMPORT_CONSENT_VERSION,
        })
        if (!r.ok) {
          pushToast(r.error ?? '解析失败')
          return
        }
        setImportJob(r.job)
        setDisabledDrafts(new Set())
        const p = r.promoted?.length ? `，已移入 ${r.promoted.length} 个文件到 memory` : ''
        pushToast(
          `解析完成：${r.job.stats.factsExtracted} 条事实、${r.job.stats.episodesExtracted} 个情节${p}${
            pathsForAction().some((x) => x.toLowerCase().endsWith('.json')) ? '（JSON 直导，无需模型）' : ''
          }`
        )
      }
      setConsentOpen(false)
    } catch (e) {
      pushToast(e instanceof Error ? e.message : String(e))
    } finally {
      setDialogLoading(false)
    }
  }

  const toggleDraft = (draftId: string) => {
    setDisabledDrafts((prev) => {
      const next = new Set(prev)
      if (next.has(draftId)) next.delete(draftId)
      else next.add(draftId)
      return next
    })
  }

  const commitJob = async () => {
    if (!importJob) return
    setCommitBusy(true)
    try {
      const r = await window.ackem.importCommitJob({
        jobId: importJob.id,
        disabledDraftIds: [...disabledDrafts],
      })
      if (!r.ok) {
        pushToast(r.error ?? '写入失败')
        return
      }
      pushToast(
        `已写入记忆：${r.factsWritten} 条新事实、${r.factsMerged} 条合并、${r.episodesWritten} 个情节`
      )
      setImportJob({ ...importJob, status: 'committed' })
    } catch (e) {
      pushToast(e instanceof Error ? e.message : String(e))
    } finally {
      setCommitBusy(false)
    }
  }

  const groupedFacts = useMemo(() => {
    if (!importJob) return new Map<string, ImportFactDraft[]>()
    const map = new Map<string, ImportFactDraft[]>()
    for (const f of importJob.facts) {
      const key = f.subcategory
      const arr = map.get(key) ?? []
      arr.push(f)
      map.set(key, arr)
    }
    return map
  }, [importJob])

  const copied = last?.copied ?? []

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface">
      <header className="border-b border-surface-inset bg-surface-raised px-6 py-4">
        <h1 className="text-base font-semibold text-ink">{t('import.import')}</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          支持 txt / md（模型抽取）与 json（结构化直导）。txt/md 会移入{' '}
          <code className="rounded bg-surface px-1">memory/imports/</code>{' '}
          后解析；json 按字段映射为事实/情节/时间锚点，确认后写入 SQLite 与 facts 库。
        </p>
      </header>
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 overflow-y-auto px-6 py-8">
        <button
          type="button"
          onClick={() => void pick()}
          className={[
            'flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-sm transition',
            drag
              ? 'border-accent bg-surface-raised'
              : 'border-surface-inset bg-surface-raised hover:border-accent/50',
          ].join(' ')}
        >
          <div className="text-center text-2xl text-ink-muted" aria-hidden>
            ↑
          </div>
          <div className="text-center text-ink">
            <div className="font-medium">选择 txt / md / json 文件</div>
            <div className="mt-1 text-xs text-ink-muted">
              json 推荐 schema <code className="rounded bg-surface px-1">ackem.memory.bundle</code>；也支持 facts
              数组或 facts.v2 片段。
            </div>
          </div>
        </button>

        {copied.length > 0 && (
          <div className="rounded-xl border border-surface-inset bg-surface-raised p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-medium text-ink">最近导入</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pathsForAction().length === 0}
                  onClick={() => void openConsent('memory', pathsForAction())}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[11px] text-white hover:bg-accent-hover disabled:opacity-40"
                >
                  解析为记忆
                </button>
                <button
                  type="button"
                  disabled={pathsForAction().length === 0}
                  onClick={() => void openConsent('infer', pathsForAction())}
                  className="rounded-lg border border-surface-inset px-3 py-1.5 text-[11px] hover:border-accent/40"
                >
                  推断主人画像
                </button>
              </div>
            </div>
            <ul className="mt-3 space-y-2 text-xs text-ink-muted">
              {copied.map((c) => (
                <li
                  key={c}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(c)}
                      onChange={() => toggleSelect(c)}
                    />
                    <span className="truncate font-mono">{c}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {importJob && importJob.status === 'ready' && (
          <div className="rounded-xl border border-accent/30 bg-surface-raised p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">记忆解析预览</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {importJob.stats.factsExtracted} 条事实 · {importJob.stats.episodesExtracted}{' '}
                  情节 · {importJob.stats.anchorsExtracted} 个日期锚点
                  {importJob.stats.factsMergedPreview > 0
                    ? ` · ${importJob.stats.factsMergedPreview} 条可能与已有记忆合并`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                disabled={commitBusy}
                onClick={() => void commitJob()}
                className="rounded-lg bg-accent px-4 py-2 text-xs text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {commitBusy ? '写入中…' : '确认写入记忆'}
              </button>
            </div>

            <div className="mt-4 max-h-[min(50vh,420px)] space-y-4 overflow-y-auto">
              {[...groupedFacts.entries()].map(([sub, facts]) => (
                <div key={sub}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    {SUBCATEGORY_LABEL[sub] ?? sub}
                  </p>
                  <ul className="space-y-2">
                    {facts.map((f) => (
                      <li
                        key={f.draftId}
                        className="rounded-lg border border-surface-inset bg-surface px-3 py-2 text-xs"
                      >
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={!disabledDrafts.has(f.draftId)}
                            onChange={() => toggleDraft(f.draftId)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-ink">{f.subject}</span>
                            <span className="text-ink-muted"> — {f.summary}</span>
                            {f.mergeWithExistingId ? (
                              <span className="mt-1 block text-[10px] text-amber-600/90">
                                可能与已有记忆合并：{f.mergeWithSummary}
                              </span>
                            ) : null}
                            {f.sourceQuote ? (
                              <span className="mt-1 block text-[10px] text-ink-muted/80">
                                「{f.sourceQuote}」
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {importJob.episodes.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    情节事件
                  </p>
                  <ul className="space-y-2">
                    {importJob.episodes.map((ep) => (
                      <li
                        key={ep.draftId}
                        className="rounded-lg border border-surface-inset bg-surface px-3 py-2 text-xs text-ink"
                      >
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            checked={!disabledDrafts.has(ep.draftId)}
                            onChange={() => toggleDraft(ep.draftId)}
                          />
                          <span>{ep.summary}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {importJob?.status === 'committed' && (
          <p className="text-center text-sm text-ink-muted">本次导入已写入记忆系统。</p>
        )}
      </div>

      <InferenceConsentDialog
        open={consentOpen}
        estimate={estimate}
        loading={dialogLoading}
        onConfirm={() => void confirmConsent()}
        onCancel={() => {
          if (!dialogLoading) setConsentOpen(false)
        }}
      />
    </div>
  )
}
