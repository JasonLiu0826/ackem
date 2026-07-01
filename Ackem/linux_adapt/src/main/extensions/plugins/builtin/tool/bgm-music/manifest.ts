// [P-12] BGM 轻音乐 — 占位 manifest（未接入 coordinator.boot）
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "ackem/bgm-music@0.0.1",
  "name": "BGM 轻音乐",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "tool",
  "description": "[P-12] 背景音乐播放",
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
    "p-12"
  ]
} as PluginManifest
export const PLUGIN_ID = 'ackem/bgm-music@0.0.1'
export const SPEC_ID = 'P-12'
