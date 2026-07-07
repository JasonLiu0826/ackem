// [P-05] 涓诲姩閫氱煡/纰庣蹇?鈥?鍗犱綅 manifest锛堟湭鎺ュ叆 coordinator.boot锛?
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "Ackem/proactive-notify@0.0.1",
  "name": "涓诲姩閫氱煡/纰庣蹇?,
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "behavior",
  "description": "[P-05] 棰戞帶/鍏嶆墦鎵?姣忔棩涓婇檺锛涗笌涓撴敞妯″紡浜掓枼",
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
    "p-05"
  ]
} as PluginManifest
export const PLUGIN_ID = 'Ackem/proactive-notify@0.0.1'
export const SPEC_ID = 'P-05'
