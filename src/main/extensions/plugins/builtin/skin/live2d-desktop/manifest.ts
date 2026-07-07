import type { PluginManifest } from '../../../types'

export const LIVE2D_DESKTOP_PLUGIN_ID = 'Ackem/live2d-desktop@0.0.1'

/** W8 鍓嶄负鍑犱綍鍏夌悆 + 妗屽疇绐楋紝闈?Cubism Live2D 妯″瀷 */
export const LIVE2D_DESKTOP_IMPLEMENTATION_STATUS = 'preview' as const

export const LIVE2D_DESKTOP_MANIFEST: PluginManifest = {
  id: LIVE2D_DESKTOP_PLUGIN_ID,
  name: 'Live2D 妗屽疇锛堝嚑浣曢瑙堬級',
  version: '0.0.1',
  category: 'plugin',
  pluginType: 'skin',
  implementationStatus: LIVE2D_DESKTOP_IMPLEMENTATION_STATUS,
  description:
    '銆怭review 路 W8 Cubism 寰呭疄瑁呫€戝綋鍓嶄负鍑犱綍鍏夌悆 + 鐙珛妗屽疇绐楅瑙堬紝鏃?Live2D 楠ㄩ/琛ㄦ儏锛汣ubism 妯″瀷涓庢儏缁仈鍔ㄧ暀 W8銆?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'bootstrap.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  permissions: ['readonly'],
  fallbackPermissions: ['readonly'],
  tags: ['builtin', 'p-01', 'w5', 'preview', 'w8-planned', 'cubism-planned'],
  dispatch: {
    mode: 'manual',
    time: { manual_trigger: true },
    habits: [],
    scenarios: ['鐢ㄦ埛鎵撳紑妗屽疇绐?/ 鍒囨崲浼翠荆鐨偆'],
    summary: 'Preview锛氬嚑浣曞厜鐞冩瀹犲３锛堥潪 Cubism Live2D 妯″瀷锛?,
    keywords: ['妗屽疇', 'live2d', '鐨偆']
  },
  companionSkin: {
    renderer: 'react-builtin',
    entry: LIVE2D_DESKTOP_PLUGIN_ID
  }
}

export const PLUGIN_ID = LIVE2D_DESKTOP_PLUGIN_ID
export const SPEC_ID = 'P-01'
export const MANIFEST = LIVE2D_DESKTOP_MANIFEST
