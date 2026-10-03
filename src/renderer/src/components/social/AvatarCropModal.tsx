import { useCallback, useEffect, useRef, useState } from 'react'

export type AvatarCropResult = {
  croppedBytes: Uint8Array
  mime: 'image/webp' | 'image/png'
  sourceBytes: Uint8Array
  sourceMime: string
  crop: { x: number; y: number; width: number; height: number }
}

type Props = {
  open: boolean
  file: File | null
  onCancel: () => void
  onConfirm: (result: AvatarCropResult) => void
}

const OUT_SIZE = 512
const MIN_CROP = 64

export function AvatarCropModal({ open, file, onCancel, onConfirm }: Props): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const [busy, setBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const size = canvas.width
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = '#1a1625'
    ctx.fillRect(0, 0, size, size)
    const scale = zoom
    const iw = img.naturalWidth * scale
    const ih = img.naturalHeight * scale
    const cx = size / 2 + offset.x
    const cy = size / 2 + offset.y
    ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, size - 2, size - 2)
  }, [zoom, offset])

  useEffect(() => {
    if (!open || !file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const fit = Math.min(280 / img.naturalWidth, 280 / img.naturalHeight, 1)
      setZoom(Math.max(fit, MIN_CROP / Math.min(img.naturalWidth, img.naturalHeight)))
      setOffset({ x: 0, y: 0 })
      draw()
    }
    img.src = url
    return () => {
      URL.revokeObjectURL(url)
      imgRef.current = null
    }
  }, [open, file, draw])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null)
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const id = requestAnimationFrame(() => {
      setPreviewUrl(canvas.toDataURL('image/png'))
    })
    return () => cancelAnimationFrame(id)
  }, [open, zoom, offset, draw])

  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    setDragging(false)
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const handleConfirm = async () => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !file) return
    setBusy(true)
    try {
      const size = canvas.width
      const out = document.createElement('canvas')
      out.width = OUT_SIZE
      out.height = OUT_SIZE
      const ctx = out.getContext('2d')
      if (!ctx) return
      ctx.drawImage(canvas, 0, 0, size, size, 0, 0, OUT_SIZE, OUT_SIZE)
      const mime: 'image/webp' | 'image/png' =
        typeof out.toBlob !== 'undefined' ? 'image/webp' : 'image/png'
      const blob: Blob = await new Promise((resolve, reject) => {
        out.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('导出失败'))),
          mime === 'image/webp' ? 'image/webp' : 'image/png',
          0.92
        )
      })
      const croppedBytes = new Uint8Array(await blob.arrayBuffer())
      const sourceBytes = new Uint8Array(await file.arrayBuffer())
      const scale = zoom
      const iw = img.naturalWidth * scale
      const ih = img.naturalHeight * scale
      const cx = size / 2 + offset.x
      const cy = size / 2 + offset.y
      const sx = Math.max(0, (cx - iw / 2) * (img.naturalWidth / iw))
      const sy = Math.max(0, (cy - ih / 2) * (img.naturalHeight / ih))
      const side = Math.min(
        img.naturalWidth,
        img.naturalHeight,
        Math.max(MIN_CROP, size * (img.naturalWidth / iw))
      )
      onConfirm({
        croppedBytes,
        mime: blob.type === 'image/png' ? 'image/png' : 'image/webp',
        sourceBytes,
        sourceMime: file.type || 'image/png',
        crop: { x: Math.round(sx), y: Math.round(sy), width: Math.round(side), height: Math.round(side) },
      })
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-panel w-full max-w-lg rounded-2xl p-5 shadow-xl">
        <h3 className="mb-1 text-base font-semibold text-ink">裁剪头像</h3>
        <p className="mb-4 text-xs text-ink-muted">拖动调整位置，滚轮或滑块缩放。导出 512×512，圆形预览。</p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={280}
              height={280}
              className="cursor-grab rounded-xl border border-surface-inset active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
          </div>
          <div className="flex flex-col items-center gap-2">
            <div
              className="h-24 w-24 overflow-hidden rounded-full border-2 border-accent/40 bg-surface-inset shadow-inner"
              style={
                previewUrl
                  ? { backgroundImage: `url(${previewUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : undefined
              }
            />
            <span className="text-[10px] text-ink-muted">圆形预览</span>
          </div>
        </div>
        <label className="mt-4 flex items-center gap-3 text-xs text-ink-muted">
          缩放
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </label>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-surface-inset px-4 py-2.5 text-sm text-ink-muted hover:bg-surface-raised"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy || !file}
            onClick={() => void handleConfirm()}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? '处理中…' : '确认'}
          </button>
        </div>
      </div>
    </div>
  )
}
