// [S-13] 用户生日检测
import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const BIRTHDAY_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'keyword_hint',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 60 },
  habits: ['用户提到生日或具体月日'],
  scenarios: ['解析并记住生日', '幂等不重复记录'],
  summary: '检测对话中的生日信息并记入上下文（非 OS 日历）。',
  keywords: ['生日', 'birthday', '生日期', '诞辰'],
  personality_hint: 'gentle_care'
}

export const BIRTHDAY_DETECT_MANIFEST: SkillManifest = {
  id: 'ackem/birthday-detect@0.0.1',
  name: '用户生日检测',
  version: '0.0.1',
  category: 'skill',
  skillType: 'rule',
  description: '对话中检测生日信息并确认记住。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['keyword'],
  permissions: ['engine_read'],
  timeoutMs: 5000,
  adultModeSafe: true,
  tags: ['builtin', 'memory', 's-13'],
  dispatch: BIRTHDAY_DISPATCH
}

export const SKILL_ID = BIRTHDAY_DETECT_MANIFEST.id
export const SPEC_ID = 'S-13'

export const MANIFEST = BIRTHDAY_DETECT_MANIFEST
