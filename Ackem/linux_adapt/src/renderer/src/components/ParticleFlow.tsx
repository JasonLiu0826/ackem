import { useEffect, useRef } from 'react'
import { t } from '../lib/i18n'

type Props = {
  aro?: number
  className?: string
}

/** 琥珀光微粒上升（≤40 个） */
export function ParticleFlow({ aro = 0, className = '' }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const particles = Array.from({ length: 32 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: 1 + Math.random() * 2,
      speed: 0.00015 + Math.random() * 0.00025,
      opacity: 0.02 + Math.random() * 0.04
    }))

    const speedMul = 1 + (Math.max(0, aro) / 100) * 0.5

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.y -= p.speed * speedMul
        if (p.y < 0) {
          p.y = 1
          p.x = Math.random()
        }
        const x = p.x * w
        const y = p.y * h
        ctx.beginPath()
        ctx.arc(x, y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(196, 168, 112, ${p.opacity})`
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      canvas.width = parent.clientWidth
      canvas.height = parent.clientHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement ?? canvas)
    draw()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [aro])

  return (
    <canvas
      ref={canvasRef}
      className={['pointer-events-none absolute inset-0 z-0', className].filter(Boolean).join(' ')}
      aria-hidden
    />
  )
}
