import type { ReleaseChannelInfo, UpdateCheckResult } from '../../shared/updateTypes'
import { compareSemver, isNewerVersion, parseSemver } from '../../shared/semverCompare'
import { app } from 'electron'
import {
  CHANNEL_ORDER_AUTO,
  GITEE,
  GITHUB,
  normalizeTag,
  zipAssetName,
  type ResolvedChannel
} from './config'

const FETCH_TIMEOUT_MS = 20_000

type GitHubRelease = {
  tag_name?: string
  body?: string
  published_at?: string
  html_url?: string
  assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>
}

type GiteeRelease = {
  tag_name?: string
  body?: string
  created_at?: string
  html_url?: string
  assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>
}

async function fetchJson<T>(url: string): Promise<T> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Ackem-Desktop-Updater/1.0'
      }
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

function pickAsset(release: GitHubRelease | GiteeRelease, version: string) {
  const name = zipAssetName(version)
  const assets = release.assets ?? []
  return assets.find((a) => a.name === name) ?? assets.find((a) => a.name?.includes('win-x64') && a.name.endsWith('.zip'))
}

async function fetchGithubRelease(): Promise<ReleaseChannelInfo> {
  try {
    const data = await fetchJson<GitHubRelease>(GITHUB.apiLatest)
    const version = normalizeTag(data.tag_name ?? '')
    if (!parseSemver(version)) throw new Error('Invalid tag')
    const asset = pickAsset(data, version)
    if (!asset?.browser_download_url) throw new Error('Missing zip asset')
    return {
      channel: 'github',
      version,
      notes: (data.body ?? '').trim(),
      downloadUrl: asset.browser_download_url,
      size: Number(asset.size ?? 0),
      publishedAt: data.published_at ?? new Date().toISOString(),
      releasePageUrl: data.html_url ?? GITHUB.releasePage
    }
  } catch (e) {
    return {
      channel: 'github',
      version: '',
      notes: '',
      downloadUrl: '',
      size: 0,
      publishedAt: '',
      releasePageUrl: GITHUB.releasePage,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

async function fetchGiteeRelease(): Promise<ReleaseChannelInfo> {
  try {
    const data = await fetchJson<GiteeRelease>(GITEE.apiLatest)
    const version = normalizeTag(data.tag_name ?? '')
    if (!parseSemver(version)) throw new Error('Invalid tag')
    const asset = pickAsset(data, version)
    if (!asset?.browser_download_url) throw new Error('Missing zip asset')
    return {
      channel: 'gitee',
      version,
      notes: (data.body ?? '').trim(),
      downloadUrl: asset.browser_download_url,
      size: Number(asset.size ?? 0),
      publishedAt: data.created_at ?? new Date().toISOString(),
      releasePageUrl: data.html_url ?? GITEE.releasePage
    }
  } catch (e) {
    return {
      channel: 'gitee',
      version: '',
      notes: '',
      downloadUrl: '',
      size: 0,
      publishedAt: '',
      releasePageUrl: GITEE.releasePage,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

export function pickLatest(
  github?: ReleaseChannelInfo,
  gitee?: ReleaseChannelInfo
): ReleaseChannelInfo | undefined {
  const valid = [github, gitee].filter((r): r is ReleaseChannelInfo => Boolean(r && r.version && !r.error))
  if (valid.length === 0) return undefined
  return valid.sort((a, b) => (compareSemver(b.version, a.version) ?? 0))[0]
}

export function pickChannelInfo(
  channel: ResolvedChannel | 'auto',
  github?: ReleaseChannelInfo,
  gitee?: ReleaseChannelInfo
): ReleaseChannelInfo | undefined {
  if (channel === 'github') return github?.error ? undefined : github
  if (channel === 'gitee') return gitee?.error ? undefined : gitee
  for (const ch of CHANNEL_ORDER_AUTO) {
    const info = ch === 'github' ? github : gitee
    if (info && !info.error && info.version) return info
  }
  return pickLatest(github, gitee)
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const [github, gitee] = await Promise.all([fetchGithubRelease(), fetchGiteeRelease()])
  const latest = pickLatest(github, gitee)
  const updateAvailable = Boolean(latest && isNewerVersion(latest.version, currentVersion))
  return {
    currentVersion,
    packaged: app.isPackaged,
    github,
    gitee,
    latest,
    updateAvailable,
    checkedAt: new Date().toISOString()
  }
}
