// [P-03] 人格/种子包 — 占位 manifest（未接入 coordinator.boot）
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "ackem/personality-pack@0.0.1",
  "name": "人格/种子包",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "personality",
  "description": "[P-03] 新人格预设/角色包/种子记忆；memory/ 命名空间隔离",
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
export const PLUGIN_ID = 'ackem/personality-pack@0.0.1'
export const SPEC_ID = 'P-03'
