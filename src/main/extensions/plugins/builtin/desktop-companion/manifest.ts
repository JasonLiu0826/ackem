// [desktop-companion/manifest] 鈥?涓?manifest.json 鍚屾

import type { PluginManifest } from '../../types'

export const DESKTOP_COMPANION_PLUGIN_ID = 'Ackem/desktop-companion@0.1.0'

export const DESKTOP_COMPANION_MANIFEST: PluginManifest = {
  id: DESKTOP_COMPANION_PLUGIN_ID,
  name: '妗岄潰闄即',
  version: '0.1.0',
  category: 'plugin',
  pluginType: 'behavior',
  description: '鏃舵鎰熺煡銆佸湪鍦烘ā寮忋€佷富鍔ㄦ秷鎭笌绯荤粺閫氱煡',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'desktop-companion.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  permissions: ['engine_read', 'system_notification'],
  tags: ['desktop', 'companion', 'builtin']
}
