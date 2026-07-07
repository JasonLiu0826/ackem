// [S-06] 鍠濇按鎻愰啋
import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const PROD_INTERVAL_MS = 45 * 60 * 1000
const DEV_INTERVAL_MS = 3 * 60 * 1000

/** 鐢熶骇 45min锛涘紑鍙?3min锛涙祴璇?瑕嗙洊鍙敤 Ackem_DRINK_WATER_INTERVAL_MS */
export function getDrinkWaterIntervalMs(): number {
  const override = process.env.Ackem_DRINK_WATER_INTERVAL_MS
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
  habits: ['鐢ㄦ埛闀挎椂闂翠娇鐢ㄧ數鑴?, '鐢ㄦ埛鍙兘蹇樿鍠濇按'],
  scenarios: ['鍔炲叕/瀛︿範', '杞婚噺鍋ュ悍鎻愰啋鑰岄潪鍖荤枟寤鸿'],
  summary: '瀹氭椂杞绘彁閱掑枬姘达紙浼翠荆璇皵锛岄潪鍖荤枟寤鸿锛夈€?,
  keywords: ['鍠濇按', '鍙ｆ复', '琛ユ按'],
  personality_hint: 'gentle_care'
}

export const DRINK_WATER_REMINDER_MANIFEST: SkillManifest = {
  id: 'Ackem/drink-water-reminder@0.0.1',
  name: '鍠濇按鎻愰啋',
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: '鐧藉ぉ鎸夐棿闅旇交閲忔彁閱掑枬姘达紱灏婇噸鍕挎壈涓庨鎺с€?,
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

