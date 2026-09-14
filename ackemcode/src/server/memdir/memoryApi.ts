import fs from 'node:fs/promises'
import path from 'node:path'
import { getAutoMemPath, isPathInside } from './paths.js'

export type MemoryFileInfo = {
  rel: string
  bytes: number
  updatedAt: string
}

async function walk(dir: string, root: string, out: MemoryFileInfo[]): Promise<void> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) {
      await walk(abs, root, out)
      continue
    }
    if (!e.isFile()) continue
    if (!/\.(md|txt)$/i.test(e.name)) continue
    try {
      const st = await fs.stat(abs)
      out.push({
        rel: path.relative(root, abs).replace(/\\/g, '/'),
        bytes: st.size,
        updatedAt: st.mtime.toISOString()
      })
    } catch {
      /* skip */
    }
  }
}

export async function listMemoryFiles(cwd: string): Promise<{
  dir: string
  files: MemoryFileInfo[]
}> {
  const dir = await getAutoMemPath(cwd)
  const files: MemoryFileInfo[] = []
  await walk(dir, dir, files)
  files.sort((a, b) => a.rel.localeCompare(b.rel))
  return { dir, files }
}

function resolveMemFile(root: string, rel: string): string {
  const clean = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (clean.includes('..')) throw new Error('invalid path')
  const abs = path.resolve(root, clean)
  if (!isPathInside(abs, root)) throw new Error('path escapes memory dir')
  return abs
}

export async function readMemoryFile(
  cwd: string,
  rel: string
): Promise<{ rel: string; content: string }> {
  const root = await getAutoMemPath(cwd)
  const abs = resolveMemFile(root, rel)
  const content = await fs.readFile(abs, 'utf8')
  return { rel, content }
}

export async function writeMemoryFile(
  cwd: string,
  rel: string,
  content: string
): Promise<{ rel: string; bytes: number }> {
  const root = await getAutoMemPath(cwd)
  const abs = resolveMemFile(root, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
  return { rel, bytes: Buffer.byteLength(content) }
}

export async function deleteMemoryFile(cwd: string, rel: string): Promise<boolean> {
  const root = await getAutoMemPath(cwd)
  const abs = resolveMemFile(root, rel)
  try {
    await fs.unlink(abs)
    return true
  } catch {
    return false
  }
}
