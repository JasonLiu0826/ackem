import { execSync } from 'node:child_process'

export type FocusDetectResult = boolean | null

export type FocusDetectFn = () => FocusDetectResult

let detectFn: FocusDetectFn = defaultWindowsFocusDetect

export function setFocusDetectFn(fn: FocusDetectFn): void {
  detectFn = fn
}

export function resetFocusDetectFn(): void {
  detectFn = defaultWindowsFocusDetect
}

function defaultWindowsFocusDetect(): FocusDetectResult {
  if (process.platform !== 'win32') return null
  try {
    const script =
      "Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' " +
      '-Name NOC_GLOBAL_SETTING_TOASTENABLED -ErrorAction SilentlyContinue | ' +
      'Select-Object -ExpandProperty NOC_GLOBAL_SETTING_TOASTENABLED'
    const out = execSync(`powershell -NoProfile -NonInteractive -Command "${script}"`, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    }).trim()
    if (out === '0') return true
    if (out === '1') return false
    return null
  } catch {
    return null
  }
}

/** true = 专注/勿扰倾向 · false = 正常 · null = 未知/非 Win */
export function detectFocusAssistActive(): FocusDetectResult {
  return detectFn()
}
