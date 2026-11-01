/**
 * Open a local path or http(s) URL with the OS default handler.
 * Windows: Start-Process (Word / WPS / Typora / Notepad / Explorer / default browser).
 * macOS: open. Linux: xdg-open.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)

const BLOCKED_EXT = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.ps1',
  '.msi',
  '.vbs',
  '.vbe',
  '.js',
  '.jse',
  '.wsf',
  '.wsh',
  '.msc',
  '.reg',
  '.cpl',
  '.inf',
  '.msp',
  '.application'
])

export type OpenKind = 'url' | 'path'

export type OpenTarget = {
  kind: OpenKind
  value: string
}

export type OpenResult = {
  ok: boolean
  message: string
}

export function isBlockedExecutable(abs: string): boolean {
  return BLOCKED_EXT.has(path.extname(abs).toLowerCase())
}

export function validateHttpUrl(url: string): URL {
  const parsed = new URL(url.trim())
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Only http(s) URLs can be opened, got ${parsed.protocol}`)
  }
  return parsed
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function run(command: string, args: string[]): Promise<void> {
  await execFileAsync(command, args, { windowsHide: true, timeout: 15_000 })
}

export function resolveFileUrl(raw: string): string {
  const value = raw.trim()
  if (value.toLowerCase().startsWith('file:')) {
    return fileURLToPath(value)
  }
  return value
}

export async function openPath(target: string): Promise<OpenResult> {
  const raw = resolveFileUrl(target).trim()
  if (!raw) return { ok: false, message: 'path is required' }
  const abs = path.resolve(raw)
  try {
    await fs.access(abs)
  } catch {
    return { ok: false, message: `Path not found: ${abs}` }
  }
  if (isBlockedExecutable(abs)) {
    return {
      ok: false,
      message: `Refusing to launch executable ${path.basename(abs)} — open it yourself if you intend to run it`
    }
  }
  try {
    if (process.platform === 'win32') {
      await run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        // PS 5.1 Start-Process has -FilePath, not -LiteralPath (that's PS 6+).
        `Start-Process -FilePath ${psQuote(abs)}`
      ])
    } else if (process.platform === 'darwin') {
      await run('open', [abs])
    } else {
      await run('xdg-open', [abs])
    }
    return { ok: true, message: `Opened ${abs}` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function openBrowser(url: string): Promise<OpenResult> {
  try {
    const href = validateHttpUrl(url).toString()
    if (process.platform === 'win32') {
      await run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Start-Process ${psQuote(href)}`
      ])
    } else if (process.platform === 'darwin') {
      await run('open', [href])
    } else {
      await run('xdg-open', [href])
    }
    return { ok: true, message: `Opened ${href}` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function openTarget(target: OpenTarget): Promise<OpenResult> {
  return target.kind === 'url' ? openBrowser(target.value) : openPath(target.value)
}

export function classifyOpenTarget(raw: string): OpenTarget | null {
  const value = raw.trim().replace(/[),.;:，。、]+$/u, '')
  if (!value) return null
  if (/^https?:\/\//i.test(value)) {
    try {
      validateHttpUrl(value)
      return { kind: 'url', value }
    } catch {
      return null
    }
  }
  if (/^file:/i.test(value)) {
    try {
      return { kind: 'path', value: fileURLToPath(value) }
    } catch {
      return null
    }
  }
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/')) {
    return { kind: 'path', value }
  }
  return null
}

const URL_RE = /https?:\/\/[^\s<>"'`）】]+/gi
const WIN_PATH_RE = /(?:[A-Za-z]:\\|\\\\)[^\s<>"'|]+/g
const FILE_URL_RE = /file:\/\/[^\s<>"']+/gi

export function extractOpenTargets(text: string): { start: number; end: number; target: OpenTarget }[] {
  const hits: { start: number; end: number; target: OpenTarget }[] = []
  const push = (re: RegExp) => {
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(text))) {
      const token = match[0]
      const target = classifyOpenTarget(token)
      if (!target) continue
      hits.push({ start: match.index, end: match.index + token.length, target })
    }
  }
  push(URL_RE)
  push(FILE_URL_RE)
  push(WIN_PATH_RE)
  hits.sort((a, b) => a.start - b.start)
  return hits
}
