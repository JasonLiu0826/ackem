import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { createLogger } from '../../logger'

const log = createLogger('weixin-sticker')

export type StickerManifestEntry = {
  id: string
  presetId: string
  file: string
  tags?: string[]
}

type StickerManifest = {
  version: number
  stickers: StickerManifestEntry[]
}

let cached: Map<string, StickerManifestEntry> | null = null

function stickersRoot(): string {
  const candidates: string[] = []
  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'assets', 'weixin-stickers'))
  }
  if (typeof app?.getAppPath === 'function') {
    candidates.push(join(app.getAppPath(), 'assets', 'weixin-stickers'))
  }
  candidates.push(join(process.cwd(), 'assets', 'weixin-stickers'))

  for (const dir of candidates) {
    if (existsSync(join(dir, 'manifest.json'))) return dir
  }
  return join(process.cwd(), 'assets', 'weixin-stickers')
}

function loadManifest(): Map<string, StickerManifestEntry> {
  if (cached) return cached
  const path = join(stickersRoot(), 'manifest.json')
  cached = new Map()
  if (!existsSync(path)) return cached
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as StickerManifest
    for (const s of raw.stickers ?? []) {
      if (s?.id) cached.set(s.id, s)
    }
  } catch (e) {
    log.warn('manifest load failed', e)
  }
  return cached
}

export function resolveStickerEntry(stickerId: string): StickerManifestEntry | null {
  return loadManifest().get(stickerId) ?? null
}

/** 本地 PNG 绝对路径；文件不存在则 null（预留位，不发图） */
export function resolveStickerFilePath(stickerId: string): string | null {
  const entry = resolveStickerEntry(stickerId)
  if (!entry) return null
  const abs = join(stickersRoot(), entry.file)
  return existsSync(abs) ? abs : null
}

export function listStickersForPreset(presetId: string): StickerManifestEntry[] {
  return [...loadManifest().values()].filter((s) => s.presetId === presetId)
}

/** Phase 3：CDN 上传后发 IMAGE；当前仅记录预留 */
export async function sendStickerPlaceholder(stickerId: string): Promise<boolean> {
  const path = resolveStickerFilePath(stickerId)
  if (!path) {
    log.debug('sticker reserved, file missing', { stickerId })
    return false
  }
  log.info('sticker file ready, CDN send not wired yet', { stickerId, path })
  return false
}
