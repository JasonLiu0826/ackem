import { useState } from 'react'

type Props = {
  imagePath?: string
  imageUrl?: string
  prompt?: string
  revisedPrompt?: string
  loading?: boolean
  error?: string
  className?: string
}

export function ImageCard({ imagePath, imageUrl, prompt, revisedPrompt, loading, error, className }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)

  const src = imageUrl || (imagePath ? `file:///${imagePath.replace(/\\/g, '/')}` : undefined)

  if (loading) {
    return (
      <div className={['image-card image-card--loading rounded-2xl border border-surface-inset/60 bg-surface-inset/20 p-4', className].filter(Boolean).join(' ')}>
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="text-sm text-ink-muted">🎨 正在生成图片…</span>
        </div>
        {prompt && (
          <p className="mt-2 text-xs text-ink-muted/70 truncate">提示词：{prompt}</p>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className={['image-card image-card--error rounded-2xl border border-danger/30 bg-danger/5 p-4', className].filter(Boolean).join(' ')}>
        <div className="flex items-center gap-2">
          <span className="text-base">⚠️</span>
          <span className="text-sm text-danger">图片生成失败</span>
        </div>
        <p className="mt-1 text-xs text-ink-muted">{error}</p>
        {prompt && (
          <p className="mt-1 text-xs text-ink-muted/70 truncate">提示词：{prompt}</p>
        )}
      </div>
    )
  }

  if (!src) {
    return <></>
  }

  return (
    <div className={['image-card rounded-2xl border border-surface-inset/60 overflow-hidden bg-surface-inset/10', className].filter(Boolean).join(' ')}>
      <div
        className={['relative cursor-pointer overflow-hidden', expanded ? '' : 'max-h-[400px]'].join(' ')}
        onClick={() => setExpanded(!expanded)}
      >
        {imgError ? (
          <div className="flex h-48 items-center justify-center text-sm text-ink-muted">
            图片加载失败
          </div>
        ) : (
          <img
            src={src}
            alt={prompt || 'AI 生成图片'}
            className="w-full object-contain"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        )}
        {!expanded && !imgError && (
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface/80 to-transparent" />
        )}
      </div>

      {(prompt || revisedPrompt) && (
        <div className="px-3.5 py-2.5 border-t border-surface-inset/40">
          {prompt && (
            <p className="text-xs text-ink-muted">
              <span className="font-medium text-ink-muted/80">提示词：</span>{prompt}
            </p>
          )}
          {revisedPrompt && revisedPrompt !== prompt && (
            <p className="text-[11px] text-ink-muted/60 mt-0.5 line-clamp-2">
              <span className="font-medium">优化后：</span>{revisedPrompt}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between px-3.5 py-2 border-t border-surface-inset/30">
        <span className="text-[10px] text-ink-muted/50">Agnes Image</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-ink-muted/60 hover:text-ink-muted transition-colors"
          >
            {expanded ? '收起' : '展开'}
          </button>
          {src && (
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-ink-muted/60 hover:text-ink-muted transition-colors"
            >
              原图
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
