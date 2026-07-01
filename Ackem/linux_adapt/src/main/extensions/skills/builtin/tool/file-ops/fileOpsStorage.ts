import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, normalize, relative } from 'node:path'

const STAGING_DIR = 'file-ops-staging'

export function stagingRoot(dataRoot: string): string {
  const root = join(dataRoot, STAGING_DIR)
  mkdirSync(root, { recursive: true })
  return root
}

export function resolveStagingPath(dataRoot: string, relPath: string): string | null {
  const root = stagingRoot(dataRoot)
  const cleaned = normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '')
  if (cleaned.includes('..')) return null
  const abs = join(root, cleaned)
  if (!abs.startsWith(root)) return null
  return abs
}

export function listStaging(dataRoot: string): string[] {
  const root = stagingRoot(dataRoot)
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
  } catch {
    return []
  }
}

export function readStagingFile(dataRoot: string, relPath: string): string {
  const abs = resolveStagingPath(dataRoot, relPath)
  if (!abs) throw new Error('路径不在白名单内')
  if (!existsSync(abs)) throw new Error('文件不存在')
  return readFileSync(abs, 'utf-8')
}

export function writeStagingFile(dataRoot: string, relPath: string, content: string): string {
  const abs = resolveStagingPath(dataRoot, relPath)
  if (!abs) throw new Error('路径不在白名单内')
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content, 'utf-8')
  return relative(stagingRoot(dataRoot), abs) || relPath
}
