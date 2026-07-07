/**
 * FIX-036 鈥?妫€娴嬫槸鍚﹀湪娴忚鍣ㄧ洿寮€ Vite锛堟棤 Electron preload锛?
 */
export function isAckemPreloadAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.Ackem !== 'undefined'
}

export function formatMissingPreloadError(): string {
  const en =
    'window.Ackem is missing. If you opened http://localhost:5173 in a browser, close it and start Electron instead (npm run dev or 涓€閿惎鍔?bat). In Electron, check preload errors in DevTools.'
  const zh =
    '鏈娴嬪埌 window.Ackem銆傝嫢鍦ㄦ祻瑙堝櫒鎵撳紑 http://localhost:5173 浼氬嚭鐜版鎯呭喌锛岃鍏抽棴娴忚鍣ㄥ苟鐢?npm run dev / 涓€閿惎鍔?bat 鍚姩 Electron锛涜嫢鍦?Electron 鍐呬粛濡傛锛岃妫€鏌?preload 鏄惁鎶ラ敊銆?
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')) {
    return en
  }
  return zh
}

export const BOOT_CONNECTING_ZH = '姝ｅ湪杩炴帴涓昏繘绋嬧€?
export const BOOT_CONNECTING_EN = 'Connecting to main process鈥?

export function formatBootConnectingMessage(): string {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')) {
    return BOOT_CONNECTING_EN
  }
  return BOOT_CONNECTING_ZH
}
