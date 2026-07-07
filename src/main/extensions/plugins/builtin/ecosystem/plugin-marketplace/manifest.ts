// [P-16] 鎻掍欢鐢熸€?甯傚満 鈥?鍗犱綅 manifest锛堟湭鎺ュ叆 coordinator.boot锛?
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "Ackem/plugin-marketplace@0.0.1",
  "name": "鎻掍欢鐢熸€?甯傚満",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "tool",
  "description": "[P-16] 鍒嗗彂灞傞潰 manifest+娌欑锛涢潪杩愯鏃舵潈闄愭墿灞?,
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
    "p-16"
  ]
} as PluginManifest
export const PLUGIN_ID = 'Ackem/plugin-marketplace@0.0.1'
export const SPEC_ID = 'P-16'
