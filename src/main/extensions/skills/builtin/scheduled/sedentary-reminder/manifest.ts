import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const PROD_INTERVAL_MS = 15 * 60 * 1000
const DEV_INTERVAL_MS = 2 * 60 * 1000

/** 鐢熶骇 15min锛涘紑鍙?2min锛涙祴璇?瑕嗙洊鍙敤 Ackem_SEDENTARY_INTERVAL_MS */
export function getSedentaryIntervalMs(): number {
  const override = process.env.Ackem_SEDENTARY_INTERVAL_MS
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
  habits: ['鐢ㄦ埛闀挎椂闂村潗鐫€浣跨敤鐢佃剳', '鐢ㄦ埛杩炵画宸ヤ綔鏈捣韬椿鍔?],
  scenarios: ['鍔炲叕/瀛︿範涔呭潗', '闇€瑕佽交閲忓仴搴锋彁閱掕€岄潪寮哄埗鎵撴柇'],
  summary: '瀹氭椂杞绘彁閱掕捣韬椿鍔ㄣ€佷几灞曟垨鍠濇按锛堜即渚ｈ姘旓紝闈炲尰鐤楀缓璁級銆?,
  keywords: ['涔呭潗', '璧锋潵', '浼戞伅', '浼稿睍'],
  personality_hint: 'gentle_care'
}

export const SEDENTARY_REMINDER_MANIFEST: SkillManifest = {
  id: 'Ackem/sedentary-reminder@0.0.1',
  name: '涔呭潗鎻愰啋',
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: '姣?15 鍒嗛挓妫€鏌ワ紱浼翠荆璇皵杞绘彁閱掕捣韬椿鍔?,
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

