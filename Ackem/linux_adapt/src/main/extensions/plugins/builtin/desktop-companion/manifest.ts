// [desktop-companion/manifest] — 与 manifest.json 同步

import type { PluginManifest } from '../../types'

export const DESKTOP_COMPANION_PLUGIN_ID = 'ackem/desktop-companion@0.1.0'

export const DESKTOP_COMPANION_MANIFEST: PluginManifest = {
  id: DESKTOP_COMPANION_PLUGIN_ID,
  name: '桌面陪伴',
  version: '0.1.0',
  category: 'plugin',
  pluginType: 'behavior',
  description: '时段感知、在场模式、主动消息与系统通知',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'desktop-companion.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  permissions: ['engine_read', 'system_notification'],
  tags: ['desktop', 'companion', 'builtin']
}
