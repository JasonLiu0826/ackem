import type { PluginManifest } from '../../../types'

export const THEME_TOGGLE_PLUGIN_ID = 'Ackem/theme-toggle@0.0.1'

export const THEME_TOGGLE_MANIFEST: PluginManifest = {
  id: THEME_TOGGLE_PLUGIN_ID,
  name: '浜壊/鏆楄壊涓婚',
  version: '0.0.1',
  category: 'plugin',
  pluginType: 'theme',
  description: '鍒囨崲 Ackem UI 鏃ュ厜/鏆楀涓婚锛堣皟鐢ㄥ唴缃?setUiTheme锛夈€?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'bootstrap.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  permissions: ['readonly'],
  fallbackPermissions: ['readonly'],
  tags: ['builtin', 'p-02', 'w5']
}

export const PLUGIN_ID = THEME_TOGGLE_PLUGIN_ID
export const SPEC_ID = 'P-02'
export const MANIFEST = THEME_TOGGLE_MANIFEST
