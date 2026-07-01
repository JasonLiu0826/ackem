import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const DISPATCH: DispatchConfig = {
  mode: 'engine_event',
  subtype: 'relationship_trust',
  time: { active_hours: '00:00-23:59' },
  habits: ['亲密度 trust 达到里程碑'],
  scenarios: ['解锁纪念文案，静默或轻提示'],
  summary: 'trust 30/50/70 里程碑写入 growth/unlocks.json。',
  keywords: ['成长', '解锁'],
  personality_hint: 'warm'
}

export const GROWTH_UNLOCK_MANIFEST: SkillManifest = {
  id: 'ackem/growth-unlock@0.0.1',
  name: '成长与解锁',
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: '亲密度里程碑解锁纪念反馈。',
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
