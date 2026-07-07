// [P-06] 鍓创鏉胯鍙?鈥?鍗犱綅 manifest锛堟湭鎺ュ叆 coordinator.boot锛?
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "Ackem/clipboard-read@0.0.1",
  "name": "鍓创鏉胯鍙?,
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "tool",
  "description": "[P-06] 涓€閿皢鍓创鏉垮苟鍏ユ湰杞?Prompt锛涢粯璁ゅ叧",
  "author": "JasonLiu0826",
  "license": "AGPL-3.0",
  "main": "stub.ts",
  "engineVersion": ">=0.1.0 <1.0.0",
  "permissions": [
    "readonly"
  ],
  "fallbackPermissions": [
    "readonly"
  ],
  "tags": [
    "builtin",
    "placeholder",
    "p-06"
  ]
} as PluginManifest
export const PLUGIN_ID = 'Ackem/clipboard-read@0.0.1'
export const SPEC_ID = 'P-06'
