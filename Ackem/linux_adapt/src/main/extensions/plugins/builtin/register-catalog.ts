// 注册规划中 Plugin 占位 manifest（无运行时，status=planned）

import type { PluginRegistry } from '../registry'
import { normalizePlannedCatalogManifest } from '../../placeholderManifest'
import { MANIFEST as desktopFloat } from './skin/desktop-float/manifest'
import { MANIFEST as speechBubble } from './skin/speech-bubble/manifest'
import { MANIFEST as proactiveNotify } from './behavior/proactive-notify/manifest'
import { MANIFEST as recycleBinMeta } from './behavior/recycle-bin-meta/manifest'
import { MANIFEST as browserHistory } from './behavior/browser-history/manifest'
import { MANIFEST as clipboardRead } from './tool/clipboard-read/manifest'
import { MANIFEST as bgmMusic } from './tool/bgm-music/manifest'
import { MANIFEST as personalityPack } from './personality/personality-pack/manifest'
import { MANIFEST as promptMod } from './personality/prompt-mod/manifest'
import { MANIFEST as pluginMarketplace } from './ecosystem/plugin-marketplace/manifest'

const PLACEHOLDER_PLUGIN_MANIFESTS_RAW = [
  desktopFloat,
  speechBubble,
  proactiveNotify,
  recycleBinMeta,
  browserHistory,
  clipboardRead,
  bgmMusic,
  personalityPack,
  promptMod,
  pluginMarketplace
] as const

export const CATALOG_PLANNED_PLUGIN_MANIFESTS = PLACEHOLDER_PLUGIN_MANIFESTS_RAW.map((m) =>
  normalizePlannedCatalogManifest(m)
)

export const CATALOG_PLANNED_PLUGIN_IDS = CATALOG_PLANNED_PLUGIN_MANIFESTS.map((m) => m.id)

/** 与 register-placeholders.PLACEHOLDER_PLUGIN_IDS 同源（FIX-031） */
export const PLACEHOLDER_PLUGIN_IDS = CATALOG_PLANNED_PLUGIN_IDS

/** 将 CATALOG 占位 Plugin 登记为 planned（已 registerBuiltin 的 id 会自动跳过） */
export async function registerPluginCatalogPlaceholders(registry: PluginRegistry): Promise<void> {
  for (const manifest of CATALOG_PLANNED_PLUGIN_MANIFESTS) {
    await registry.registerPlaceholder(manifest)
    registry.enforceCatalogPlanned(manifest.id, manifest)
  }
}
