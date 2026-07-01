import type { ExtensionsCoordinator } from '../../../coordinator'
import { WEATHER_SENSE_MANIFEST } from './manifest'
import { isWeatherQuery } from './weatherIntent'

/** 用户问天气时预拉 Open-Meteo；地点解析在 skill 内完成（LLM 参数 / 去噪 / 默认位置） */
export async function preExecuteWeatherQuery(
  coordinator: ExtensionsCoordinator,
  userText: string
): Promise<string | null> {
  if (!isWeatherQuery(userText)) return null
  if (coordinator.skills.get(WEATHER_SENSE_MANIFEST.id)?.status !== 'active') return null

  const invocation = coordinator.skills.createInvocation(
    WEATHER_SENSE_MANIFEST.id,
    'llm_function_call',
    'get_weather',
    {},
    userText
  )
  if (!invocation) return null

  const result = await coordinator.skills.execute(invocation)
  if (!result.ok || !result.output) return null

  return `[天气查询结果] ${result.output}。请据此回答，勿调用 web_search。`
}
