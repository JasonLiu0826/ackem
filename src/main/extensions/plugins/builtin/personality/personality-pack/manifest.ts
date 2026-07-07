// [P-03] 浜烘牸/绉嶅瓙鍖?鈥?鍗犱綅 manifest锛堟湭鎺ュ叆 coordinator.boot锛?
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "Ackem/personality-pack@0.0.1",
  "name": "浜烘牸/绉嶅瓙鍖?,
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "personality",
  "description": "[P-03] 鏂颁汉鏍奸璁?瑙掕壊鍖?绉嶅瓙璁板繂锛沵emory/ 鍛藉悕绌洪棿闅旂",
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
    "p-03"
  ]
} as PluginManifest
export const PLUGIN_ID = 'Ackem/personality-pack@0.0.1'
export const SPEC_ID = 'P-03'
