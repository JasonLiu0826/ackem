// [EmbeddingModelSection] — 设置页 Embedding 模型选择器（含下载进度）

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
  { id: 'bge-small-zh', label: 'bge-small-zh（中文 · 预装）', desc: '安装包内置，首次启动自动解压', dim: 512, speed: '<10ms', memory: '~150MB', size: '~90MB', stars: 4 },
  { id: 'bge-small-en', label: 'bge-small-en（English · Bundled）', desc: 'Pre-installed; auto-extracts on first launch', dim: 512, speed: '<10ms', memory: '~150MB', size: '~130MB', stars: 4 }
]

function Stars({ count }: { count: number }): JSX.Element {
  return <span className="text-accent">{'★'.repeat(count)}{'☆'.repeat(5 - count)}</span>
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
      const s = await window.ackem.embeddingStatus()
      setStatus(s as EmbeddingStatus)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // 监听下载进度
  useEffect(() => {
    window.ackem.onEmbeddingDownloadProgress((p) => {
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
          ? await window.ackem.embeddingSwitch(modelId)
          : await window.ackem.embeddingDownload(modelId)
        if (res.ok) {
          await refresh()
        } else {
          setError(res.error ?? (useBundled ? '预装模型解压失败' : '下载失败'))
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setDownloading(null)
        setProgress(null)
      }
    } else {
      // 已下载，直接切换
      setSwitching(modelId)
      try {
        const res = await window.ackem.embeddingSwitch(modelId)
        if (res.ok) {
          await refresh()
        } else {
          setError(res.error ?? '切换失败')
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
      await window.ackem.embeddingDownloadCancel(modelId)
    } catch { /* ignore */ }
    setDownloading(null)
    setProgress(null)
  }

  const currentModel = MODEL_CATALOG.find(m => m.id === status?.activeModel)

  return (
    <div className="space-y-4">
      {/* 当前状态 */}
      {status && currentModel && (
        <div className="rounded-lg border border-surface-inset bg-surface-raised p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-ink">当前：{currentModel.label}</span>
            <SettingsStatusBadge tone={status.providerReady ? 'ok' : 'warn'}>
              {status.providerReady ? '就绪' : '未就绪'}
            </SettingsStatusBadge>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-muted">
            <div>中文效果 <Stars count={currentModel.stars} /></div>
            <div>速度 {currentModel.speed}</div>
            <div>维度 {status.providerDimension || currentModel.dim}</div>
            <div>内存 {currentModel.memory}</div>
          </div>
        </div>
      )}

      {/* 模型列表 */}
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
                      <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">当前</span>
                    )}
                    {modelStatus?.bundled && (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">预装</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted mt-0.5">{m.desc}</p>
                  <div className="flex gap-3 mt-1 text-[11px] text-ink-muted">
                    <span>效果 <Stars count={m.stars} /></span>
                    <span>速度 {m.speed}</span>
                    <span>维度 {m.dim}</span>
                    <span>大小 {m.size}</span>
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
                    {isSwitching ? '切换中…' : isExtracted ? '切换' : modelStatus?.bundled ? '解压并切换' : '下载并切换'}
                  </button>
                )}
              </div>

              {/* 下载进度条 */}
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
                    <span>{formatBytes(progress.bytes)} / {formatBytes(progress.total)} · {formatSpeed(progress.speed)}</span>
                    <button
                      type="button"
                      onClick={() => void handleCancel(m.id)}
                      className="text-ink-muted hover:text-ink text-[11px]"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
              {isDownloading && !progress && (
                <div className="text-xs text-ink-muted">准备下载…</div>
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
          预装模型文件缺失（{status.bundledMissing.join('、')}）。开发环境请运行 <code className="font-mono">npm run prepare:embedding-models</code>；发行版请确认安装包完整。
        </div>
      )}

      {/* Hint */}
      <p className="text-[11px] text-ink-muted leading-relaxed">
        💡 Ackem 预装中文 bge-small-zh 与英文 bge-small-en，首次启动自动解压。切换语言时会自动选用对应模型；切换后建议重启 Ackem。
      </p>
    </div>
  )
}
