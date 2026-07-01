// [S-14] 备份与迁移 — 占位 manifest
import type { SkillManifest } from '../../../types'

export const MANIFEST: SkillManifest = {
  "id": "ackem/backup-migrate@0.0.1",
  "name": "备份与迁移",
  "version": "0.0.1",
  "category": "skill",
  "skillType": "workflow",
  "description": "[S-14] 导出指引、换机步骤；权威数据仅为 txt/md",
  "author": "JasonLiu0826",
  "license": "AGPL-3.0",
  "main": "stub.ts",
  "engineVersion": ">=0.1.0 <1.0.0",
  "triggers": [
    "manual"
  ],
  "permissions": [
    "engine_read"
  ],
  "timeoutMs": 30000,
  "adultModeSafe": true,
  "tags": [
    "builtin",
    "placeholder",
    "s-14"
  ]
} as SkillManifest
export const SKILL_ID = 'ackem/backup-migrate@0.0.1'
export const SPEC_ID = 'S-14'
