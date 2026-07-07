import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const PROD_INTERVAL_MS = 30 * 60 * 1000
const DEV_INTERVAL_MS = 2 * 60 * 1000

/** 鐢熶骇 30min锛涘紑鍙?2min锛涙祴璇?瑕嗙洊鍙敤 Ackem_WEATHER_INTERVAL_MS */
export function getWeatherIntervalMs(): number {
  const override = process.env.Ackem_WEATHER_INTERVAL_MS
  if (override != null && override !== '') {
    const n = Number(override)
    if (Number.isFinite(n) && n > 0) return n
  }
  if (process.env.NODE_ENV === 'development') return DEV_INTERVAL_MS
  return PROD_INTERVAL_MS
}

const WEATHER_DISPATCH: DispatchConfig = {
  mode: 'autonomous',
  subtype: 'interval',
  time: {
    active_hours: '06:00-23:00',
    schedule: {
      rule: getWeatherIntervalMs(),
      ruleType: 'interval_ms'
    }
  },
  habits: ['鐢ㄦ埛鍏冲績褰撳湴澶╂皵涓庡嚭琛?, '鐢ㄦ埛璇㈤棶浠婂ぉ鍐蜂笉鍐枫€佽涓嶈甯︿紴'],
  scenarios: ['鑱婂ぉ涓嚜鐒跺紩鐢ㄥ綋鍦板ぉ姘?, '鍑忓皯涓虹畝鍗曞ぉ姘旈棶棰樿皟鐢?web-search'],
  summary: '鍚庡彴瀹氭椂鎷夊彇 Open-Meteo 澶╂皵缂撳瓨锛屼緵浼翠荆鍦ㄥ璇濅腑寮曠敤銆?,
  keywords: ['澶╂皵', '涓嬮洦', '娓╁害', '鍐蜂笉鍐?, '甯︿紴', '姘旀俯'],
  personality_hint: 'gentle_care'
}

export const WEATHER_SENSE_MANIFEST: SkillManifest = {
  id: 'Ackem/weather-sense@0.0.1',
  name: '澶╂皵鎰熺煡',
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  description: 'Open-Meteo 瀹氭椂鏇存柊澶╂皵缂撳瓨锛涘璇濅腑鍙紩鐢ㄥ綋鍦板ぉ姘旓紱Ackem 鍩虹鑳藉姏锛屽缁堝惎鐢?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call', 'scheduled'],
  permissions: ['engine_read', 'network_outbound', 'data_write'],
  timeoutMs: 30000,
  adultModeSafe: true,
  functionDef: {
    name: 'get_weather',
    description:
      '鏌ヨ鎸囧畾鍦扮偣鐨勫疄鏃跺ぉ姘旓紙Open-Meteo锛夈€傜敤鎴烽棶澶╂皵鏃跺繀椤荤敤姝ゅ伐鍏凤紝涓嶈鐢?web_search銆傚湴鐐圭敱浣犱粠鐢ㄦ埛鎰忓浘鎺ㄦ柇鍚庡～鍏?city 鎴?query銆?,
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '鍦扮偣鍚嶇О锛堝煄甯傘€佺渷銆佸湴鍖虹瓑锛夛紝鐢?LLM 浠庣敤鎴锋秷鎭帹鏂?
        },
        query: {
          type: 'string',
          description: '鍙€夛細鏈兘鏄庣‘鎷嗗嚭鍦板悕鏃讹紝浼犲叆鐢ㄦ埛鍘熻瘽鎴栧叧閿墖娈碉紝鐢卞湴鐞嗙紪鐮?API 瑙ｆ瀽'
        }
      },
      required: []
    }
  },
  tags: ['builtin', 'weather', 's-01', 'core'],
  dispatch: WEATHER_DISPATCH
}

export const SKILL_ID = WEATHER_SENSE_MANIFEST.id
export const SPEC_ID = 'S-01'

