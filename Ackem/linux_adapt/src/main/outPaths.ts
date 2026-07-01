import { app } from 'electron'
import { join } from 'node:path'

/** electron-vite 构建根目录（`out/`），勿用 chunk 内 `__dirname`。 */
export function resolveOutRoot(): string {
  return join(app.getAppPath(), 'out')
}

export function resolvePreloadPath(
  file: 'index.cjs' | 'surfacePreload.cjs' | 'updaterPreload.cjs'
): string {
  return join(resolveOutRoot(), 'preload', file)
}

export function resolveRendererHtml(
  file: 'index.html' | 'pet.html' | 'updater.html' | 'startup.html'
): string {
  return join(resolveOutRoot(), 'renderer', file)
}
