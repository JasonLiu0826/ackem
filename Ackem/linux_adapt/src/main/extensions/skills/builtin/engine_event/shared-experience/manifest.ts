// [S-19] 共同经历系统 — 占位 manifest
import type { SkillManifest } from '../../../types'

export const MANIFEST: SkillManifest = {
  "id": "ackem/shared-experience@0.0.1",
  "name": "共同经历系统",
  "version": "0.0.1",
  "category": "skill",
  "skillType": "proactive",
  "description": "[S-19] 首次事件/里程碑；检索加权与解锁共用数据源",
  "author": "JasonLiu0826",
  "license": "AGPL-3.0",
  "main": "stub.ts",
  "engineVersion": ">=0.1.0 <1.0.0",
  "triggers": [
    "engine_event"
  ],
  "permissions": [
    "engine_read"
  ],
  "timeoutMs": 30000,
  "adultModeSafe": true,
  "tags": [
    "builtin",
    "placeholder",
    "s-19"
  ]
} as SkillManifest
export const SKILL_ID = 'ackem/shared-experience@0.0.1'
export const SPEC_ID = 'S-19'
