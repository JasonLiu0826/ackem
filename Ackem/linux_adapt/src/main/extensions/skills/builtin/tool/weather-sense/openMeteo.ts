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
  0: '晴',
  1: '大部晴朗',
  2: '局部多云',
  3: '多云',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  80: '阵雨',
  81: '中阵雨',
  82: '大阵雨',
  95: '雷暴',
  96: '雷暴伴小冰雹',
  99: '雷暴伴大冰雹'
}

export function wmoCodeToLabel(code: number): string {
  return WMO_LABELS[code] ?? '未知'
}

const HOME_CITY_TTL_MS = 24 * 60 * 60 * 1000
const IP_GEO_URL = 'https://geolocation-api.open-meteo.com/v1/get'

/** 用户手动指定的城市（settings / env）；无则 null */
export function getManualWeatherCity(): string | null {
  const env = process.env.ACKEM_WEATHER_CITY?.trim()
  if (env) return env
  try {
    const city = loadSettings().weatherCity?.trim()
    if (city) return city
  } catch {
    /* vitest / headless without Electron app */
  }
  return null
}

/** @deprecated 同步回退；优先用 resolveDefaultWeatherCity */
export function getWeatherCity(): string {
  return getManualWeatherCity() ?? 'Shanghai'
}

function resolveDataRootSafe(): string {
  try {
    return resolveDataRoot(loadSettings())
  } catch {
    return process.env.ACKEM_TEST_DATA_ROOT ?? ''
  }
}

async function fetchCityFromIp(): Promise<{
  city: string
  locationName: string
  latitude: number
  longitude: number
} | null> {
  if (process.env.ACKEM_WEATHER_USE_FIXTURE === '1') return null
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
      locationName: '当前位置',
      latitude: geo.latitude,
      longitude: geo.longitude
    }
  } catch {
    return null
  }
}

/**
 * 默认天气位置：settings → 24h 缓存 → IP 定位（近似系统位置）→ Shanghai
 * Windows 系统定位 API 尚未接入；IP 定位需联网且精度为城市级。
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
  if (!res.ok) throw new Error(`地理编码失败 (${res.status})`)
  const data = (await res.json()) as {
    results?: Array<{
      name: string
      country?: string
      latitude: number
      longitude: number
    }>
  }
  const hit = data.results?.[0]
  if (!hit) throw new Error(`未找到城市「${city}」`)
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
  if (!res.ok) throw new Error(`天气预报失败 (${res.status})`)
  const data = (await res.json()) as {
    current?: {
      temperature_2m: number
      relative_humidity_2m: number
      weather_code: number
      wind_speed_10m: number
    }
  }
  const current = data.current
  if (!current) throw new Error('天气预报响应缺少 current 字段')
  return {
    temperatureC: current.temperature_2m,
    humidityPct: current.relative_humidity_2m,
    weatherCode: current.weather_code,
    condition: wmoCodeToLabel(current.weather_code),
    windSpeedKmh: current.wind_speed_10m
  }
}

/** 拉取天气；测试/离线可用 ACKEM_WEATHER_USE_FIXTURE=1 */
export async function fetchWeatherSnapshot(city: string): Promise<WeatherSnapshot> {
  if (process.env.ACKEM_WEATHER_USE_FIXTURE === '1') {
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
