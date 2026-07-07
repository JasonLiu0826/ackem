// [renderer/i18n] 鈥?娓叉煋杩涚▼ i18n 宸ュ叿
// IPC + 鏈湴缂撳瓨锛氬惎鍔ㄦ椂涓€娆℃€ф媺鍙栫炕璇?Map锛屼箣鍚庣函鍐呭瓨鏌ヨ〃

import {
  rendererI18nOverlayEn,
  rendererI18nOverlayZh
} from '../../../shared/i18n/rendererOverlay'

type I18nResources = { zh: Record<string, string>; en: Record<string, string>; locale: string }

let resources: I18nResources | null = null
let currentLocale: string = 'zh'
let initPromise: Promise<void> | null = null
let i18nVersion = 0
const i18nListeners = new Set<() => void>()

function bumpI18nVersion(): void {
  i18nVersion += 1
  for (const fn of i18nListeners) fn()
}

/** 璁㈤槄 i18n 璧勬簮鏇存柊锛坧reload / refresh 瀹屾垚鍚庤Е鍙戦噸娓叉煋锛?*/
export function subscribeI18n(onStoreChange: () => void): () => void {
  i18nListeners.add(onStoreChange)
  return () => i18nListeners.delete(onStoreChange)
}

export function getI18nVersion(): number {
  return i18nVersion
}

/** 鍚姩鏃惰皟鐢ㄤ竴娆★紝鎷夊彇鍏ㄩ儴缈昏瘧璧勬簮 */
export async function preloadI18n(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      const res = await window.Ackem.i18n.getAllResources()
      resources = res
      currentLocale = res.locale
      bumpI18nVersion()
    } catch {
      // 鎷夊彇澶辫触鏃剁敤绌鸿祫婧愶紝t() 浼氬洖閫€鍒?key 鏈韩
      resources = { zh: {}, en: {}, locale: 'zh' }
      currentLocale = 'zh'
      bumpI18nVersion()
    }
  })()
  return initPromise
}

/** 鑾峰彇褰撳墠 locale */
export function getLocale(): string {
  return currentLocale
}

/** 鍒囨崲 locale锛堝悓姝ユ洿鏂版湰鍦扮紦瀛橈級 */
export async function setLocale(locale: string): Promise<void> {
  await window.Ackem.i18n.setLocale(locale)
  currentLocale = locale
}

/** 缈昏瘧鍑芥暟 */
export function t(key: string, params?: Record<string, string | number>): string {
  const overlay = currentLocale === 'en' ? rendererI18nOverlayEn : rendererI18nOverlayZh
  if (!resources) {
    return overlay[key as keyof typeof overlay] ?? key
  }
  const map = currentLocale === 'en' ? resources.en : resources.zh
  let value = map[key] ?? overlay[key as keyof typeof overlay]
  if (!value) {
    value =
      resources.zh[key] ??
      rendererI18nOverlayZh[key as keyof typeof rendererI18nOverlayZh] ??
      key
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return value
}

/** 鍒锋柊缂撳瓨锛堣瑷€鍒囨崲鍚庤皟鐢級 */
export async function refreshI18n(): Promise<void> {
  try {
    const res = await window.Ackem.i18n.getAllResources()
    resources = res
    currentLocale = res.locale
    bumpI18nVersion()
  } catch { /* ignore */ }
}
