// [S-00b] 绂荤嚎鎬濈华
import type { SkillManifest } from '../../types'
import type { DispatchConfig } from '../../../protocols'

const OFFLINE_DISPATCH: DispatchConfig = {
  mode: 'autonomous',
  subtype: 'engine_event',
  time: { active_hours: '00:00-23:59' },
  habits: ['鐢ㄦ埛鍏抽棴搴旂敤鍓嶄粛鏈夋湭娌夋穩鐨勫璇?],
  scenarios: ['閫€鍑烘椂鐢熸垚 1-2 鏉＄绾挎€濈华', '涓嬫鍚姩娉ㄥ叆瀵硅瘽'],
  summary: '搴旂敤閫€鍑烘椂鍩轰簬鏈€杩戝璇濈敓鎴愮绾挎€濈华锛堥潤榛橈紝鏃?toast锛夈€?,
  keywords: ['绂荤嚎', '鎬濈华', '鍐嶈'],
  personality_hint: 'neutral'
}

export const OFFLINE_THOUGHT_MANIFEST: SkillManifest = {
  id: 'Ackem/offline-thought@0.1.0',
  name: '绂荤嚎鎬濈华',
  version: '0.1.0',
  category: 'skill',
  skillType: 'proactive',
  description: '搴旂敤閫€鍑烘椂鐢熸垚鏈€佽揪鐨勭绾挎€濈华锛屼笅娆″惎鍔ㄦ敞鍏ャ€?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['engine_event'],
  permissions: ['engine_read'],
  timeoutMs: 10000,
  adultModeSafe: true,
  tags: ['offline', 'builtin', 's-00b'],
  dispatch: OFFLINE_DISPATCH
}

export const SKILL_ID = OFFLINE_THOUGHT_MANIFEST.id
export const SPEC_ID = 'S-00b'

export const MANIFEST = OFFLINE_THOUGHT_MANIFEST
