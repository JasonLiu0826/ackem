// [P-05] 主动通知/碎碎念 — 占位 manifest（未接入 coordinator.boot）
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "ackem/proactive-notify@0.0.1",
  "name": "主动通知/碎碎念",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "behavior",
  "description": "[P-05] 频控/免打扰/每日上限；与专注模式互斥",
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
    "p-05"
  ]
} as PluginManifest
export const PLUGIN_ID = 'ackem/proactive-notify@0.0.1'
export const SPEC_ID = 'P-05'
