import fs from 'node:fs/promises'
import path from 'node:path'
import { cwdNote } from './pathUtils.js'
import { clampToolHint } from './grepConstants.js'

const TEXT_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.vue',
  '.yml',
  '.yaml',
  '.cpp',
  '.sql',
  '.kt',
  '.txt',
  '.html',
  '.css'
])

export async function findSimilarFileInDir(
  dirAbs: string,
  requestedBase: string
): Promise<string | null> {
  let entries: string[]
  try {
    entries = await fs.readdir(dirAbs)
  } catch {
    return null
  }
  const reqLower = requestedBase.toLowerCase()
  const reqStem = path.parse(requestedBase).name.toLowerCase()
  const reqExt = path.parse(requestedBase).ext.toLowerCase()

  for (const name of entries) {
    if (name.toLowerCase() === reqLower) return name
  }
  for (const name of entries) {
    const p = path.parse(name)
    if (p.name.toLowerCase() === reqStem && p.ext.toLowerCase() !== reqExt) {
      if (TEXT_EXT.has(p.ext.toLowerCase()) || !p.ext) return name
    }
  }
  return null
}

export async function suggestPathForMissingFile(
  cwd: string,
  rel: string
): Promise<string | null> {
  const abs = path.resolve(cwd, rel)
  const dir = path.dirname(abs)
  const base = path.basename(abs)
  const similar = await findSimilarFileInDir(dir, base)
  if (!similar) return null
  const relDir = path.dirname(rel)
  return relDir === '.' ? similar : `${relDir.replace(/\\/g, '/')}/${similar}`
}

export function formatMissingFileMessage(
  cwd: string,
  rel: string,
  suggestion: string | null
): string {
  let msg = `File does not exist. ${cwdNote(cwd)}`
  if (suggestion) msg += ` Did you mean ${suggestion}?`
  return msg
}

/** P5: fuzzy line hint when old_string not found (whitespace-normalized line match). */
export function buildReplaceNotFoundHint(
  raw: string,
  oldStr: string
): string {
  const normOld = oldStr.trim().replace(/\s+/g, ' ')
  if (!normOld) return ''

  const lines = raw.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const normLine = lines[i]!.trim().replace(/\s+/g, ' ')
    if (normLine === normOld || normLine.includes(normOld) || normOld.includes(normLine)) {
      const ctx: string[] = []
      if (i > 0) ctx.push(`line ${i}: ${lines[i - 1]}`)
      ctx.push(`line ${i + 1}: ${lines[i]}`)
      if (i + 1 < lines.length) ctx.push(`line ${i + 2}: ${lines[i + 1]}`)
      return clampToolHint(`Nearby content:\n${ctx.join('\n')}`)
    }
  }
  return ''
}
