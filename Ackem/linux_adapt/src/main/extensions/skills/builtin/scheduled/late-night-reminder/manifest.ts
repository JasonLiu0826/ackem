// [S-05] 深夜提醒
import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const PROD_DAILY_AT = '23:45'

/** 生产 23:45；测试/开发可用 ACKEM_LATE_NIGHT_AT=HH:MM */
export function getLateNightDailyAt(): string {
  const override = process.env.ACKEM_LATE_NIGHT_AT?.trim()
  if (override && /^\d{1,2}:\d{2}$/.test(override)) return override
  return PROD_DAILY_AT
}

const LATE_NIGHT_DISPATCH_BASE: Omit<DispatchConfig, 'time'> & {
  time: Omit<DispatchConfig['time'], 'schedule'> & {
    schedule?: { rule: string; ruleType: 'daily_at' }
  }
} = {
  mode: 'autonomous',
  subtype: 'scheduled',
  time: {
    active_hours: '22:00-02:00'
  },
  habits: ['用户深夜仍在使用电脑', '用户可能需要休息提醒'],
  scenarios: ['深夜窗口内关心式提醒休息', '非命令式睡眠建议'],
  summary: '深夜轻量提醒休息/睡眠（伴侣语气，非医疗建议）。',
  keywords: ['睡觉', '休息', '熬夜', '深夜'],
  personality_hint: 'gentle_care'
}

export function getLateNightDispatch(): DispatchConfig {
  return {
    ...LATE_NIGHT_DISPATCH_BASE,
    time: {
      ...LATE_NIGHT_DISPATCH_BASE.time,
      schedule: {
        rule: getLateNightDailyAt(),
        ruleType: 'daily_at'
      }
    }
  }
}

export const LATE_NIGHT_REMINDER_MANIFEST: SkillManifest = {
  id: 'ackem/late-night-reminder@0.0.1',
  name: '深夜提醒',
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: '深夜窗口内轻量提醒休息；对陌生人不触发。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['scheduled'],
  permissions: ['engine_read'],
  timeoutMs: 5000,
  adultModeSafe: true,
  tags: ['builtin', 'health', 's-05'],
  dispatch: getLateNightDispatch()
}

export const SKILL_ID = LATE_NIGHT_REMINDER_MANIFEST.id
export const SPEC_ID = 'S-05'

