/** W7 SMTC锛氳鍙?Windows System Media Transport Controls 鐘舵€?*/
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type MediaSessionInfo = {
  title: string
  artist: string
  album: string
  isPlaying: boolean
}

const EMPTY: MediaSessionInfo = { title: '', artist: '', album: '', isPlaying: false }

const PS_SCRIPT = `
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
  $manager = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetAwaiter().GetResult()
  $session = $manager.GetCurrentSession()
  if ($null -eq $session) { Write-Output 'NO_SESSION'; exit 0 }
  $info = $session.TryGetMediaPropertiesAsync().GetAwaiter().GetResult()
  $playback = $session.GetPlaybackInfo()
  $status = $playback.PlaybackStatus
  $title = if ($info.Title) { $info.Title } else { '' }
  $artist = if ($info.Artist) { $info.Artist } else { '' }
  $album = if ($info.AlbumTitle) { $info.AlbumTitle } else { '' }
  $playing = ($status -eq 'Playing')
  Write-Output "TITLE=$title"
  Write-Output "ARTIST=$artist"
  Write-Output "ALBUM=$album"
  Write-Output "PLAYING=$playing"
} catch {
  Write-Output 'ERROR'
}
`.trim()

export async function readMediaSession(): Promise<MediaSessionInfo> {
  if (process.platform !== 'win32') return EMPTY
  if (process.env.ACKEM_MEDIA_TITLE) {
    return {
      title: process.env.ACKEM_MEDIA_TITLE,
      artist: process.env.ACKEM_MEDIA_ARTIST ?? '',
      album: '',
      isPlaying: process.env.ACKEM_MEDIA_PLAYING === '1'
    }
  }
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
      { timeout: 8000, windowsHide: true, maxBuffer: 4096 }
    )
    const out = String(stdout ?? '').trim()
    if (out === 'NO_SESSION' || out === 'ERROR' || !out) return EMPTY

    const get = (key: string) => {
      const m = out.match(new RegExp(`^${key}=(.*)$`, 'm'))
      return m?.[1]?.trim() ?? ''
    }
    return {
      title: get('TITLE'),
      artist: get('ARTIST'),
      album: get('ALBUM'),
      isPlaying: get('PLAYING') === 'True'
    }
  } catch {
    return EMPTY
  }
}

/** 鏍煎紡鍖栦负鍙瀛楃涓?*/
export function formatMediaSession(info: MediaSessionInfo): string {
  if (!info.title && !info.artist) return ''
  const parts = [info.artist, info.title].filter(Boolean)
  return parts.join(' - ')
}

let cached: MediaSessionInfo = EMPTY
let timer: ReturnType<typeof setInterval> | null = null

export function getCachedMediaSession(): MediaSessionInfo {
  return { ...cached }
}

/** FIX-030锛氳Е鍙戝叡濞辩瓑鍦烘櫙鍓嶅己鍒跺埛鏂?SMTC 缂撳瓨 */
export async function refreshMediaSessionCache(): Promise<MediaSessionInfo> {
  const info = await readMediaSession()
  cached = info
  return { ...info }
}

export function hasMediaSessionTitle(info: MediaSessionInfo): boolean {
  return Boolean(info.title?.trim() || info.artist?.trim())
}

export function startMediaSessionPolling(intervalMs = 30_000): void {
  stopMediaSessionPolling()
  const tick = () => {
    void readMediaSession().then((info) => {
      cached = info
    })
  }
  tick()
  timer = setInterval(tick, intervalMs)
}

export function stopMediaSessionPolling(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
