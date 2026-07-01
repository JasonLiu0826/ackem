import type { PluginManifest } from '../../../types'

export const SCREEN_EFFECTS_PLUGIN_ID = 'ackem/screen-effects@0.0.1'

/** W8 前仅 pulse 广播 stub，无粒子/满屏特效 */
export const SCREEN_EFFECTS_IMPLEMENTATION_STATUS = 'stub' as const

export const SCREEN_EFFECTS_MANIFEST: PluginManifest = {
  id: SCREEN_EFFECTS_PLUGIN_ID,
  name: '屏幕特效（Stub）',
  version: '0.0.1',
  category: 'plugin',
  pluginType: 'skin',
  implementationStatus: SCREEN_EFFECTS_IMPLEMENTATION_STATUS,
  description:
    '【Stub · W8 待实装】当前仅向 UI 广播轻量 pulse 事件，无红心/樱花等粒子特效；情绪联动粒子留 W8。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'bootstrap.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  permissions: ['readonly'],
  fallbackPermissions: ['readonly'],
  tags: ['builtin', 'p-10', 'w5', 'stub', 'w8-planned'],
  dispatch: {
    mode: 'dispatched',
    subtype: 'emotion_delta',
    time: { cooldown_minutes: 30 },
    habits: [],
    scenarios: ['高 aff 情绪事件（设计目标，W8 实装粒子）'],
    summary: 'Stub：ui:screenFx pulse 广播（非满屏粒子）',
    keywords: ['特效', '粒子', '红心']
  }
}

export const PLUGIN_ID = SCREEN_EFFECTS_PLUGIN_ID
export const SPEC_ID = 'P-10'
export const MANIFEST = SCREEN_EFFECTS_MANIFEST
