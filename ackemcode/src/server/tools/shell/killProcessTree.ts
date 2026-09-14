import { spawn, type ChildProcess } from 'node:child_process'

/**
 * Terminate a spawned command and its descendants (e.g. WINWORD.EXE from PowerShell COM).
 * On Windows, child.kill() only stops the shell — use taskkill /T /F for the full tree.
 */
export function killProcessTree(
  child: ChildProcess,
  signal: NodeJS.Signals = 'SIGTERM'
): void {
  const pid = child.pid
  if (pid == null) {
    try {
      child.kill(signal)
    } catch {
      /* already dead */
    }
    return
  }

  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    }).unref()
    try {
      child.kill()
    } catch {
      /* ignore */
    }
    return
  }

  try {
    process.kill(-pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      /* ignore */
    }
  }
}
