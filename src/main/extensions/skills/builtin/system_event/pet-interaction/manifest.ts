// [S-18] 妗屽疇浜や簰 鈥?鍗犱綅 manifest
import type { SkillManifest } from '../../../types'

export const MANIFEST: SkillManifest = {
  "id": "Ackem/pet-interaction@0.0.1",
  "name": "妗屽疇浜や簰",
  "version": "0.0.1",
  "category": "skill",
  "skillType": "proactive",
  "description": "[S-18] Hover/Click/Drag 鎯呯华鍙嶉锛涢槻鏆村姏鎷栨嫿锛涗緷璧?P-01",
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
export const SKILL_ID = 'Ackem/pet-interaction@0.0.1'
export const SPEC_ID = 'S-18'
