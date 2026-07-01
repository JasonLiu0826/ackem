import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const PROD_INTERVAL_MS = 15 * 60 * 1000
const DEV_INTERVAL_MS = 2 * 60 * 1000

/** 生产 15min；开发 2min；测试/覆盖可用 ACKEM_SEDENTARY_INTERVAL_MS */
export function getSedentaryIntervalMs(): number {
  const override = process.env.ACKEM_SEDENTARY_INTERVAL_MS
  if (override != null && override !== '') {
    const n = Number(override)
    if (Number.isFinite(n) && n > 0) return n
  }
  if (process.env.NODE_ENV === 'development') return DEV_INTERVAL_MS
  return PROD_INTERVAL_MS
}

const SEDENTARY_DISPATCH: DispatchConfig = {
  mode: 'autonomous',
  subtype: 'interval',
  time: {
    active_hours: '08:00-22:00',
    schedule: {
      rule: getSedentaryIntervalMs(),
      ruleType: 'interval_ms'
    }
  },
  habits: ['用户长时间坐着使用电脑', '用户连续工作未起身活动'],
  scenarios: ['办公/学习久坐', '需要轻量健康提醒而非强制打断'],
  summary: '定时轻提醒起身活动、伸展或喝水（伴侣语气，非医疗建议）。',
  keywords: ['久坐', '起来', '休息', '伸展'],
  personality_hint: 'gentle_care'
}

export const SEDENTARY_REMINDER_MANIFEST: SkillManifest = {
  id: 'ackem/sedentary-reminder@0.0.1',
  name: '久坐提醒',
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: '每 15 分钟检查；伴侣语气轻提醒起身活动',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['scheduled'],
  permissions: ['engine_read'],
  timeoutMs: 5000,
  adultModeSafe: true,
  tags: ['builtin', 'health', 's-04'],
  dispatch: SEDENTARY_DISPATCH
}

export const SKILL_ID = SEDENTARY_REMINDER_MANIFEST.id
export const SPEC_ID = 'S-04'

