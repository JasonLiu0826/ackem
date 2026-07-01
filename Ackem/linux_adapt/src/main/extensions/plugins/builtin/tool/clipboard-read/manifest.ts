// [P-06] 剪贴板读取 — 占位 manifest（未接入 coordinator.boot）
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "ackem/clipboard-read@0.0.1",
  "name": "剪贴板读取",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "tool",
  "description": "[P-06] 一键将剪贴板并入本轮 Prompt；默认关",
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
export const PLUGIN_ID = 'ackem/clipboard-read@0.0.1'
export const SPEC_ID = 'P-06'
