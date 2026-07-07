import { useEffect, useRef } from 'react'

type Props = {
  active: boolean
  aff?: number
  aro?: number
  className?: string
}

/**
 * 鍓ч櫌妯″紡鍏ㄥ睆澹版氮鍛煎惛鍏夋檿 鈥?Ackem 璇磋瘽鏃剁獥鍙ｈ竟缂樺彂鍏夎剦鍔?
 * 3 灞傛寮︽尝鍙犲姞妯℃嫙澹版氮锛岄鑹茶窡闅忔儏缁紙aff/aro锛?
 */
export function SoundWaveOverlay({ active, aff = 50, aro = 0, className = '' }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({ active, aff, aro })
  stateRef.current = { active, aff, aro }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let opacity = 0
    const FADE_IN = 1 / 0.5   // 500ms
    const FADE_OUT = 1 / 0.8   // 800ms

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement ?? canvas)

    let lastTs = performance.now()

    const draw = () => {
      const now = performance.now()
      const dt = Math.min((now - lastTs) / 1000, 0.05)
      lastTs = now
      const { active: isActive, aff: a, aro: ar } = stateRef.current

      // fade in/out
      if (isActive) {
        opacity = Math.min(1, opacity + FADE_IN * dt)
      } else {
        opacity = Math.max(0, opacity - FADE_OUT * dt)
      }

      if (opacity <= 0.001) {
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
        raf = requestAnimationFrame(draw)
        return
      }

      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)

      const t = now / 1000

      // 3 灞傛寮︽尝鍙犲姞
      const wave1 = Math.sin(t * 1.2) * 0.6
      const wave2 = Math.sin(t * 3.5 + 0.8) * 0.25
      const wave3 = Math.sin(t * 7.1 + 2.1) * 0.15
      const composite = (wave1 + wave2 + wave3 + 1) / 2  // 0-1

      // 鎯呯华鈫掗鑹诧細aff 楂樷啋鏆栬壊锛宎ff 浣?aro 楂樷啋鍐疯壊
      const warmFactor = Math.max(0, Math.min(1, a / 100))
      const coldFactor = Math.max(0, Math.min(1, ar / 100))
      const r = Math.round(251 * warmFactor + 34 * (1 - warmFactor))
      const g = Math.round(146 * warmFactor + 211 * (1 - warmFactor))
      const b = Math.round(60 * warmFactor + 238 * (1 - warmFactor))
      // aro 楂樻椂鍋忓喎
      const rFinal = Math.round(r * (1 - coldFactor * 0.3) + 34 * coldFactor * 0.3)
      const gFinal = Math.round(g * (1 - coldFactor * 0.3) + 211 * coldFactor * 0.3)
      const bFinal = Math.round(b * (1 - coldFactor * 0.3) + 238 * coldFactor * 0.3)

      const baseAlpha = opacity * composite * 0.35

      // 4 灞傝竟缂樺厜鏅曪紝浠庡鍒板唴
      const edgeSize = Math.min(w, h) * 0.18
      const layers = [
        { spread: 1.0, alpha: baseAlpha * 0.4, blur: 40 },
        { spread: 0.82, alpha: baseAlpha * 0.6, blur: 28 },
        { spread: 0.65, alpha: baseAlpha * 0.8, blur: 18 },
        { spread: 0.48, alpha: baseAlpha * 1.0, blur: 10 }
      ]

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'

      for (const layer of layers) {
        const inset = edgeSize * layer.spread
        const grd = ctx.createRadialGradient(
          w / 2, h / 2, Math.max(w, h) * 0.35,
          w / 2, h / 2, Math.max(w, h) * 0.58
        )
        grd.addColorStop(0, 'rgba(0,0,0,0)')
        grd.addColorStop(0.6, `rgba(${rFinal},${gFinal},${bFinal},${layer.alpha * 0.3})`)
        grd.addColorStop(1, `rgba(${rFinal},${gFinal},${bFinal},${layer.alpha})`)

        ctx.filter = `blur(${layer.blur}px)`
        ctx.fillStyle = grd
        ctx.fillRect(inset, inset, w - inset * 2, h - inset * 2)
      }

      // 棰濆锛氬洓瑙掑姞寮哄厜鏅?
      const cornerAlpha = baseAlpha * 0.5
      const cornerSize = edgeSize * 1.2
      ctx.filter = 'blur(32px)'
      const corners = [
        [0, 0], [w, 0], [0, h], [w, h]
      ]
      for (const [cx, cy] of corners) {
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cornerSize)
        cg.addColorStop(0, `rgba(${rFinal},${gFinal},${bFinal},${cornerAlpha})`)
        cg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = cg
        ctx.fillRect(cx - cornerSize, cy - cornerSize, cornerSize * 2, cornerSize * 2)
      }

      ctx.filter = 'none'
      ctx.restore()

      raf = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={['pointer-events-none absolute inset-0 z-[5]', className].filter(Boolean).join(' ')}
      aria-hidden
    />
  )
}
