import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export type SteamGameEntry = {
  displayName: string
  path: string
  libraryRoot: string
}

/** 简易 VDF 解析：提取 "path" 值 */
function parseLibraryFoldersVdf(text: string): string[] {
  const paths: string[] = []
  const re = /"path"\s+"([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const p = m[1].replace(/\\\\/g, '\\')
    if (p) paths.push(p)
  }
  return paths
}

function findSteamInstallRoot(): string | null {
  const candidates = [
    process.env['ProgramFiles(x86)']
      ? join(process.env['ProgramFiles(x86)'], 'Steam')
      : '',
    join('C:', 'Program Files (x86)', 'Steam'),
    join(homedir(), 'Steam')
  ].filter(Boolean)
  for (const c of candidates) {
    if (existsSync(join(c, 'steam.exe')) || existsSync(join(c, 'steamapps', 'libraryfolders.vdf'))) {
      return c
    }
  }
  return null
}

export function parseSteamLibraries(): {
  installRoot: string | null
  libraryRoots: string[]
  games: SteamGameEntry[]
} {
  const installRoot = findSteamInstallRoot()
  if (!installRoot) {
    return { installRoot: null, libraryRoots: [], games: [] }
  }

  const vdfPath = join(installRoot, 'steamapps', 'libraryfolders.vdf')
  const libraryRoots = new Set<string>([installRoot])
  if (existsSync(vdfPath)) {
    try {
      const text = readFileSync(vdfPath, 'utf-8')
      for (const p of parseLibraryFoldersVdf(text)) {
        libraryRoots.add(p)
      }
    } catch {
      /* ignore */
    }
  }

  const games: SteamGameEntry[] = []
  for (const root of libraryRoots) {
    const common = join(root, 'steamapps', 'common')
    if (!existsSync(common)) continue
    let entries
    try {
      entries = readdirSync(common, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      if (e.name === 'Steamworks Shared') continue
      games.push({
        displayName: e.name,
        path: join(common, e.name),
        libraryRoot: root
      })
    }
  }

  return { installRoot, libraryRoots: [...libraryRoots], games }
}
