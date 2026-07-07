export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'Ackem-ui-theme'

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
  if (typeof window !== 'undefined' && window.Ackem?.ui?.setTheme) {
    void window.Ackem.ui.setTheme(mode)
  }
}

export function toggleTheme(current: ThemeMode): ThemeMode {
  const next = current === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}

/** 涓昏繘绋嬩负鏉冨▉鏉ユ簮锛屽悓姝ユ瀹犱笌涓婚潰鏉匡紙localStorage 涓嶈法 pet.html / index.html 鍏变韩锛?*/
export function initThemeSync(): void {
  if (typeof window === 'undefined' || !window.Ackem?.ui?.onThemeChanged) return

  window.Ackem.ui.onThemeChanged((mode) => {
    applyTheme(mode, { broadcast: false })
  })

  void window.Ackem.ui.getTheme().then((mode) => {
    applyTheme(mode, { broadcast: false })
  })
}
