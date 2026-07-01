// [S-03] 心情日记详规
import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const MOOD_DIARY_DISPATCH: DispatchConfig = {
  mode: 'engine_event',
  subtype: 'emotion_delta',
  time: { active_hours: '00:00-23:59' },
  habits: ['用户情绪在一轮对话中明显波动'],
  scenarios: ['静默记录 mood jsonl', 'W4 无 UI'],
  summary: '情绪大幅波动时写入 data/diary/mood/YYYY-MM-DD.jsonl（静默）。',
  keywords: ['心情', '情绪'],
  personality_hint: 'neutral'
}

export const MOOD_DIARY_DETAIL_MANIFEST: SkillManifest = {
  id: 'ackem/mood-diary-detail@0.0.1',
  name: '心情日记详规',
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: '情绪突变时静默写入 mood jsonl（W4 简版，无 UI）。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['engine_event'],
  permissions: ['engine_read', 'data_write'],
  timeoutMs: 5000,
  adultModeSafe: true,
  tags: ['builtin', 'diary', 's-03'],
  dispatch: MOOD_DIARY_DISPATCH
}

export const SKILL_ID = MOOD_DIARY_DETAIL_MANIFEST.id
export const SPEC_ID = 'S-03'

export const MANIFEST = MOOD_DIARY_DETAIL_MANIFEST

export const MOOD_AFF_THRESHOLD = 10
export const MOOD_SEC_THRESHOLD = 15
