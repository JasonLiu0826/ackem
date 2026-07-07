const SPLASH_ID = 'Ackem-boot-splash'

export const BOOT_SPLASH_STATUS_EVENT = 'Ackem-boot-status'
export const BOOT_SPLASH_PROGRESS_EVENT = 'Ackem-boot-progress'
export const BOOT_SPLASH_READY_EVENT = 'Ackem-boot-ready'

const BOOT_SPLASH_MIN_MS = 3000
const BOOT_SPLASH_MAX_MS = 5000

/** 寮€灞忔渶鐭睍绀烘椂闀匡紙鍚繘搴︽潯璺戞弧锛夛紝闅忔満 3锝? 绉?*/
export function pickBootSplashMinDurationMs(rng: () => number = Math.random): number {
  const span = BOOT_SPLASH_MAX_MS - BOOT_SPLASH_MIN_MS + 1
  return Math.min(BOOT_SPLASH_MAX_MS, BOOT_SPLASH_MIN_MS + Math.floor(rng() * span))
}

export function markBootSplashBooting(): void {
  document.documentElement.classList.add('Ackem-booting')
}

export function markBootSplashAppReady(): void {
  document.documentElement.classList.remove('Ackem-booting')
}

/** 涓荤晫闈?React 鏍戝凡鎸傚埌 #root锛堝紑灞忔贰鍑哄墠蹇呴』婊¤冻锛?*/
export function isBootRootPainted(): boolean {
  const root = document.getElementById('root')
  return !!root && root.childElementCount > 0
}

export function dismissBootSplash(): void {
  const el = document.getElementById(SPLASH_ID)
  if (!el || el.classList.contains('Ackem-boot-splash--out')) return
  markBootSplashAppReady()
  el.classList.add('Ackem-boot-splash--out')
  el.setAttribute('aria-busy', 'false')
  window.setTimeout(() => el.remove(), 480)
}

export function setBootSplashStatus(text: string): void {
  document.dispatchEvent(new CustomEvent(BOOT_SPLASH_STATUS_EVENT, { detail: text }))
}

/** 鍏煎鏃ц皟鐢紱寮€灞忚繘搴︾敱 BootSplash 鎸夋渶鐭椂闀块┍鍔紝澶栭儴杩涘害浠呬綔涓嬮檺鎻愮ず */
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
