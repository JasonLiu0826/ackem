// [P-14] 对话弹出动画 — 占位 manifest（未接入 coordinator.boot）
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "ackem/speech-bubble@0.0.1",
  "name": "对话弹出动画",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "skin",
  "description": "[P-14] 漫画气泡从角色附近浮现（UI 规范 §8）；依赖 Live2D 桌宠",
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
    "p-14"
  ]
} as PluginManifest
export const PLUGIN_ID = 'ackem/speech-bubble@0.0.1'
export const SPEC_ID = 'P-14'
