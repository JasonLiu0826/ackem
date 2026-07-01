// [P-08] 回收站元数据 — 占位 manifest（未接入 coordinator.boot）
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "ackem/recycle-bin-meta@0.0.1",
  "name": "回收站元数据",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "behavior",
  "description": "[P-08] 强权限；只读列举元数据，不读文件内容",
  "author": "JasonLiu0826",
  "license": "AGPL-3.0",
  "main": "stub.ts",
  "engineVersion": ">=0.1.0 <1.0.0",
  "permissions": [
    "engine_read",
    "system_notification"
  ],
  "fallbackPermissions": [
    "readonly"
  ],
  "tags": [
    "builtin",
    "placeholder",
    "p-08"
  ]
} as PluginManifest
export const PLUGIN_ID = 'ackem/recycle-bin-meta@0.0.1'
export const SPEC_ID = 'P-08'
