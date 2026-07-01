import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type WeatherSnapshot = {
  version: 1
  city: string
  locationName: string
  country?: string
  latitude: number
  longitude: number
  fetchedAt: string
  stale?: boolean
  source: 'open-meteo' | 'fixture'
  current: {
    temperatureC: number
    humidityPct: number
    weatherCode: number
    condition: string
    windSpeedKmh: number
  }
}

export function weatherCachePath(dataRoot: string): string {
  return join(dataRoot, 'weather', 'latest.json')
}

export function readWeatherCache(dataRoot: string): WeatherSnapshot | null {
  const path = weatherCachePath(dataRoot)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as WeatherSnapshot
    if (raw?.version !== 1 || !raw.current) return null
    return raw
  } catch {
    return null
  }
}

export function writeWeatherCache(dataRoot: string, snapshot: WeatherSnapshot): void {
  const path = weatherCachePath(dataRoot)
  mkdirSync(join(dataRoot, 'weather'), { recursive: true })
  writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf-8')
}

export function formatWeatherSummary(snapshot: WeatherSnapshot): string {
  const { locationName, current, stale } = snapshot
  const place = snapshot.country ? `${locationName}（${snapshot.country}）` : locationName
  const staleNote = stale ? '，数据可能已过期' : ''
  return `${place}：${current.condition}，${Math.round(current.temperatureC)}°C，湿度 ${Math.round(current.humidityPct)}%，风速 ${Math.round(current.windSpeedKmh)} km/h${staleNote}`
}

export function formatWeatherContextBlock(snapshot: WeatherSnapshot): string {
  const fetched = new Date(snapshot.fetchedAt)
  const timeLabel = Number.isNaN(fetched.getTime())
    ? snapshot.fetchedAt
    : fetched.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return `[天气感知] ${formatWeatherSummary(snapshot)}。数据更新于 ${timeLabel}。`
}

export function readWeatherContextBlock(dataRoot: string): string | null {
  const cached = readWeatherCache(dataRoot)
  if (!cached) return null
  return formatWeatherContextBlock(cached)
}

export type HomeCityCache = {
  city: string
  locationName: string
  latitude: number
  longitude: number
  source: 'ip' | 'manual' | 'settings'
  resolvedAt: string
}

export function homeCityCachePath(dataRoot: string): string {
  return join(dataRoot, 'weather', 'home-city.json')
}

export function readHomeCityCache(dataRoot: string): HomeCityCache | null {
  const path = homeCityCachePath(dataRoot)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as HomeCityCache
  } catch {
    return null
  }
}

export function writeHomeCityCache(dataRoot: string, entry: HomeCityCache): void {
  mkdirSync(join(dataRoot, 'weather'), { recursive: true })
  writeFileSync(homeCityCachePath(dataRoot), JSON.stringify(entry, null, 2), 'utf-8')
}
