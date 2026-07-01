// [S-06] 喝水提醒
import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const PROD_INTERVAL_MS = 45 * 60 * 1000
const DEV_INTERVAL_MS = 3 * 60 * 1000

/** 生产 45min；开发 3min；测试/覆盖可用 ACKEM_DRINK_WATER_INTERVAL_MS */
export function getDrinkWaterIntervalMs(): number {
  const override = process.env.ACKEM_DRINK_WATER_INTERVAL_MS
  if (override != null && override !== '') {
    const n = Number(override)
    if (Number.isFinite(n) && n > 0) return n
  }
  if (process.env.NODE_ENV === 'development') return DEV_INTERVAL_MS
  return PROD_INTERVAL_MS
}

const DRINK_WATER_DISPATCH: DispatchConfig = {
  mode: 'autonomous',
  subtype: 'interval',
  time: {
    active_hours: '08:00-22:00',
    schedule: {
      rule: getDrinkWaterIntervalMs(),
      ruleType: 'interval_ms'
    }
  },
  habits: ['用户长时间使用电脑', '用户可能忘记喝水'],
  scenarios: ['办公/学习', '轻量健康提醒而非医疗建议'],
  summary: '定时轻提醒喝水（伴侣语气，非医疗建议）。',
  keywords: ['喝水', '口渴', '补水'],
  personality_hint: 'gentle_care'
}

export const DRINK_WATER_REMINDER_MANIFEST: SkillManifest = {
  id: 'ackem/drink-water-reminder@0.0.1',
  name: '喝水提醒',
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: '白天按间隔轻量提醒喝水；尊重勿扰与频控。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['scheduled'],
  permissions: ['engine_read'],
  timeoutMs: 5000,
  adultModeSafe: true,
  tags: ['builtin', 'health', 's-06'],
  dispatch: DRINK_WATER_DISPATCH
}

export const SKILL_ID = DRINK_WATER_REMINDER_MANIFEST.id
export const SPEC_ID = 'S-06'

