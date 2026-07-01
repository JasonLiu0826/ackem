const SPLASH_ID = 'ackem-boot-splash'

export const BOOT_SPLASH_STATUS_EVENT = 'ackem-boot-status'
export const BOOT_SPLASH_PROGRESS_EVENT = 'ackem-boot-progress'
export const BOOT_SPLASH_READY_EVENT = 'ackem-boot-ready'

const BOOT_SPLASH_MIN_MS = 3000
const BOOT_SPLASH_MAX_MS = 5000

/** 开屏最短展示时长（含进度条跑满），随机 3～5 秒 */
export function pickBootSplashMinDurationMs(rng: () => number = Math.random): number {
  const span = BOOT_SPLASH_MAX_MS - BOOT_SPLASH_MIN_MS + 1
  return Math.min(BOOT_SPLASH_MAX_MS, BOOT_SPLASH_MIN_MS + Math.floor(rng() * span))
}

export function markBootSplashBooting(): void {
  document.documentElement.classList.add('ackem-booting')
}

export function markBootSplashAppReady(): void {
  document.documentElement.classList.remove('ackem-booting')
}

/** 主界面 React 树已挂到 #root（开屏淡出前必须满足） */
export function isBootRootPainted(): boolean {
  const root = document.getElementById('root')
  return !!root && root.childElementCount > 0
}

export function dismissBootSplash(): void {
  const el = document.getElementById(SPLASH_ID)
  if (!el || el.classList.contains('ackem-boot-splash--out')) return
  markBootSplashAppReady()
  el.classList.add('ackem-boot-splash--out')
  el.setAttribute('aria-busy', 'false')
  window.setTimeout(() => el.remove(), 480)
}

export function setBootSplashStatus(text: string): void {
  document.dispatchEvent(new CustomEvent(BOOT_SPLASH_STATUS_EVENT, { detail: text }))
}

/** 兼容旧调用；开屏进度由 BootSplash 按最短时长驱动，外部进度仅作下限提示 */
export function setBootSplashProgress(pct: number): void {
  const n = Math.min(100, Math.max(0, pct))
  document.dispatchEvent(new CustomEvent(BOOT_SPLASH_PROGRESS_EVENT, { detail: n }))
}

export function signalBootSplashReady(): void {
  document.dispatchEvent(new CustomEvent(BOOT_SPLASH_READY_EVENT))
}

export function bootSplashEaseOut(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return 1 - Math.pow(1 - x, 2.35)
}
