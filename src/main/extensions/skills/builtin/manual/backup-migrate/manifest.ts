// [S-14] 澶囦唤涓庤縼绉?鈥?鍗犱綅 manifest
import type { SkillManifest } from '../../../types'

export const MANIFEST: SkillManifest = {
  "id": "Ackem/backup-migrate@0.0.1",
  "name": "澶囦唤涓庤縼绉?,
  "version": "0.0.1",
  "category": "skill",
  "skillType": "workflow",
  "description": "[S-14] 瀵煎嚭鎸囧紩銆佹崲鏈烘楠わ紱鏉冨▉鏁版嵁浠呬负 txt/md",
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
export const SKILL_ID = 'Ackem/backup-migrate@0.0.1'
export const SPEC_ID = 'S-14'
