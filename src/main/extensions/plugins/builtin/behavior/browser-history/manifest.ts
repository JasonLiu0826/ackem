// [P-09] 娴忚鍣ㄥ巻鍙茶皟渚?鈥?鍗犱綅 manifest锛堟湭鎺ュ叆 coordinator.boot锛?
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "Ackem/browser-history@0.0.1",
  "name": "娴忚鍣ㄥ巻鍙茶皟渚?,
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "behavior",
  "description": "[P-09] 寮烘潈闄愶紱鍒嗘祻瑙堝櫒娓愯繘锛涜劚鏁?铏氭瀯鏄电О妯″紡",
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
    "p-09"
  ]
} as PluginManifest
export const PLUGIN_ID = 'Ackem/browser-history@0.0.1'
export const SPEC_ID = 'P-09'
