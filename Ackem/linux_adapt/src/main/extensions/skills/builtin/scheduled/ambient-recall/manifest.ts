import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const INTERVAL_MS = 6 * 60 * 60 * 1000

const DISPATCH: DispatchConfig = {
  mode: 'autonomous',
  subtype: 'interval',
  time: {
    active_hours: '10:00-21:00',
    schedule: { rule: INTERVAL_MS, ruleType: 'interval_ms' }
  },
  habits: ['氛围合适时轻量提起一条授权记忆'],
  scenarios: ['增强陪伴感，默认保守频控'],
  summary: '低概率主动回忆一句（需有授权记忆）。',
  keywords: ['还记得', '回忆'],
  personality_hint: 'gentle'
}

export const AMBIENT_RECALL_MANIFEST: SkillManifest = {
  id: 'ackem/ambient-recall@0.0.1',
  name: '回忆触发',
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: '低概率在合适氛围主动提起一条记忆。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['scheduled'],
  permissions: ['engine_read'],
  timeoutMs: 5000,
  adultModeSafe: true,
  tags: ['builtin', 's-20', 'w5'],
  dispatch: DISPATCH
}

export const SKILL_ID = AMBIENT_RECALL_MANIFEST.id
export const SPEC_ID = 'S-20'
export const MANIFEST = AMBIENT_RECALL_MANIFEST
