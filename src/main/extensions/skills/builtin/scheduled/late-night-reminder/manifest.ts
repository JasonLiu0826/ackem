// [S-05] 娣卞鎻愰啋
import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const PROD_DAILY_AT = '23:45'

/** 鐢熶骇 23:45锛涙祴璇?寮€鍙戝彲鐢?Ackem_LATE_NIGHT_AT=HH:MM */
export function getLateNightDailyAt(): string {
  const override = process.env.Ackem_LATE_NIGHT_AT?.trim()
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
  habits: ['鐢ㄦ埛娣卞浠嶅湪浣跨敤鐢佃剳', '鐢ㄦ埛鍙兘闇€瑕佷紤鎭彁閱?],
  scenarios: ['娣卞绐楀彛鍐呭叧蹇冨紡鎻愰啋浼戞伅', '闈炲懡浠ゅ紡鐫＄湢寤鸿'],
  summary: '娣卞杞婚噺鎻愰啋浼戞伅/鐫＄湢锛堜即渚ｈ姘旓紝闈炲尰鐤楀缓璁級銆?,
  keywords: ['鐫¤', '浼戞伅', '鐔', '娣卞'],
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
  id: 'Ackem/late-night-reminder@0.0.1',
  name: '娣卞鎻愰啋',
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: '娣卞绐楀彛鍐呰交閲忔彁閱掍紤鎭紱瀵归檶鐢熶汉涓嶈Е鍙戙€?,
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

