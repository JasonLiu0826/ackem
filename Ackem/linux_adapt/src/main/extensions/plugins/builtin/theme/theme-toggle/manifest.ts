import type { PluginManifest } from '../../../types'

export const THEME_TOGGLE_PLUGIN_ID = 'ackem/theme-toggle@0.0.1'

export const THEME_TOGGLE_MANIFEST: PluginManifest = {
  id: THEME_TOGGLE_PLUGIN_ID,
  name: '亮色/暗色主题',
  version: '0.0.1',
  category: 'plugin',
  pluginType: 'theme',
  description: '切换 Ackem UI 日光/暗室主题（调用内置 setUiTheme）。',
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
