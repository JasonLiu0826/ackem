import type { SkillRegistry } from '../../../registry'
import { WEATHER_SENSE_MANIFEST } from './manifest'
import { weatherSenseSkill } from './skill'

/** 注册天气感知 Skill（基础能力，默认激活） */
export async function registerBuiltinWeatherSense(registry: SkillRegistry): Promise<void> {
  const reg = await registry.register(weatherSenseSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '天气感知 Skill 注册失败')
  }

  const instance = registry.get(WEATHER_SENSE_MANIFEST.id)
  if (instance?.status !== 'active') {
    const act = await registry.activate(WEATHER_SENSE_MANIFEST.id)
    if (!act.ok) throw new Error(act.error ?? '天气感知 Skill 激活失败')
  }
}
