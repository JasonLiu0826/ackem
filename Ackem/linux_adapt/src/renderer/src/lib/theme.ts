export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'ackem-ui-theme'

export function getStoredTheme(): ThemeMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return null
}

export function resolveInitialTheme(): ThemeMode {
  const stored = getStoredTheme()
  if (stored) return stored
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

export function applyTheme(mode: ThemeMode, options?: { broadcast?: boolean }): void {
  const root = document.documentElement
  root.classList.toggle('theme-dark', mode === 'dark')
  root.dataset.theme = mode
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
  if (options?.broadcast === false) return
  if (typeof window !== 'undefined' && window.ackem?.ui?.setTheme) {
    void window.ackem.ui.setTheme(mode)
  }
}

export function toggleTheme(current: ThemeMode): ThemeMode {
  const next = current === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}

/** 主进程为权威来源，同步桌宠与主面板（localStorage 不跨 pet.html / index.html 共享） */
export function initThemeSync(): void {
  if (typeof window === 'undefined' || !window.ackem?.ui?.onThemeChanged) return

  window.ackem.ui.onThemeChanged((mode) => {
    applyTheme(mode, { broadcast: false })
  })

  void window.ackem.ui.getTheme().then((mode) => {
    applyTheme(mode, { broadcast: false })
  })
}
