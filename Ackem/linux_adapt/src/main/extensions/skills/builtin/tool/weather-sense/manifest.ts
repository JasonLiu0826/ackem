import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const PROD_INTERVAL_MS = 30 * 60 * 1000
const DEV_INTERVAL_MS = 2 * 60 * 1000

/** 生产 30min；开发 2min；测试/覆盖可用 ACKEM_WEATHER_INTERVAL_MS */
export function getWeatherIntervalMs(): number {
  const override = process.env.ACKEM_WEATHER_INTERVAL_MS
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
  habits: ['用户关心当地天气与出行', '用户询问今天冷不冷、要不要带伞'],
  scenarios: ['聊天中自然引用当地天气', '减少为简单天气问题调用 web-search'],
  summary: '后台定时拉取 Open-Meteo 天气缓存，供伴侣在对话中引用。',
  keywords: ['天气', '下雨', '温度', '冷不冷', '带伞', '气温'],
  personality_hint: 'gentle_care'
}

export const WEATHER_SENSE_MANIFEST: SkillManifest = {
  id: 'ackem/weather-sense@0.0.1',
  name: '天气感知',
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  description: 'Open-Meteo 定时更新天气缓存；对话中可引用当地天气；Ackem 基础能力，始终启用',
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
      '查询指定地点的实时天气（Open-Meteo）。用户问天气时必须用此工具，不要用 web_search。地点由你从用户意图推断后填入 city 或 query。',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '地点名称（城市、省、地区等），由 LLM 从用户消息推断'
        },
        query: {
          type: 'string',
          description: '可选：未能明确拆出地名时，传入用户原话或关键片段，由地理编码 API 解析'
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

