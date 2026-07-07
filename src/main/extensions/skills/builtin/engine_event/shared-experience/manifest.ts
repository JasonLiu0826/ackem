// [S-19] 鍏卞悓缁忓巻绯荤粺 鈥?鍗犱綅 manifest
import type { SkillManifest } from '../../../types'

export const MANIFEST: SkillManifest = {
  "id": "Ackem/shared-experience@0.0.1",
  "name": "鍏卞悓缁忓巻绯荤粺",
  "version": "0.0.1",
  "category": "skill",
  "skillType": "proactive",
  "description": "[S-19] 棣栨浜嬩欢/閲岀▼纰戯紱妫€绱㈠姞鏉冧笌瑙ｉ攣鍏辩敤鏁版嵁婧?,
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
export const SKILL_ID = 'Ackem/shared-experience@0.0.1'
export const SPEC_ID = 'S-19'
