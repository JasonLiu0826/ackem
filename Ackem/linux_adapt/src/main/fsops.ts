import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { assertReadableUnderDataRoot, sanitizeRelativeWritePath } from './whitelist'

export function appendOrOverwriteAllowed(
  dataRoot: string,
  relInput: string,
  content: string,
  mode: 'append' | 'overwrite'
): { ok: true } | { ok: false; error: string } {
  const rel = sanitizeRelativeWritePath(relInput)
  if (!rel) return { ok: false, error: 'path not allowed' }
  const abs = resolve(join(dataRoot, rel))
  const root = resolve(dataRoot)
  if (!abs.toLowerCase().startsWith(root.toLowerCase())) return { ok: false, error: 'path escape' }
  mkdirSync(dirname(abs), { recursive: true })
  try {
    if (mode === 'overwrite') {
      writeFileSync(abs, content, 'utf-8')
    } else {
      if (existsSync(abs)) {
        appendFileSync(abs, `\n\n${content}`, 'utf-8')
      } else {
        writeFileSync(abs, content, 'utf-8')
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function importExternalFiles(dataRoot: string, paths: string[]): { copied: string[]; errors: string[] } {
  const destDir = join(dataRoot, 'imports')
  mkdirSync(destDir, { recursive: true })
  const copied: string[] = []
  const errors: string[] = []
  for (const p of paths) {
    try {
      const name = basename(p)
      const safe = name.replace(/[^\w.\-\u4e00-\u9fff]+/g, '_')
      const target = join(destDir, safe)
      copyFileSync(p, target)
      copied.push(`imports/${safe}`)
    } catch (e) {
      errors.push(`${p}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { copied, errors }
}

export function promoteImportToMemory(dataRoot: string, relImport: string): { ok: true; to: string } | { ok: false; error: string } {
  const rel = relImport.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!rel.startsWith('imports/')) return { ok: false, error: 'not under imports/' }
  if (rel.includes('..')) return { ok: false, error: 'invalid path' }
  const from = join(dataRoot, rel)
  if (!existsSync(from)) return { ok: false, error: 'missing file' }
  const base = basename(rel)
  const toRel = join('memory', 'imports', base).replace(/\\/g, '/')
  const toAbs = join(dataRoot, toRel)
  mkdirSync(dirname(toAbs), { recursive: true })
  try {
    copyFileSync(from, toAbs)
    return { ok: true, to: toRel }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function readRelFile(dataRoot: string, rel: string, maxBytes: number): { ok: true; text: string } | { ok: false; error: string } {
  const safe = assertReadableUnderDataRoot(dataRoot, rel)
  if (!safe) return { ok: false, error: 'read not allowed' }
  const abs = resolve(join(dataRoot, safe))
  const root = resolve(dataRoot)
  if (!abs.toLowerCase().startsWith(root.toLowerCase())) return { ok: false, error: 'path escape' }
  if (!existsSync(abs)) return { ok: false, error: 'not found' }
  try {
    const buf = readFileSync(abs)
    const text = buf.slice(0, maxBytes).toString('utf-8')
    return { ok: true, text }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
