import { desktopCapturer } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export async function capturePrimaryDisplayPng(dataRoot: string): Promise<string | null> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1280, height: 720 }
  })
  const primary = sources[0]
  if (!primary?.thumbnail) return null
  const dir = join(dataRoot, 'screenshots')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `shot-${Date.now()}.png`)
  const png = primary.thumbnail.toPNG()
  if (!png?.length) return null
  writeFileSync(file, png)
  return existsSync(file) ? file : null
}
