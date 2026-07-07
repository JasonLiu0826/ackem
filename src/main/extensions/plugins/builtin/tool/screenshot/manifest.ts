import type { PluginManifest } from '../../../types'

export const SCREENSHOT_DEPRECATED_AT = '2026-06-06'
export const SCREENSHOT_IMPLEMENTATION_STATUS = 'deprecated' as const

export const SCREENSHOT_PLUGIN_ID = 'Ackem/screenshot@0.0.1'

export const SCREENSHOT_MANIFEST: PluginManifest = {
  id: SCREENSHOT_PLUGIN_ID,
  name: '鎴浘鍒嗕韩锛堝凡涓嬬嚎锛?,
  version: '0.0.1',
  category: 'plugin',
  pluginType: 'tool',
  description: `銆愬凡涓嬬嚎 路 ${SCREENSHOT_DEPRECATED_AT}銆慦5 鎴浘 Plugin 宸茬Щ闄わ紝婧愮爜淇濈暀浣滃簳灞傝兘鍔涳紝鎵╁睍涓績涓嶅彲鍚敤銆俙,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'bootstrap.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  permissions: ['data_write'],
  fallbackPermissions: ['data_write'],
  implementationStatus: SCREENSHOT_IMPLEMENTATION_STATUS,
  tags: ['builtin', 'p-13', 'w5', 'deprecated']
}

export const PLUGIN_ID = SCREENSHOT_PLUGIN_ID
export const SPEC_ID = 'P-13'
export const MANIFEST = SCREENSHOT_MANIFEST
