import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSettings } from '../../../../../settings'
import { resolveDataRoot } from '../../../../../paths'
import type { WeatherSnapshot } from './weatherCache'
import { readHomeCityCache, writeHomeCityCache } from './weatherCache'

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

const WMO_LABELS: Record<number, string> = {
  0: '鏅?,
  1: '澶ч儴鏅存湕',
  2: '灞€閮ㄥ浜?,
  3: '澶氫簯',
  45: '闆?,
  48: '闆惧噰',
  51: '灏忔瘺姣涢洦',
  53: '姣涙瘺闆?,
  55: '澶ф瘺姣涢洦',
  61: '灏忛洦',
  63: '涓洦',
  65: '澶ч洦',
  71: '灏忛洩',
  73: '涓洩',
  75: '澶ч洩',
  80: '闃甸洦',
  81: '涓樀闆?,
  82: '澶ч樀闆?,
  95: '闆锋毚',
  96: '闆锋毚浼村皬鍐伴浌',
  99: '闆锋毚浼村ぇ鍐伴浌'
}

export function wmoCodeToLabel(code: number): string {
  return WMO_LABELS[code] ?? '鏈煡'
}

const HOME_CITY_TTL_MS = 24 * 60 * 60 * 1000
const IP_GEO_URL = 'https://geolocation-api.open-meteo.com/v1/get'

/** 鐢ㄦ埛鎵嬪姩鎸囧畾鐨勫煄甯傦紙settings / env锛夛紱鏃犲垯 null */
export function getManualWeatherCity(): string | null {
  const env = process.env.Ackem_WEATHER_CITY?.trim()
  if (env) return env
  try {
    const city = loadSettings().weatherCity?.trim()
    if (city) return city
  } catch {
    /* vitest / headless without Electron app */
  }
  return null
}

/** @deprecated 鍚屾鍥為€€锛涗紭鍏堢敤 resolveDefaultWeatherCity */
export function getWeatherCity(): string {
  return getManualWeatherCity() ?? 'Shanghai'
}

function resolveDataRootSafe(): string {
  try {
    return resolveDataRoot(loadSettings())
  } catch {
    return process.env.Ackem_TEST_DATA_ROOT ?? ''
  }
}

async function fetchCityFromIp(): Promise<{
  city: string
  locationName: string
  latitude: number
  longitude: number
} | null> {
  if (process.env.Ackem_WEATHER_USE_FIXTURE === '1') return null
  try {
    const ipRes = await fetch('http://ip-api.com/json/?fields=status,city,lat,lon&lang=zh-CN', {
      signal: AbortSignal.timeout(8000)
    })
    if (ipRes.ok) {
      const ip = (await ipRes.json()) as {
        status?: string
        city?: string
        lat?: number
        lon?: number
      }
      if (ip.status === 'success' && ip.city && ip.lat != null && ip.lon != null) {
        return {
          city: ip.city,
          locationName: ip.city,
          latitude: ip.lat,
          longitude: ip.lon
        }
      }
    }

    const geoRes = await fetch(IP_GEO_URL, { signal: AbortSignal.timeout(8000) })
    if (!geoRes.ok) return null
    const geo = (await geoRes.json()) as { latitude?: number; longitude?: number }
    if (geo.latitude == null || geo.longitude == null) return null
    return {
      city: `${geo.latitude.toFixed(2)},${geo.longitude.toFixed(2)}`,
      locationName: '褰撳墠浣嶇疆',
      latitude: geo.latitude,
      longitude: geo.longitude
    }
  } catch {
    return null
  }
}

/**
 * 榛樿澶╂皵浣嶇疆锛歴ettings 鈫?24h 缂撳瓨 鈫?IP 瀹氫綅锛堣繎浼肩郴缁熶綅缃級鈫?Shanghai
 * Windows 绯荤粺瀹氫綅 API 灏氭湭鎺ュ叆锛汭P 瀹氫綅闇€鑱旂綉涓旂簿搴︿负鍩庡競绾с€?
 */
export async function resolveDefaultWeatherCity(dataRoot?: string): Promise<string> {
  const manual = getManualWeatherCity()
  if (manual) return manual

  const root = dataRoot || resolveDataRootSafe()
  if (root) {
    const cached = readHomeCityCache(root)
    if (cached && Date.now() - Date.parse(cached.resolvedAt) < HOME_CITY_TTL_MS) {
      return cached.city
    }
  }

  const fromIp = await fetchCityFromIp()
  if (fromIp && root) {
    writeHomeCityCache(root, {
      city: fromIp.city,
      locationName: fromIp.locationName,
      latitude: fromIp.latitude,
      longitude: fromIp.longitude,
      source: 'ip',
      resolvedAt: new Date().toISOString()
    })
    return fromIp.city
  }

  return 'Shanghai'
}

function fixturePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'shanghai.json')
}

function loadFixture(city: string): WeatherSnapshot {
  const raw = readFileSync(fixturePath(), 'utf-8')
  const base = JSON.parse(raw) as WeatherSnapshot
  return {
    ...base,
    city,
    fetchedAt: new Date().toISOString(),
    stale: false,
    source: 'fixture'
  }
}

async function geocodeCity(city: string): Promise<{
  name: string
  country?: string
  latitude: number
  longitude: number
}> {
  const url = `${GEO_URL}?name=${encodeURIComponent(city)}&count=1&language=zh`
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!res.ok) throw new Error(`鍦扮悊缂栫爜澶辫触 (${res.status})`)
  const data = (await res.json()) as {
    results?: Array<{
      name: string
      country?: string
      latitude: number
      longitude: number
    }>
  }
  const hit = data.results?.[0]
  if (!hit) throw new Error(`鏈壘鍒板煄甯傘€?{city}銆峘)
  return hit
}

async function fetchCurrentWeather(
  latitude: number,
  longitude: number
): Promise<WeatherSnapshot['current']> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
    timezone: 'auto'
  })
  const res = await fetch(`${FORECAST_URL}?${params}`, { signal: AbortSignal.timeout(12_000) })
  if (!res.ok) throw new Error(`澶╂皵棰勬姤澶辫触 (${res.status})`)
  const data = (await res.json()) as {
    current?: {
      temperature_2m: number
      relative_humidity_2m: number
      weather_code: number
      wind_speed_10m: number
    }
  }
  const current = data.current
  if (!current) throw new Error('澶╂皵棰勬姤鍝嶅簲缂哄皯 current 瀛楁')
  return {
    temperatureC: current.temperature_2m,
    humidityPct: current.relative_humidity_2m,
    weatherCode: current.weather_code,
    condition: wmoCodeToLabel(current.weather_code),
    windSpeedKmh: current.wind_speed_10m
  }
}

/** 鎷夊彇澶╂皵锛涙祴璇?绂荤嚎鍙敤 Ackem_WEATHER_USE_FIXTURE=1 */
export async function fetchWeatherSnapshot(city: string): Promise<WeatherSnapshot> {
  if (process.env.Ackem_WEATHER_USE_FIXTURE === '1') {
    return loadFixture(city)
  }

  const geo = await geocodeCity(city)
  const current = await fetchCurrentWeather(geo.latitude, geo.longitude)
  return {
    version: 1,
    city,
    locationName: geo.name,
    country: geo.country,
    latitude: geo.latitude,
    longitude: geo.longitude,
    fetchedAt: new Date().toISOString(),
    stale: false,
    source: 'open-meteo',
    current
  }
}
