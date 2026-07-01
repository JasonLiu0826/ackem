import type { PluginManifest } from '../../../types'

export const LIVE2D_DESKTOP_PLUGIN_ID = 'ackem/live2d-desktop@0.0.1'

/** W8 前为几何光球 + 桌宠窗，非 Cubism Live2D 模型 */
export const LIVE2D_DESKTOP_IMPLEMENTATION_STATUS = 'preview' as const

export const LIVE2D_DESKTOP_MANIFEST: PluginManifest = {
  id: LIVE2D_DESKTOP_PLUGIN_ID,
  name: 'Live2D 桌宠（几何预览）',
  version: '0.0.1',
  category: 'plugin',
  pluginType: 'skin',
  implementationStatus: LIVE2D_DESKTOP_IMPLEMENTATION_STATUS,
  description:
    '【Preview · W8 Cubism 待实装】当前为几何光球 + 独立桌宠窗预览，无 Live2D 骨骼/表情；Cubism 模型与情绪联动留 W8。',
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
    scenarios: ['用户打开桌宠窗 / 切换伴侣皮肤'],
    summary: 'Preview：几何光球桌宠壳（非 Cubism Live2D 模型）',
    keywords: ['桌宠', 'live2d', '皮肤']
  },
  companionSkin: {
    renderer: 'react-builtin',
    entry: LIVE2D_DESKTOP_PLUGIN_ID
  }
}

export const PLUGIN_ID = LIVE2D_DESKTOP_PLUGIN_ID
export const SPEC_ID = 'P-01'
export const MANIFEST = LIVE2D_DESKTOP_MANIFEST
