/** 鐢佃剳鍔╂墜 IPC 鏄惁鍦?preload 涓彲鐢紙闇€閲嶅惎 Electron 鍚?preload 鎵嶄細鏇存柊锛?*/
export function isDesktopAgentApiAvailable(): boolean {
  return typeof window.Ackem?.desktopAgent?.sessionMode?.get === 'function'
}

export function desktopAgentApiMissingMessage(): string {
  return '鐢佃剳鍔╂墜鎺ュ彛鏈姞杞斤紝璇峰畬鍏ㄩ€€鍑?Ackem 鍚庨噸鏂拌繍琛?npm run dev锛坧reload 闇€閲嶆柊缂栬瘧锛夈€?
}
