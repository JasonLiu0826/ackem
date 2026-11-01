import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { app } from 'electron'
import type { AppSettings } from './settings'
import { resolvePackagedAppDir } from './portableEnv'

export type DataRootDisplayPaths = {
  absolutePath: string
  relativePath: string
  mode: AppSettings['dataRootMode']
}

export function getPortableDataRoot(): string {
  if (app?.isPackaged) {
    return join(resolvePackagedAppDir(), 'data')
  }
  return join(process.cwd(), 'data')
}

export function getLocalAppDataRoot(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Ackem')
  }
  const la = process.env.LOCALAPPDATA
  const base = la && la.length > 0 ? la : join(homedir(), 'AppData', 'Local')
  return join(base, 'Ackem')
}

export function resolveDataRoot(settings: AppSettings): string {
  return settings.dataRootMode === 'portable' ? getPortableDataRoot() : getLocalAppDataRoot()
}

function toDisplayRelative(base: string, absolutePath: string, prefix: string): string | null {
  const rel = relative(base, absolutePath)
  if (!rel || rel.startsWith('..') || rel.includes(':')) return null
  const normalized = rel.replace(/\\/g, '/')
  return prefix + (normalized.startsWith('.') ? normalized.slice(2) : normalized)
}

/** 设置页展示：绝对路径 + 对用户友好的相对/缩写路径 */
export function formatDataRootDisplayPaths(settings: AppSettings): DataRootDisplayPaths {
  const absolutePath = resolveDataRoot(settings)
  const mode = settings.dataRootMode

  if (mode === 'localappdata') {
    const la = process.env.LOCALAPPDATA
    if (la && absolutePath.toLowerCase().startsWith(la.toLowerCase())) {
      const tail = absolutePath.slice(la.length).replace(/^[/\\]+/, '')
      return {
        absolutePath,
        relativePath: `%LOCALAPPDATA%\\${tail.replace(/\//g, '\\')}`,
        mode
      }
    }
    const home = homedir()
    const fromHome = toDisplayRelative(home, absolutePath, '~/')
    if (fromHome) return { absolutePath, relativePath: fromHome, mode }
  }

  if (mode === 'portable') {
    if (app?.isPackaged) {
      const exeDir = resolvePackagedAppDir()
      const fromExe = toDisplayRelative(exeDir, absolutePath, './')
      if (fromExe) return { absolutePath, relativePath: fromExe, mode }
    } else {
      const cwd = process.cwd()
      const fromCwd = toDisplayRelative(cwd, absolutePath, './')
      if (fromCwd) return { absolutePath, relativePath: fromCwd, mode }
    }
  }

  const home = homedir()
  const fromHome = toDisplayRelative(home, absolutePath, '~/')
  if (fromHome) return { absolutePath, relativePath: fromHome, mode }

  const fromCwd = toDisplayRelative(process.cwd(), absolutePath, './')
  if (fromCwd) return { absolutePath, relativePath: fromCwd, mode }

  return { absolutePath, relativePath: absolutePath, mode }
}

/** 结构化数据单库：{dataRoot}/ackem.db（与便携 ./data 或 LocalAppData 根一致） */
export { databasePath, ACKEM_DB_FILENAME } from './db/paths'
