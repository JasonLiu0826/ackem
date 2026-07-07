import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const DISPATCH: DispatchConfig = {
  mode: 'engine_event',
  subtype: 'relationship_trust',
  time: { active_hours: '00:00-23:59' },
  habits: ['浜插瘑搴?trust 杈惧埌閲岀▼纰?],
  scenarios: ['瑙ｉ攣绾康鏂囨锛岄潤榛樻垨杞绘彁绀?],
  summary: 'trust 30/50/70 閲岀▼纰戝啓鍏?growth/unlocks.json銆?,
  keywords: ['鎴愰暱', '瑙ｉ攣'],
  personality_hint: 'warm'
}

export const GROWTH_UNLOCK_MANIFEST: SkillManifest = {
  id: 'Ackem/growth-unlock@0.0.1',
  name: '鎴愰暱涓庤В閿?,
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: '浜插瘑搴﹂噷绋嬬瑙ｉ攣绾康鍙嶉銆?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['engine_event'],
  permissions: ['engine_read', 'data_write'],
  timeoutMs: 5000,
  adultModeSafe: true,
  tags: ['builtin', 's-10', 'w5'],
  dispatch: DISPATCH
}

export const SKILL_ID = GROWTH_UNLOCK_MANIFEST.id
export const SPEC_ID = 'S-10'
export const MANIFEST = GROWTH_UNLOCK_MANIFEST

export const TRUST_MILESTONES = [30, 50, 70] as const
