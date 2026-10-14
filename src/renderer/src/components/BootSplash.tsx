import { useEffect, useRef, useState } from 'react'
import { AIVatar } from './AIVatar'
import {
  BOOT_SPLASH_STEPS_EVENT,
  BOOT_SPLASH_READY_EVENT,
  BOOT_SPLASH_STATUS_EVENT,
  dismissBootSplash,
  isBootRootPainted,
} from '../lib/bootSplash'
import { BOOT_CONNECTING_EN, BOOT_CONNECTING_ZH } from '../lib/rendererBoot'

export type BootStep = { label: string; done: boolean }

function initialStatus(): string {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')) {
    return BOOT_CONNECTING_EN
  }
  return BOOT_CONNECTING_ZH
}

/** 每步最少展示时长 (ms) — 动画节奏控制，即使初始化瞬间完成也不跳步。 */
const STEP_REVEAL_MS = 480
/** 步骤间间隔 (ms) — 前一步打勾到下一步出现之间。 */
const STEP_GAP_MS = 180

/**
 * 开屏：真实初始化步骤 + 逐条动画放行。
 *
 * 后端可能瞬间完成全部初始化，但前端劫持显示节奏：
 * 步骤逐个出现（fade+scale 入场），每步最少展示 STEP_REVEAL_MS，
 * 进度条跟随可见步数步进（非平滑插值）。
 * 放行条件 = 全部步骤已动画展示 ∧ 全部步骤真实 done ∧ app ready。
 */
export function BootSplash(): JSX.Element {
  const appReadyRef = useRef(false)
  const dismissStartedRef = useRef(false)
  const [status, setStatus] = useState(initialStatus)
  const [steps, setSteps] = useState<BootStep[]>([])
  const [visibleCount, setVisibleCount] = useState(0)

  const allRevealed = steps.length > 0 && visibleCount >= steps.length
  const allDone = allRevealed && steps.every((s) => s.done)
  const pct = steps.length > 0 ? Math.round((visibleCount / steps.length) * 100) : 0

  const tryDismiss = () => {
    if (dismissStartedRef.current) return
    if (!allRevealed || !allDone) return
    if (!appReadyRef.current) return
    if (!isBootRootPainted()) {
      requestAnimationFrame(() => tryDismiss())
      return
    }
    dismissStartedRef.current = true
    window.setTimeout(() => dismissBootSplash(), 320)
  }

  useEffect(() => { tryDismiss() })

  // ── 接收内核步骤数据（boot:step 事件或 boot:get-steps 初始查询）──
  useEffect(() => {
    const onSteps = (e: Event) => {
      const detail = (e as CustomEvent<{ steps: BootStep[] }>).detail
      if (detail?.steps && detail.steps.length > 0) {
        setSteps((prev) => (prev.length >= detail.steps.length ? prev : detail.steps))
      }
    }
    document.addEventListener(BOOT_SPLASH_STEPS_EVENT, onSteps)
    return () => document.removeEventListener(BOOT_SPLASH_STEPS_EVENT, onSteps)
  }, [])

  // ── 逐条动画放行：每 STEP_REVEAL_MS + STEP_GAP_MS 显示下一步 ──
  useEffect(() => {
    if (steps.length === 0 || visibleCount >= steps.length) return
    const timer = setTimeout(() => {
      setVisibleCount((v) => Math.min(v + 1, steps.length))
    }, STEP_REVEAL_MS + STEP_GAP_MS)
    return () => clearTimeout(timer)
  }, [visibleCount, steps.length])

  // ── 全部展示 ∧ 全部真实 done → 100% → dismiss ──
  useEffect(() => {
    if (allRevealed && allDone) {
      tryDismiss()
    }
  }, [allRevealed, allDone])

  // ── 监听主进程信号 ──
  useEffect(() => {
    const onStatus = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      if (text) setStatus(text)
    }
    const onReady = () => {
      appReadyRef.current = true
    }
    const onSteps = (e: Event) => {
      const detail = (e as CustomEvent<{ steps: BootStep[] }>).detail
      if (detail?.steps && detail.steps.length > 0) {
        setSteps((prev) => (prev.length >= detail.steps.length ? prev : detail.steps))
      }
    }
    document.addEventListener(BOOT_SPLASH_STATUS_EVENT, onStatus)
    document.addEventListener(BOOT_SPLASH_READY_EVENT, onReady)
    document.addEventListener(BOOT_SPLASH_STEPS_EVENT, onSteps)
    return () => {
      document.removeEventListener(BOOT_SPLASH_STATUS_EVENT, onStatus)
      document.removeEventListener(BOOT_SPLASH_READY_EVENT, onReady)
      document.removeEventListener(BOOT_SPLASH_STEPS_EVENT, onSteps)
    }
  }, [])

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
          <span style={{ width: `${pct}%`, transition: 'width 300ms ease-out' }} />
        </div>
        <p className="ackem-boot-status" data-ackem-boot-status>
          {status}
          <span className="ackem-boot-pct">{pct}%</span>
        </p>
      </div>
      {steps.length > 0 && (
        <div className="mt-4 w-72 space-y-1.5" data-testid="boot-steps">
          {steps.slice(0, visibleCount).map((s, i) => (
            <div
              key={s.label}
              className="flex items-center gap-2 text-[11px] opacity-0 animate-[boot-step-in_280ms_ease-out_forwards]"
              style={{ animationDelay: `${i * 40}ms` }}
              data-testid={`boot-step-${i}`}
            >
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                  s.done
                    ? 'bg-emerald-600/80 text-white'
                    : 'border border-ink-muted/40 text-ink-muted/50'
                }`}
              >
                {s.done ? '✓' : ''}
              </span>
              <span className={s.done ? 'text-ink-muted' : 'text-ink-muted/50'}>
                {s.label}
              </span>
            </div>
          ))}
          {visibleCount < steps.length && (
            <div className="flex items-center gap-2 text-[11px] text-ink-muted/30">
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-ink-muted/20" />
              <span className="animate-pulse">···</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
