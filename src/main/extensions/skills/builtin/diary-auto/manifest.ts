import type { SkillManifest } from '../../types'
import type { DispatchConfig } from '../../../protocols'

const PROD_DAILY_AT = '23:30'

/** 鐢熶骇 23:30锛涙祴璇?寮€鍙戝彲鐢?Ackem_DIARY_DAILY_AT=HH:MM */
export function getDiaryDailyAt(): string {
  const override = process.env.Ackem_DIARY_DAILY_AT?.trim()
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
  habits: ['鐢ㄦ埛甯屾湜浼翠荆璁板綍姣忔棩鐩稿', '鐢ㄦ埛鍏抽棴搴旂敤鍓嶄粛鏈夊璇濇湭娌夋穩涓烘棩璁?],
  scenarios: ['姣忔棩鏅氶棿鑷姩鐢熸垚绗竴浜虹О鏃ヨ', '鍚姩鏃惰ˉ鍐欓€€鍑烘棩蹇収'],
  summary: '姣忔棩瀹氭椂锛堥粯璁?23:30锛夌敓鎴愮涓€浜虹О鏃ヨ锛涘綋鏃ュ凡鏈夊垯璺宠繃銆?,
  keywords: ['鏃ヨ', '浠婃櫄', '浠婂ぉ鎬荤粨'],
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
  id: 'Ackem/diary-auto@0.1.0',
  name: '鏃ヨ鑷姩鐢熸垚',
  version: '0.1.0',
  category: 'skill',
  skillType: 'proactive',
  description: '姣忔棩瀹氭椂鐢熸垚绗竴浜虹О鏃ヨ锛堥粯璁?23:30锛夛紱Ackem 鍩虹鑳藉姏锛屽缁堝惎鐢?,
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

