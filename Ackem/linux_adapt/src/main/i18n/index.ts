// [i18n] — 国际化主入口
// 职责：维护当前 locale，提供 t() 翻译函数
// 零依赖，纯内存查表，<0.01ms

import type { Locale } from './types'
import { zhResources } from './zh'
import { enResources } from './en'
import {
  rendererI18nOverlayEn,
  rendererI18nOverlayZh
} from '../../shared/i18n/rendererOverlay'

const zhMerged = { ...zhResources, ...rendererI18nOverlayZh }
const enMerged = { ...enResources, ...rendererI18nOverlayEn }

let currentLocale: Locale = 'zh'

/** 初始化 locale（从用户设置读取） */
export function initLocale(locale: Locale): void {
  currentLocale = locale
}

/** 获取当前 locale */
export function getLocale(): Locale {
  return currentLocale
}

/**
 * 翻译函数
 * @param key 翻译 key（如 'holiday.元旦'）
 * @param params 可选插值参数（如 { n: 3 }）
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const resources = currentLocale === 'en' ? enMerged : zhMerged
  let value = resources[key]
  if (!value) {
    value = zhMerged[key] ?? key
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return value
}

export { zhMerged as zhResourcesForIpc, enMerged as enResourcesForIpc }
