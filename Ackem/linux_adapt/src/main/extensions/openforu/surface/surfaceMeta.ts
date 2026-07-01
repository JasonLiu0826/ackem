import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { defaultSurfaceHtml, isSurfaceEnabled, type ExtensionSurfaceConfig } from '../../../../shared/extensionSurface'
import { isOpenForUWidgetId } from '../../../../shared/openforuWidgets'
import type { UpluginMeta } from '../openforu/upluginRuntime'
import { buildWidgetHtml } from './widgets/buildWidgetHtml'

export function readUpluginSurfaceConfig(
  dataRoot: string,
  extensionId: string
): ExtensionSurfaceConfig | null {
  const slug = extensionId.replace(/^u\//, '').replace(/@.*$/, '')
  const metaPath = join(dataRoot, 'openforu', 'uplugins', slug, 'plugin.meta.json')
  if (!existsSync(metaPath)) return null
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as UpluginMeta & {
      surface?: ExtensionSurfaceConfig
    }
    if (!isSurfaceEnabled(meta.surface)) return null
    return meta.surface ?? null
  } catch {
    return null
  }
}

export function upluginHasSurface(dataRoot: string, extensionId: string): boolean {
  return readUpluginSurfaceConfig(dataRoot, extensionId) != null
}

export function resolveSurfaceHtml(
  dataRoot: string,
  extensionId: string,
  title: string,
  surface: ExtensionSurfaceConfig
): string {
  if (surface.widget && isOpenForUWidgetId(surface.widget)) {
    const actions = (surface.widgetConfig?.primaryActions as string[] | undefined) ?? ['开始', '重置']
    return buildWidgetHtml(surface.widget, title, surface.widgetConfig ?? {}, actions)
  }
  if (surface.html?.trim()) return surface.html.trim()
  const slug = extensionId.replace(/^u\//, '').replace(/@.*$/, '')
  const pluginDir = join(dataRoot, 'openforu', 'uplugins', slug)
  if (surface.entry) {
    const entryPath = join(pluginDir, surface.entry)
    if (existsSync(entryPath)) {
      return readFileSync(entryPath, 'utf-8')
    }
  }
  return defaultSurfaceHtml(surface.title?.trim() || title)
}
