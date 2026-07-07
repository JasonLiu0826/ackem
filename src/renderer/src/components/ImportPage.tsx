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
  BASIC_PROFILE: '鍩烘湰璧勬枡',
  LIFE_STORY: '浜虹敓缁忓巻',
  FAMILY: '瀹朵汉',
  FRIENDS: '鏈嬪弸',
  PARTNER: '鎰熸儏',
  TASTES: '鍠滃ソ',
  HEALTH: '鍋ュ悍',
  CAREER: '鑱屼笟',
  GOALS: '鐩爣',
  PLANS: '璁″垝',
  ROUTINES: '涔犳儻',
  VULNERABILITIES: '鑴嗗急鐐?,
  VALUES_BELIEFS: '浠峰€艰',
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
      const r = await window.Ackem.importFiles(paths)
      setLast(r)
      setSelected(new Set(r.copied))
      setImportJob(null)
      setDisabledDrafts(new Set())
      if (r.errors.length) pushToast(r.errors[0] ?? '瀵煎叆鍑洪敊')
      else pushToast(`宸插鍏?${r.copied.length} 涓枃浠禶)
      await window.Ackem.rebuildIndex()
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
      const paths = files.map((f) => window.Ackem.getPathForFile(f)).filter(Boolean)
      if (paths.length === 0) {
        pushToast('鏈В鏋愬埌鏈湴鏂囦欢璺緞锛岃浣跨敤銆岄€夋嫨鏂囦欢銆嶃€?)
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
    const r = await window.Ackem.selectFiles()
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
      pushToast('璇峰厛閫夋嫨鏂囦欢')
      return
    }
    try {
      const est = await window.Ackem.profileEstimateScan(paths)
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
        const r = await window.Ackem.profileInferFromFiles({
          relPaths: pendingPaths,
          consentAck: true,
          consentVersion: INFERENCE_CONSENT_VERSION,
        })
        if (!r.ok) {
          pushToast(r.error ?? '鎺ㄦ柇澶辫触')
          return
        }
        pushToast('涓讳汉鍏淮鎺ㄦ柇瀹屾垚锛屽彲鍦ㄨ缃腑鏌ョ湅浼翠荆 TISOR 寤鸿')
      } else if (consentMode === 'memory') {
        const r = await window.Ackem.importParseDocuments({
          relPaths: pendingPaths,
          consentAck: true,
          consentVersion: IMPORT_CONSENT_VERSION,
        })
        if (!r.ok) {
          pushToast(r.error ?? '瑙ｆ瀽澶辫触')
          return
        }
        setImportJob(r.job)
        setDisabledDrafts(new Set())
        const p = r.promoted?.length ? `锛屽凡绉诲叆 ${r.promoted.length} 涓枃浠跺埌 memory` : ''
        pushToast(
          `瑙ｆ瀽瀹屾垚锛?{r.job.stats.factsExtracted} 鏉′簨瀹炪€?{r.job.stats.episodesExtracted} 涓儏鑺?{p}${
            pathsForAction().some((x) => x.toLowerCase().endsWith('.json')) ? '锛圝SON 鐩村锛屾棤闇€妯″瀷锛? : ''
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
      const r = await window.Ackem.importCommitJob({
        jobId: importJob.id,
        disabledDraftIds: [...disabledDrafts],
      })
      if (!r.ok) {
        pushToast(r.error ?? '鍐欏叆澶辫触')
        return
      }
      pushToast(
        `宸插啓鍏ヨ蹇嗭細${r.factsWritten} 鏉℃柊浜嬪疄銆?{r.factsMerged} 鏉″悎骞躲€?{r.episodesWritten} 涓儏鑺俙
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
          鏀寔 txt / md锛堟ā鍨嬫娊鍙栵級涓?json锛堢粨鏋勫寲鐩村锛夈€倀xt/md 浼氱Щ鍏' '}
          <code className="rounded bg-surface px-1">memory/imports/</code>{' '}
          鍚庤В鏋愶紱json 鎸夊瓧娈垫槧灏勪负浜嬪疄/鎯呰妭/鏃堕棿閿氱偣锛岀‘璁ゅ悗鍐欏叆 SQLite 涓?facts 搴撱€?
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
            鈫?
          </div>
          <div className="text-center text-ink">
            <div className="font-medium">閫夋嫨 txt / md / json 鏂囦欢</div>
            <div className="mt-1 text-xs text-ink-muted">
              json 鎺ㄨ崘 schema <code className="rounded bg-surface px-1">Ackem.memory.bundle</code>锛涗篃鏀寔 facts
              鏁扮粍鎴?facts.v2 鐗囨銆?
            </div>
          </div>
        </button>

        {copied.length > 0 && (
          <div className="rounded-xl border border-surface-inset bg-surface-raised p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-medium text-ink">鏈€杩戝鍏?/div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pathsForAction().length === 0}
                  onClick={() => void openConsent('memory', pathsForAction())}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[11px] text-white hover:bg-accent-hover disabled:opacity-40"
                >
                  瑙ｆ瀽涓鸿蹇?
                </button>
                <button
                  type="button"
                  disabled={pathsForAction().length === 0}
                  onClick={() => void openConsent('infer', pathsForAction())}
                  className="rounded-lg border border-surface-inset px-3 py-1.5 text-[11px] hover:border-accent/40"
                >
                  鎺ㄦ柇涓讳汉鐢诲儚
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
                <p className="text-sm font-medium text-ink">璁板繂瑙ｆ瀽棰勮</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {importJob.stats.factsExtracted} 鏉′簨瀹?路 {importJob.stats.episodesExtracted}{' '}
                  鎯呰妭 路 {importJob.stats.anchorsExtracted} 涓棩鏈熼敋鐐?
                  {importJob.stats.factsMergedPreview > 0
                    ? ` 路 ${importJob.stats.factsMergedPreview} 鏉″彲鑳戒笌宸叉湁璁板繂鍚堝苟`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                disabled={commitBusy}
                onClick={() => void commitJob()}
                className="rounded-lg bg-accent px-4 py-2 text-xs text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {commitBusy ? '鍐欏叆涓€? : '纭鍐欏叆璁板繂'}
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
                            <span className="text-ink-muted"> 鈥?{f.summary}</span>
                            {f.mergeWithExistingId ? (
                              <span className="mt-1 block text-[10px] text-amber-600/90">
                                鍙兘涓庡凡鏈夎蹇嗗悎骞讹細{f.mergeWithSummary}
                              </span>
                            ) : null}
                            {f.sourceQuote ? (
                              <span className="mt-1 block text-[10px] text-ink-muted/80">
                                銆寋f.sourceQuote}銆?
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
                    鎯呰妭浜嬩欢
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
          <p className="text-center text-sm text-ink-muted">鏈瀵煎叆宸插啓鍏ヨ蹇嗙郴缁熴€?/p>
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
