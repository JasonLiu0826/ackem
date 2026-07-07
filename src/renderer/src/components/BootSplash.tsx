import { useEffect, useRef, useState } from 'react'
import { AIVatar } from './AIVatar'
import {
  BOOT_SPLASH_READY_EVENT,
  BOOT_SPLASH_STATUS_EVENT,
  bootSplashEaseOut,
  dismissBootSplash,
  isBootRootPainted,
  pickBootSplashMinDurationMs
} from '../lib/bootSplash'
import { BOOT_CONNECTING_EN, BOOT_CONNECTING_ZH } from '../lib/rendererBoot'

function initialStatus(): string {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')) {
    return BOOT_CONNECTING_EN
  }
  return BOOT_CONNECTING_ZH
}

/** 寮€灞忥細鍑犱綍鍏夌悆 + 杩涘害鏉★紱寮哄埗 3锝?s 璺戞弧锛屼富鐣岄潰缁樺埗瀹屾垚鍚庡啀娣″嚭 */
export function BootSplash(): JSX.Element {
  const minDurationMs = useRef(pickBootSplashMinDurationMs())
  const progressRef = useRef(0)
  const appReadyRef = useRef(false)
  const dismissStartedRef = useRef(false)
  const [status, setStatus] = useState(initialStatus)
  const [progress, setProgress] = useState(0)

  const tryDismiss = () => {
    if (dismissStartedRef.current) return
    if (!appReadyRef.current || progressRef.current < 100) return
    if (!isBootRootPainted()) {
      requestAnimationFrame(() => tryDismiss())
      return
    }
    dismissStartedRef.current = true
    window.setTimeout(() => dismissBootSplash(), 320)
  }

  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const duration = minDurationMs.current

    const tick = () => {
      const elapsed = performance.now() - start
      const t = Math.min(1, elapsed / duration)
      const next = bootSplashEaseOut(t) * 100
      progressRef.current = next
      setProgress(next)
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        progressRef.current = 100
        setProgress(100)
        tryDismiss()
      }
    }
    raf = requestAnimationFrame(tick)

    const onStatus = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      if (text) setStatus(text)
    }
    const onReady = () => {
      appReadyRef.current = true
      tryDismiss()
    }

    document.addEventListener(BOOT_SPLASH_STATUS_EVENT, onStatus)
    document.addEventListener(BOOT_SPLASH_READY_EVENT, onReady)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener(BOOT_SPLASH_STATUS_EVENT, onStatus)
      document.removeEventListener(BOOT_SPLASH_READY_EVENT, onReady)
    }
  }, [])

  const pct = Math.min(100, Math.round(progress))

  return (
    <div className="ackem-boot-splash-panel">
      <div className="ackem-boot-orb-host nav-companion-orb" aria-hidden>
        <AIVatar state="idle" size={120} glowCanvasScale={2.8} parallaxStrength={0} className="bg-transparent" />
      </div>
      <h1 className="ackem-boot-title">Ackem</h1>
      <div className="ackem-boot-progress-wrap">
        <div
          className="trust-glow-bar ackem-boot-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={status}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="ackem-boot-status" data-ackem-boot-status>
          {status}
          <span className="ackem-boot-pct">{pct}%</span>
        </p>
      </div>
    </div>
  )
}
