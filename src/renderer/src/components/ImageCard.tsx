import { useState } from 'react'

type Props = {
  /** 鏈湴鍥剧墖璺緞锛坒ile:// 鍗忚锛?*/
  imagePath?: string
  /** 杩滅▼鍥剧墖 URL */
  imageUrl?: string
  /** 鐢熸垚鏃朵娇鐢ㄧ殑鎻愮ず璇?*/
  prompt?: string
  /** Agnes 淇鍚庣殑鎻愮ず璇?*/
  revisedPrompt?: string
  /** 鏄惁姝ｅ湪鐢熸垚涓?*/
  loading?: boolean
  /** 閿欒淇℃伅 */
  error?: string
  className?: string
}

export function ImageCard({ imagePath, imageUrl, prompt, revisedPrompt, loading, error, className }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)

  // 鏀寔 Ackem-img:// 鍗忚锛堟湰鍦帮級鍜?http(s):// 杩滅▼ URL
  const src = imageUrl || (imagePath ? `file:///${imagePath.replace(/\\/g, '/')}` : undefined)

  if (loading) {
    return (
      <div className={['image-card image-card--loading rounded-2xl border border-surface-inset/60 bg-surface-inset/20 p-4', className].filter(Boolean).join(' ')}>
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="text-sm text-ink-muted">馃帹 姝ｅ湪鐢熸垚鍥剧墖鈥?/span>
        </div>
        {prompt && (
          <p className="mt-2 text-xs text-ink-muted/70 truncate">鎻愮ず璇嶏細{prompt}</p>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className={['image-card image-card--error rounded-2xl border border-danger/30 bg-danger/5 p-4', className].filter(Boolean).join(' ')}>
        <div className="flex items-center gap-2">
          <span className="text-base">鈿狅笍</span>
          <span className="text-sm text-danger">鍥剧墖鐢熸垚澶辫触</span>
        </div>
        <p className="mt-1 text-xs text-ink-muted">{error}</p>
        {prompt && (
          <p className="mt-1 text-xs text-ink-muted/70 truncate">鎻愮ず璇嶏細{prompt}</p>
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
            鍥剧墖鍔犺浇澶辫触
          </div>
        ) : (
          <img
            src={src}
            alt={prompt || 'AI 鐢熸垚鍥剧墖'}
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
              <span className="font-medium text-ink-muted/80">鎻愮ず璇嶏細</span>{prompt}
            </p>
          )}
          {revisedPrompt && revisedPrompt !== prompt && (
            <p className="text-[11px] text-ink-muted/60 mt-0.5 line-clamp-2">
              <span className="font-medium">浼樺寲鍚庯細</span>{revisedPrompt}
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
            {expanded ? '鏀惰捣' : '灞曞紑'}
          </button>
          {src && (
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-ink-muted/60 hover:text-ink-muted transition-colors"
            >
              鍘熷浘
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
