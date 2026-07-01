import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { classifyAsGame } from '../../machine-map/gameClassifier'

const execFileAsync = promisify(execFile)

export type ShortcutEntry = {
  name: string
  path: string
  target: string
}

const BATCH_TIMEOUT_MS = 45_000
const MAX_LNK_DESKTOP = 80
const MAX_LNK_START_MENU = 200

function isGameLike(name: string, target: string): boolean {
  return classifyAsGame(name, target || name, 'shortcut').ok
}

function escapePsSingleQuoted(s: string): string {
  return s.replace(/'/g, "''")
}

/** 单次 PowerShell 批量解析 .lnk，避免 execFileSync 阻塞主进程 */
async function parseLnkBatch(
  dir: string,
  opts: { recursive: boolean; maxItems: number }
): Promise<ShortcutEntry[]> {
  if (!dir || !existsSync(dir)) return []

  const root = escapePsSingleQuoted(dir)
  const depthClause = opts.recursive ? '-Recurse -Depth 5' : ''
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$shell = New-Object -ComObject WScript.Shell
$files = Get-ChildItem -LiteralPath '${root}' -Filter '*.lnk' ${depthClause} -ErrorAction SilentlyContinue |
  Select-Object -First ${opts.maxItems}
$out = New-Object System.Collections.Generic.List[Object]
foreach ($f in $files) {
  try {
    $t = $shell.CreateShortcut($f.FullName).TargetPath
    $out.Add([PSCustomObject]@{ name = $f.BaseName; path = $f.FullName; target = $t })
  } catch {}
}
$out | ConvertTo-Json -Compress
`.trim()

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        encoding: 'utf-8',
        timeout: BATCH_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
      }
    )
    const trimmed = stdout.trim()
    if (!trimmed) return []
    const parsed = JSON.parse(trimmed) as
      | Array<{ name?: string; path?: string; target?: string }>
      | { name?: string; path?: string; target?: string }
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    return rows
      .filter((r) => r.path && r.name)
      .map((r) => ({
        name: String(r.name),
        path: String(r.path),
        target: String(r.target ?? '')
      }))
  } catch {
    return []
  }
}

export async function scanShortcutsInDir(
  dir: string,
  gameFilter = true
): Promise<ShortcutEntry[]> {
  const batch = await parseLnkBatch(dir, {
    recursive: false,
    maxItems: MAX_LNK_DESKTOP
  })
  return batch.filter((s) => !gameFilter || isGameLike(s.name, s.target))
}

export async function scanStartMenuShortcuts(): Promise<ShortcutEntry[]> {
  const roots = [
    process.env.ProgramData
      ? join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
      : '',
    process.env.APPDATA
      ? join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
      : ''
  ].filter(Boolean)

  const seen = new Set<string>()
  const all: ShortcutEntry[] = []

  for (const root of roots) {
    const batch = await parseLnkBatch(root, {
      recursive: true,
      maxItems: MAX_LNK_START_MENU
    })
    for (const s of batch) {
      if (!isGameLike(s.name, s.target)) continue
      const key = `${s.name}|${s.target}`.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      all.push(s)
    }
  }
  return all
}

/** 同步列出目录内 .lnk 文件名（不解析 target，供降级） */
export function listLnkNamesInDir(dir: string, limit = 50): string[] {
  if (!dir || !existsSync(dir)) return []
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.lnk'))
      .slice(0, limit)
      .map((e) => e.name.replace(/\.lnk$/i, ''))
  } catch {
    return []
  }
}
