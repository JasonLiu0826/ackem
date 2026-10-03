// [P-16] 插件生态/市场 — 占位 manifest（未接入 coordinator.boot）
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "ackem/plugin-marketplace@0.0.1",
  "name": "插件生态/市场",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "tool",
  "description": "社区扩展市场（当前版本未开放；贡献者请 PR 到 ackem/ 官方扩展）",
  "author": "JasonLiu0826",
  "license": "AGPL-3.0",
  "main": "stub.ts",
  "engineVersion": ">=0.1.0 <1.0.0",
  "implementationStatus": "planned",
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
export const PLUGIN_ID = 'ackem/plugin-marketplace@0.0.1'
export const SPEC_ID = 'P-16'
