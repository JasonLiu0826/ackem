import type { SkillManifest } from '../../types'
import type { DispatchConfig } from '../../../protocols'

const PROD_DAILY_AT = '23:30'

/** 生产 23:30；测试/开发可用 ACKEM_DIARY_DAILY_AT=HH:MM */
export function getDiaryDailyAt(): string {
  const override = process.env.ACKEM_DIARY_DAILY_AT?.trim()
  if (override && /^\d{1,2}:\d{2}$/.test(override)) return override
  return PROD_DAILY_AT
}

const DIARY_DISPATCH_BASE: Omit<DispatchConfig, 'time'> & {
  time: Omit<DispatchConfig['time'], 'schedule'> & {
    schedule?: { rule: string; ruleType: 'daily_at' }
  }
} = {
  mode: 'autonomous',
  subtype: 'scheduled',
  time: {
    active_hours: '00:00-23:59'
  },
  habits: ['用户希望伴侣记录每日相处', '用户关闭应用前仍有对话未沉淀为日记'],
  scenarios: ['每日晚间自动生成第一人称日记', '启动时补写退出日快照'],
  summary: '每日定时（默认 23:30）生成第一人称日记；当日已有则跳过。',
  keywords: ['日记', '今晚', '今天总结'],
  personality_hint: 'neutral'
}

export function getDiaryDispatch(): DispatchConfig {
  return {
    ...DIARY_DISPATCH_BASE,
    time: {
      ...DIARY_DISPATCH_BASE.time,
      schedule: {
        rule: getDiaryDailyAt(),
        ruleType: 'daily_at'
      }
    }
  }
}

export const DIARY_AUTO_MANIFEST: SkillManifest = {
  id: 'ackem/diary-auto@0.1.0',
  name: '日记自动生成',
  version: '0.1.0',
  category: 'skill',
  skillType: 'proactive',
  description: '每日定时生成第一人称日记（默认 23:30）；Ackem 基础能力，始终启用',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['scheduled'],
  permissions: ['engine_read', 'data_write'],
  timeoutMs: 120_000,
  adultModeSafe: true,
  tags: ['builtin', 'diary', 's-00a', 'core'],
  dispatch: getDiaryDispatch()
}

export const SKILL_ID = DIARY_AUTO_MANIFEST.id
export const SPEC_ID = 'S-00a'

