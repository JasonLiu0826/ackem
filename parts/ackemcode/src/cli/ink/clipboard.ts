import { spawnSync } from 'node:child_process'

/**
 * Write text to the system clipboard.
 * Windows `clip.exe` treats UTF-8 stdin as the OEM code page, so Chinese
 * becomes mojibake. Use PowerShell Set-Clipboard (Unicode) instead.
 */
export function writeClipboard(text: string): boolean {
  if (!text) return false
  const platform = process.platform
  try {
    if (platform === 'win32') {
      return writeWindowsClipboard(text)
    }
    if (platform === 'darwin') {
      const r = spawnSync('pbcopy', [], { input: text, encoding: 'utf8' })
      return r.status === 0
    }
    const wl = spawnSync('wl-copy', [], { input: text, encoding: 'utf8' })
    if (wl.status === 0) return true
    const xclip = spawnSync('xclip', ['-selection', 'clipboard'], {
      input: text,
      encoding: 'utf8'
    })
    return xclip.status === 0
  } catch {
    return false
  }
}

function writeWindowsClipboard(text: string): boolean {
  const viaPs = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false; Set-Clipboard -Value ([Console]::In.ReadToEnd())'
    ],
    { input: Buffer.from(text, 'utf8'), windowsHide: true }
  )
  return viaPs.status === 0
}
