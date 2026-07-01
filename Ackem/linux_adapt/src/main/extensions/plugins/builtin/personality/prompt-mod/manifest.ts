// [P-15] 语气模组 — 占位 manifest（未接入 coordinator.boot）
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "ackem/prompt-mod@0.0.1",
  "name": "语气模组",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "personality",
  "description": "[P-15] 可切换语气模板；版本化；与事实记忆隔离",
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
export const PLUGIN_ID = 'ackem/prompt-mod@0.0.1'
export const SPEC_ID = 'P-15'
