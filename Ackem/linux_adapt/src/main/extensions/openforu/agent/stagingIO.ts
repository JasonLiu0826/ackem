import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PREVIEW_DIR = 'preview'

export function stagingPreviewDir(dataRoot: string, sessionId: string): string {
  return join(dataRoot, 'openforu', 'staging', sessionId, PREVIEW_DIR)
}

export function stagingPreviewDirRel(sessionId: string): string {
  return `openforu/staging/${sessionId}/${PREVIEW_DIR}`
}

export function hasStagingPreview(dataRoot: string, sessionId: string): boolean {
  const dir = stagingPreviewDir(dataRoot, sessionId)
  return existsSync(dir) && existsSync(join(dir, 'manifest.json'))
}

export function writeStagingPreview(
  dataRoot: string,
  sessionId: string,
  files: Record<string, string>
): string {
  const dir = stagingPreviewDir(dataRoot, sessionId)
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error(`非法 staging 文件名: ${name}`)
    }
    writeFileSync(join(dir, name), content, 'utf-8')
  }
  return stagingPreviewDirRel(sessionId)
}

export function readStagingPreview(
  dataRoot: string,
  sessionId: string
): Record<string, string> | null {
  const dir = stagingPreviewDir(dataRoot, sessionId)
  if (!existsSync(dir)) return null
  const out: Record<string, string> = {}
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json') && name !== 'README.md') continue
    out[name] = readFileSync(join(dir, name), 'utf-8')
  }
  return Object.keys(out).length ? out : null
}
