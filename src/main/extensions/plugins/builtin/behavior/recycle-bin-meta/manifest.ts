// [P-08] 鍥炴敹绔欏厓鏁版嵁 鈥?鍗犱綅 manifest锛堟湭鎺ュ叆 coordinator.boot锛?
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "Ackem/recycle-bin-meta@0.0.1",
  "name": "鍥炴敹绔欏厓鏁版嵁",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "behavior",
  "description": "[P-08] 寮烘潈闄愶紱鍙鍒椾妇鍏冩暟鎹紝涓嶈鏂囦欢鍐呭",
  "author": "JasonLiu0826",
  "license": "AGPL-3.0",
  "main": "stub.ts",
  "engineVersion": ">=0.1.0 <1.0.0",
  "permissions": [
    "engine_read",
    "system_notification"
  ],
  "fallbackPermissions": [
    "readonly"
  ],
  "tags": [
    "builtin",
    "placeholder",
    "p-08"
  ]
} as PluginManifest
export const PLUGIN_ID = 'Ackem/recycle-bin-meta@0.0.1'
export const SPEC_ID = 'P-08'
