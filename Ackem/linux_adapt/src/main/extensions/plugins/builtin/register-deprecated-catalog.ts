// 注册已下线 Plugin catalog 项（无运行时，status=deprecated，FIX-032）

import type { PluginRegistry } from '../registry'
import { normalizeDeprecatedCatalogManifest } from '../../placeholderManifest'
import { SCREENSHOT_MANIFEST } from './tool/screenshot/manifest'

const DEPRECATED_PLUGIN_MANIFESTS_RAW = [SCREENSHOT_MANIFEST] as const

export const CATALOG_DEPRECATED_PLUGIN_MANIFESTS = DEPRECATED_PLUGIN_MANIFESTS_RAW.map((m) =>
  normalizeDeprecatedCatalogManifest(m)
)

export const CATALOG_DEPRECATED_PLUGIN_IDS = CATALOG_DEPRECATED_PLUGIN_MANIFESTS.map((m) => m.id)

/** 将已下线 catalog Plugin 登记为 deprecated（清除误激活的持久化 hooks） */
export async function registerPluginCatalogDeprecated(registry: PluginRegistry): Promise<void> {
  for (const manifest of CATALOG_DEPRECATED_PLUGIN_MANIFESTS) {
    await registry.registerDeprecated(manifest)
    registry.enforceCatalogDeprecated(manifest.id, manifest)
  }
}
