// [P-16] 插件生态/市场 — 占位 manifest（未接入 coordinator.boot）
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "ackem/plugin-marketplace@0.0.1",
  "name": "插件生态/市场",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "tool",
  "description": "[P-16] 分发层面 manifest+沙箱；非运行时权限扩展",
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
export const PLUGIN_ID = 'ackem/plugin-marketplace@0.0.1'
export const SPEC_ID = 'P-16'
