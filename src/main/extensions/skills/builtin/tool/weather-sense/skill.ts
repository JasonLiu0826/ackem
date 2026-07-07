import { loadSettings } from '../../../../../settings'
import { resolveDataRoot } from '../../../../../paths'
import type { EngineSnapshot } from '../../../../protocols'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import { fetchWeatherSnapshot, resolveDefaultWeatherCity } from './openMeteo'
import { resolveWeatherLocationInput } from './weatherIntent'
import {
  formatWeatherSummary,
  readWeatherCache,
  writeWeatherCache,
  type WeatherSnapshot
} from './weatherCache'
import { WEATHER_SENSE_MANIFEST } from './manifest'

function resolveDataRootForSkill(): string {
  try {
    return resolveDataRoot(loadSettings())
  } catch {
    return process.env.Ackem_TEST_DATA_ROOT ?? ''
  }
}

function isSilentRefresh(invocation: SkillInvocation): boolean {
  return (
    invocation.trigger === 'scheduled' ||
    invocation.triggerDetail.startsWith('autonomous:')
  )
}

async function refreshWeather(searchQuery: string, dataRoot: string): Promise<WeatherSnapshot> {
  try {
    const snapshot = await fetchWeatherSnapshot(searchQuery)
    if (dataRoot) writeWeatherCache(dataRoot, snapshot)
    return snapshot
  } catch (err) {
    const cached = dataRoot ? readWeatherCache(dataRoot) : null
    if (cached) {
      return { ...cached, stale: true }
    }
    throw err
  }
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const dataRoot = resolveDataRootForSkill()
  const silent = isSilentRefresh(invocation)
  const locationInput =
    resolveWeatherLocationInput(invocation.args, invocation.userMessage, {
      allowMessageFallback: !silent
    }) ?? (await resolveDefaultWeatherCity(dataRoot))

  try {
    const snapshot = await refreshWeather(locationInput, dataRoot)
    const summary = formatWeatherSummary(snapshot)

    if (silent) {
      return {
        ok: true,
        output: '',
        data: { location: locationInput, summary, stale: snapshot.stale ?? false },
        injectToContext: false,
        events: [],
        durationMs: Date.now() - start
      }
    }

    return {
      ok: true,
      output: summary,
      data: { location: locationInput, summary, stale: snapshot.stale ?? false },
      injectToContext: true,
      events: [
        {
          id: `evt-weather-${Date.now()}`,
          category: 'skill',
          sourceId: WEATHER_SENSE_MANIFEST.id,
          type: 'weather_sense:refresh',
          payload: { location: locationInput, stale: snapshot.stale ?? false },
          injectToContext: true,
          contextInjection: `[澶╂皵鎰熺煡] ${summary}`,
          timestamp: new Date().toISOString()
        }
      ],
      durationMs: Date.now() - start
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      output: '',
      error: msg,
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }
}

async function shouldActivate(_snapshot: EngineSnapshot): Promise<boolean> {
  return true
}

async function getProactiveInvocation(snapshot: EngineSnapshot): Promise<SkillInvocation> {
  return {
    invocationId: `weather-${Date.now()}`,
    skillId: WEATHER_SENSE_MANIFEST.id,
    trigger: 'scheduled',
    triggerDetail: 'autonomous:interval',
    snapshot
  }
}

export const weatherSenseSkill: SkillHandler = {
  manifest: WEATHER_SENSE_MANIFEST,
  execute,
  shouldActivate,
  getProactiveInvocation
}
