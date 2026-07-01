// [renderer/i18n] — 渲染进程 i18n 工具
// IPC + 本地缓存：启动时一次性拉取翻译 Map，之后纯内存查表

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

/** 订阅 i18n 资源更新（preload / refresh 完成后触发重渲染） */
export function subscribeI18n(onStoreChange: () => void): () => void {
  i18nListeners.add(onStoreChange)
  return () => i18nListeners.delete(onStoreChange)
}

export function getI18nVersion(): number {
  return i18nVersion
}

/** 启动时调用一次，拉取全部翻译资源 */
export async function preloadI18n(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      const res = await window.ackem.i18n.getAllResources()
      resources = res
      currentLocale = res.locale
      bumpI18nVersion()
    } catch {
      // 拉取失败时用空资源，t() 会回退到 key 本身
      resources = { zh: {}, en: {}, locale: 'zh' }
      currentLocale = 'zh'
      bumpI18nVersion()
    }
  })()
  return initPromise
}

/** 获取当前 locale */
export function getLocale(): string {
  return currentLocale
}

/** 切换 locale（同步更新本地缓存） */
export async function setLocale(locale: string): Promise<void> {
  await window.ackem.i18n.setLocale(locale)
  currentLocale = locale
}

/** 翻译函数 */
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

/** 刷新缓存（语言切换后调用） */
export async function refreshI18n(): Promise<void> {
  try {
    const res = await window.ackem.i18n.getAllResources()
    resources = res
    currentLocale = res.locale
    bumpI18nVersion()
  } catch { /* ignore */ }
}
