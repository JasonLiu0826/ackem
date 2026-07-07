// [S-03] 蹇冩儏鏃ヨ璇﹁
import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const MOOD_DIARY_DISPATCH: DispatchConfig = {
  mode: 'engine_event',
  subtype: 'emotion_delta',
  time: { active_hours: '00:00-23:59' },
  habits: ['鐢ㄦ埛鎯呯华鍦ㄤ竴杞璇濅腑鏄庢樉娉㈠姩'],
  scenarios: ['闈欓粯璁板綍 mood jsonl', 'W4 鏃?UI'],
  summary: '鎯呯华澶у箙娉㈠姩鏃跺啓鍏?data/diary/mood/YYYY-MM-DD.jsonl锛堥潤榛橈級銆?,
  keywords: ['蹇冩儏', '鎯呯华'],
  personality_hint: 'neutral'
}

export const MOOD_DIARY_DETAIL_MANIFEST: SkillManifest = {
  id: 'Ackem/mood-diary-detail@0.0.1',
  name: '蹇冩儏鏃ヨ璇﹁',
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: '鎯呯华绐佸彉鏃堕潤榛樺啓鍏?mood jsonl锛圵4 绠€鐗堬紝鏃?UI锛夈€?,
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
