// [P-15] 璇皵妯＄粍 鈥?鍗犱綅 manifest锛堟湭鎺ュ叆 coordinator.boot锛?
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "Ackem/prompt-mod@0.0.1",
  "name": "璇皵妯＄粍",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "personality",
  "description": "[P-15] 鍙垏鎹㈣姘旀ā鏉匡紱鐗堟湰鍖栵紱涓庝簨瀹炶蹇嗛殧绂?,
  "author": "JasonLiu0826",
  "license": "AGPL-3.0",
  "main": "stub.ts",
  "engineVersion": ">=0.1.0 <1.0.0",
  "permissions": [
    "readonly",
    "engine_read"
  ],
  "fallbackPermissions": [
    "readonly"
  ],
  "tags": [
    "builtin",
    "placeholder",
    "p-15"
  ]
} as PluginManifest
export const PLUGIN_ID = 'Ackem/prompt-mod@0.0.1'
export const SPEC_ID = 'P-15'
