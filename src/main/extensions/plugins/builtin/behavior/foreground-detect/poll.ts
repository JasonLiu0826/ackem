import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { updateForegroundTitle } from '../../../../../context/foregroundState'

const execFileAsync = promisify(execFile)

const PS_SCRIPT = [
  'Add-Type @"',
  'using System; using System.Runtime.InteropServices; using System.Text;',
  'public class W {',
  ' [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
  ' [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder t, int c);',
  ' public static string Title() { var h=GetForegroundWindow(); var sb=new StringBuilder(512); GetWindowText(h,sb,512); return sb.ToString(); }',
  '}"@',
  '[W]::Title()'
].join('\n')

let timer: ReturnType<typeof setInterval> | null = null

export async function readForegroundWindowTitle(): Promise<string> {
  if (process.env.Ackem_FOREGROUND_TITLE) {
    return process.env.Ackem_FOREGROUND_TITLE
  }
  if (process.platform !== 'win32') {
    return ''
  }
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
      { timeout: 8000, windowsHide: true, maxBuffer: 4096 }
    )
    return String(stdout ?? '').trim()
  } catch {
    return ''
  }
}

export function startForegroundPolling(intervalMs = 15_000): void {
  stopForegroundPolling()
  const tick = () => {
    void readForegroundWindowTitle().then((title) => updateForegroundTitle(title))
  }
  tick()
  timer = setInterval(tick, intervalMs)
}

export function stopForegroundPolling(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
