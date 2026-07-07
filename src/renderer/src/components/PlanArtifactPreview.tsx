import { useCallback, useEffect, useMemo, useState } from 'react'
import { t } from '../lib/i18n'

type ArtifactTab = 'manifest.json' | 'skill.json' | 'plugin.meta.json'

type Props = {
  sessionId: string | null
  deployedExtensionId?: string
  canPreview: boolean
  artifactKind: 'uskill' | 'uplugin' | 'undecided'
}

function tabsForKind(kind: 'uskill' | 'uplugin'): ArtifactTab[] {
  return kind === 'uplugin' ? ['manifest.json', 'plugin.meta.json'] : ['manifest.json', 'skill.json']
}

export function PlanArtifactPreview({
  sessionId,
  deployedExtensionId,
  canPreview,
  artifactKind
}: Props): JSX.Element | null {
  const tabOptions = useMemo(
    () => (artifactKind === 'undecided' ? [] : tabsForKind(artifactKind)),
    [artifactKind]
  )
  const [tab, setTab] = useState<ArtifactTab>('manifest.json')
  const [files, setFiles] = useState<Partial<Record<ArtifactTab, string>> | null>(null)
  const [source, setSource] = useState<'preview' | 'staging' | 'deployed' | null>(null)
  const [dirLabel, setDirLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (tabOptions.length && !tabOptions.includes(tab)) {
      setTab(tabOptions[0])
    }
  }, [tabOptions, tab])

  const load = useCallback(async () => {
    if (!canPreview || !sessionId || artifactKind === 'undecided') {
      setFiles(null)
      setSource(null)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      if (deployedExtensionId) {
        const r = await window.Ackem.openforu.readArtifact(deployedExtensionId)
        if (r.ok && r.files) {
          setFiles(r.files as Partial<Record<ArtifactTab, string>>)
          setSource('deployed')
          setDirLabel(r.dirRel ?? deployedExtensionId)
        } else {
          setError(r.error ?? '璇诲彇浜х墿澶辫触')
          setFiles(null)
        }
      } else {
        const r = await window.Ackem.openforu.previewArtifact(sessionId)
        if (r.ok && r.files) {
          setFiles(r.files as Partial<Record<ArtifactTab, string>>)
          setSource(r.source === 'staging' ? 'staging' : 'preview')
          setDirLabel(r.dirRel ?? r.extensionId ?? r.uskillId ?? '')
        } else {
          setError(r.error ?? '鏆傛棤娉曢瑙堬紙闇€鍏堝畬鍠勬柟妗堬級')
          setFiles(null)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [canPreview, sessionId, deployedExtensionId, artifactKind])

  useEffect(() => {
    void load()
  }, [load])

  if (artifactKind === 'undecided') return null
  if (!canPreview && !loading) return null

  const activeText = files?.[tab] ?? ''
  const emptyHint =
    artifactKind === 'uplugin'
      ? '瀹屽杽鏂规鍚庡彲棰勮 manifest / plugin.meta.json'
      : '瀹屽杽鏂规鍚庡彲棰勮 manifest / skill.json'

  return (
    <div className="plan-artifact-preview rounded-lg border border-surface-inset/40 bg-surface-inset/10 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-ink">浜х墿棰勮</p>
          {dirLabel ? (
            <p className="truncate font-mono text-[9px] text-ink-muted">{dirLabel}</p>
          ) : null}
        </div>
        {source ? (
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-medium ${
              source === 'deployed'
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-success'
                : source === 'staging'
                  ? 'border border-violet-500/30 bg-violet-500/10 text-violet-300'
                  : 'border border-accent/30 bg-accent/10 text-accent'
            }`}
          >
            {source === 'deployed'
              ? '宸查儴缃?
              : source === 'staging'
                ? 'staging'
                : '棰勮'}
          </span>
        ) : null}
      </div>

      <div className="mb-2 flex gap-1 rounded-lg border border-surface-inset/40 bg-surface/30 p-0.5">
        {tabOptions.map((id) => (
          <button
            key={id}
            type="button"
            className={`flex-1 rounded-md px-2 py-1 text-[10px] transition-colors ${
              tab === id
                ? 'bg-accent/15 font-medium text-accent'
                : 'text-ink-muted hover:text-ink'
            }`}
            onClick={() => setTab(id)}
          >
            {id}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-4 text-center text-[10px] text-ink-muted">{t("settings.loading")}</p>
      ) : error ? (
        <p className="rounded-md border border-amber-500/25 bg-amber-500/5 px-2 py-2 text-[10px] leading-relaxed text-ink-muted">
          {error}
        </p>
      ) : files ? (
        <pre className="plan-artifact-code max-h-44 overflow-auto rounded-md border border-surface-inset/50 bg-surface/40 p-2 font-mono text-[10px] leading-relaxed text-ink">
          {activeText}
        </pre>
      ) : (
        <p className="py-3 text-center text-[10px] text-ink-muted">{emptyHint}</p>
      )}
    </div>
  )
}
