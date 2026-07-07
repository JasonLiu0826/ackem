import type { PluginManifest } from '../../../types'

export const SCREEN_EFFECTS_PLUGIN_ID = 'Ackem/screen-effects@0.0.1'

/** W8 鍓嶄粎 pulse 骞挎挱 stub锛屾棤绮掑瓙/婊″睆鐗规晥 */
export const SCREEN_EFFECTS_IMPLEMENTATION_STATUS = 'stub' as const

export const SCREEN_EFFECTS_MANIFEST: PluginManifest = {
  id: SCREEN_EFFECTS_PLUGIN_ID,
  name: '灞忓箷鐗规晥锛圫tub锛?,
  version: '0.0.1',
  category: 'plugin',
  pluginType: 'skin',
  implementationStatus: SCREEN_EFFECTS_IMPLEMENTATION_STATUS,
  description:
    '銆怱tub 路 W8 寰呭疄瑁呫€戝綋鍓嶄粎鍚?UI 骞挎挱杞婚噺 pulse 浜嬩欢锛屾棤绾㈠績/妯辫姳绛夌矑瀛愮壒鏁堬紱鎯呯华鑱斿姩绮掑瓙鐣?W8銆?,
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
    scenarios: ['楂?aff 鎯呯华浜嬩欢锛堣璁＄洰鏍囷紝W8 瀹炶绮掑瓙锛?],
    summary: 'Stub锛歶i:screenFx pulse 骞挎挱锛堥潪婊″睆绮掑瓙锛?,
    keywords: ['鐗规晥', '绮掑瓙', '绾㈠績']
  }
}

export const PLUGIN_ID = SCREEN_EFFECTS_PLUGIN_ID
export const SPEC_ID = 'P-10'
export const MANIFEST = SCREEN_EFFECTS_MANIFEST
