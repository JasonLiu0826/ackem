import type { PluginManifest } from '../../../types'

export const SCREENSHOT_DEPRECATED_AT = '2026-06-06'
export const SCREENSHOT_IMPLEMENTATION_STATUS = 'deprecated' as const

export const SCREENSHOT_PLUGIN_ID = 'ackem/screenshot@0.0.1'

export const SCREENSHOT_MANIFEST: PluginManifest = {
  id: SCREENSHOT_PLUGIN_ID,
  name: '截图分享（已下线）',
  version: '0.0.1',
  category: 'plugin',
  pluginType: 'tool',
  description: `【已下线 · ${SCREENSHOT_DEPRECATED_AT}】W5 截图 Plugin 已移除，源码保留作底层能力，扩展中心不可启用。`,
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
