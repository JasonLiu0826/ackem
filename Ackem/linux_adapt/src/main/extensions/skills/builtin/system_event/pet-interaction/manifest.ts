// [S-18] 桌宠交互 — 占位 manifest
import type { SkillManifest } from '../../../types'

export const MANIFEST: SkillManifest = {
  "id": "ackem/pet-interaction@0.0.1",
  "name": "桌宠交互",
  "version": "0.0.1",
  "category": "skill",
  "skillType": "proactive",
  "description": "[S-18] Hover/Click/Drag 情绪反馈；防暴力拖拽；依赖 P-01",
  "author": "JasonLiu0826",
  "license": "AGPL-3.0",
  "main": "stub.ts",
  "engineVersion": ">=0.1.0 <1.0.0",
  "triggers": [
    "system_event"
  ],
  "permissions": [
    "engine_read"
  ],
  "timeoutMs": 30000,
  "adultModeSafe": true,
  "tags": [
    "builtin",
    "placeholder",
    "s-18"
  ]
} as SkillManifest
export const SKILL_ID = 'ackem/pet-interaction@0.0.1'
export const SPEC_ID = 'S-18'
