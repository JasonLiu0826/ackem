// [P-04] 桌面悬浮陪伴 — 占位 manifest（未接入 coordinator.boot）
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "ackem/desktop-float@0.0.1",
  "name": "桌面悬浮陪伴",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "skin",
  "description": "[P-04] 贴边小窗/窄条展示简要情绪态；一键关闭；不遮挡系统关键 UI",
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
    "p-04"
  ]
} as PluginManifest
export const PLUGIN_ID = 'ackem/desktop-float@0.0.1'
export const SPEC_ID = 'P-04'
