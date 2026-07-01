// [P-09] 浏览器历史调侃 — 占位 manifest（未接入 coordinator.boot）
import type { PluginManifest } from '../../../types'

export const MANIFEST: PluginManifest = {
  "id": "ackem/browser-history@0.0.1",
  "name": "浏览器历史调侃",
  "version": "0.0.1",
  "category": "plugin",
  "pluginType": "behavior",
  "description": "[P-09] 强权限；分浏览器渐进；脱敏/虚构昵称模式",
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
    "p-09"
  ]
} as PluginManifest
export const PLUGIN_ID = 'ackem/browser-history@0.0.1'
export const SPEC_ID = 'P-09'
