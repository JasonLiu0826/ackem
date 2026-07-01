// [P-07] 前台窗口标题感知 — W6 JP-C v0
import type { PluginManifest } from '../../../types'

export const FOREGROUND_DETECT_MANIFEST: PluginManifest = {
  id: 'ackem/foreground-detect@0.0.1',
  name: '前台窗口感知',
  version: '0.0.1',
  category: 'plugin',
  pluginType: 'behavior',
  description:
    '读取前台窗口标题，供 ExtensionPolicy 在会议/演示/专注时抑制久坐与喝水提醒；默认关闭，需在扩展中心启用',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'register.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  permissions: ['engine_read', 'foreground_detect'],
  fallbackPermissions: ['readonly'],
  tags: ['builtin', 'w6', 'p-07']
} as PluginManifest

export const FOREGROUND_DETECT_PLUGIN_ID = 'ackem/foreground-detect@0.0.1'
export const PLUGIN_ID = FOREGROUND_DETECT_PLUGIN_ID
export const SPEC_ID = 'P-07'
