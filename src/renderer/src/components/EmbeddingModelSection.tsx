// [EmbeddingModelSection] 鈥?璁剧疆椤?Embedding 妯″瀷閫夋嫨鍣紙鍚笅杞借繘搴︼級

import { useState, useEffect, useCallback } from 'react'
import { SettingsStatusBadge } from './settings/settingsUi'

interface EmbeddingStatus {
  activeModel: string
  providerReady: boolean
  providerName: string
  providerDimension: number
  models: Array<{ id: string; extracted: boolean; active: boolean; bundled?: boolean; zipPresent?: boolean }>
  state: { activeModel: string; version: string; activatedAt: string; dimension: number; provider: string }
  bundledReady?: string[]
  bundledMissing?: string[]
  bundledZipPresent?: string[]
}

interface ModelInfo {
  id: string
  label: string
  desc: string
  dim: number
  speed: string
  memory: string
  size: string
  stars: number
}

const MODEL_CATALOG: ModelInfo[] = [
  { id: 'bge-small-zh', label: 'bge-small-zh锛堜腑鏂?路 棰勮锛?, desc: '瀹夎鍖呭唴缃紝棣栨鍚姩鑷姩瑙ｅ帇', dim: 512, speed: '<10ms', memory: '~150MB', size: '~90MB', stars: 4 },
  { id: 'bge-small-en', label: 'bge-small-en锛圗nglish 路 Bundled锛?, desc: 'Pre-installed; auto-extracts on first launch', dim: 512, speed: '<10ms', memory: '~150MB', size: '~130MB', stars: 4 }
]

function Stars({ count }: { count: number }): JSX.Element {
  return <span className="text-accent">{'鈽?.repeat(count)}{'鈽?.repeat(5 - count)}</span>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)}B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)}KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)}MB/s`
}

export function EmbeddingModelSection(): JSX.Element {
  const [status, setStatus] = useState<EmbeddingStatus | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ bytes: number; total: number; speed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await window.Ackem.embeddingStatus()
      setStatus(s as EmbeddingStatus)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // 鐩戝惉涓嬭浇杩涘害
  useEffect(() => {
    window.Ackem.onEmbeddingDownloadProgress((p) => {
      setProgress({ bytes: p.bytes, total: p.total, speed: p.speed })
    })
  }, [])

  const handleSwitch = async (modelId: string) => {
    if (modelId === status?.activeModel) return
    setError(null)

    const modelStatus = status?.models.find(ms => ms.id === modelId)
    const isExtracted = modelStatus?.extracted ?? false

    if (!isExtracted) {
      setDownloading(modelId)
      setProgress(null)
      try {
        const useBundled = modelStatus?.bundled ?? (modelId === 'bge-small-zh' || modelId === 'bge-small-en')
        const res = useBundled
          ? await window.Ackem.embeddingSwitch(modelId)
          : await window.Ackem.embeddingDownload(modelId)
        if (res.ok) {
          await refresh()
        } else {
          setError(res.error ?? (useBundled ? '棰勮妯″瀷瑙ｅ帇澶辫触' : '涓嬭浇澶辫触'))
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setDownloading(null)
        setProgress(null)
      }
    } else {
      // 宸蹭笅杞斤紝鐩存帴鍒囨崲
      setSwitching(modelId)
      try {
        const res = await window.Ackem.embeddingSwitch(modelId)
        if (res.ok) {
          await refresh()
        } else {
          setError(res.error ?? '鍒囨崲澶辫触')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setSwitching(null)
      }
    }
  }

  const handleCancel = async (modelId: string) => {
    try {
      await window.Ackem.embeddingDownloadCancel(modelId)
    } catch { /* ignore */ }
    setDownloading(null)
    setProgress(null)
  }

  const currentModel = MODEL_CATALOG.find(m => m.id === status?.activeModel)

  return (
    <div className="space-y-4">
      {/* 褰撳墠鐘舵€?*/}
      {status && currentModel && (
        <div className="rounded-lg border border-surface-inset bg-surface-raised p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-ink">褰撳墠锛歿currentModel.label}</span>
            <SettingsStatusBadge tone={status.providerReady ? 'ok' : 'warn'}>
              {status.providerReady ? '灏辩华' : '鏈氨缁?}
            </SettingsStatusBadge>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-muted">
            <div>涓枃鏁堟灉 <Stars count={currentModel.stars} /></div>
            <div>閫熷害 {currentModel.speed}</div>
            <div>缁村害 {status.providerDimension || currentModel.dim}</div>
            <div>鍐呭瓨 {currentModel.memory}</div>
          </div>
        </div>
      )}

      {/* 妯″瀷鍒楄〃 */}
      <div className="space-y-2">
        {MODEL_CATALOG.map((m) => {
          const isActive = m.id === status?.activeModel
          const isSwitching = switching === m.id
          const isDownloading = downloading === m.id
          const modelStatus = status?.models.find(ms => ms.id === m.id)
          const isExtracted = modelStatus?.extracted ?? false

          const percent = progress && progress.total > 0
            ? Math.min(100, Math.round((progress.bytes / progress.total) * 100))
            : 0

          return (
            <div
              key={m.id}
              className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
                isActive
                  ? 'border-accent/40 bg-accent/5'
                  : 'border-surface-inset bg-surface hover:border-surface-inset/80'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Radio indicator */}
                <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                  isActive ? 'border-accent bg-accent' : 'border-ink-muted/40'
                }`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{m.label}</span>
                    {isActive && (
                      <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">褰撳墠</span>
                    )}
                    {modelStatus?.bundled && (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">棰勮</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted mt-0.5">{m.desc}</p>
                  <div className="flex gap-3 mt-1 text-[11px] text-ink-muted">
                    <span>鏁堟灉 <Stars count={m.stars} /></span>
                    <span>閫熷害 {m.speed}</span>
                    <span>缁村害 {m.dim}</span>
                    <span>澶у皬 {m.size}</span>
                  </div>
                </div>

                {/* Action */}
                {!isActive && !isDownloading && (
                  <button
                    type="button"
                    disabled={isSwitching}
                    onClick={() => void handleSwitch(m.id)}
                    className="field-btn-secondary px-3 py-1.5 text-xs shrink-0 disabled:opacity-50"
                  >
                    {isSwitching ? '鍒囨崲涓€? : isExtracted ? '鍒囨崲' : modelStatus?.bundled ? '瑙ｅ帇骞跺垏鎹? : '涓嬭浇骞跺垏鎹?}
                  </button>
                )}
              </div>

              {/* 涓嬭浇杩涘害鏉?*/}
              {isDownloading && progress && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-surface-inset overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="text-xs text-ink-muted w-10 text-right">{percent}%</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-ink-muted">
                    <span>{formatBytes(progress.bytes)} / {formatBytes(progress.total)} 路 {formatSpeed(progress.speed)}</span>
                    <button
                      type="button"
                      onClick={() => void handleCancel(m.id)}
                      className="text-ink-muted hover:text-ink text-[11px]"
                    >
                      鍙栨秷
                    </button>
                  </div>
                </div>
              )}
              {isDownloading && !progress && (
                <div className="text-xs text-ink-muted">鍑嗗涓嬭浇鈥?/div>
              )}
            </div>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {status?.bundledMissing && status.bundledMissing.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          棰勮妯″瀷鏂囦欢缂哄け锛坽status.bundledMissing.join('銆?)}锛夈€傚紑鍙戠幆澧冭杩愯 <code className="font-mono">npm run prepare:embedding-models</code>锛涘彂琛岀増璇风‘璁ゅ畨瑁呭寘瀹屾暣銆?
        </div>
      )}

      {/* Hint */}
      <p className="text-[11px] text-ink-muted leading-relaxed">
        馃挕 Ackem 棰勮涓枃 bge-small-zh 涓庤嫳鏂?bge-small-en锛岄娆″惎鍔ㄨ嚜鍔ㄨВ鍘嬨€傚垏鎹㈣瑷€鏃朵細鑷姩閫夌敤瀵瑰簲妯″瀷锛涘垏鎹㈠悗寤鸿閲嶅惎 Ackem銆?
      </p>
    </div>
  )
}
