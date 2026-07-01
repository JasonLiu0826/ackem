import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import { MEDIA_CO_WATCH_MANIFEST, MEDIA_KEYWORD } from './manifest'
import {
  formatMediaSession,
  hasMediaSessionTitle,
  refreshMediaSessionCache,
  type MediaSessionInfo
} from '../../../../../mediaSession'

export function buildMediaCoWatchOutput(msg: string, media: MediaSessionInfo): string {
  const mediaStr = formatMediaSession(media)
  if (mediaStr) {
    if (media.isPlaying) {
      return `【共娱】检测到你正在播放：${mediaStr}——我也在听呢，一起享受吧。`
    }
    return `【共娱】检测到你之前在播放：${mediaStr}——暂停了也没关系，我陪着你。`
  }
  if (process.platform === 'win32') {
    return '【共娱】听起来你正在享受一段视听时光——我这边还没读到系统正在播什么，但我在旁边陪着就好。'
  }
  return '【共娱】听起来你正在享受一段视听时光——我在旁边陪着就好。'
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const msg = invocation.userMessage ?? ''
  if (!MEDIA_KEYWORD.test(msg)) {
    return {
      ok: false,
      output: '',
      error: 'no media keyword',
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }

  const media = await refreshMediaSessionCache()
  const output = buildMediaCoWatchOutput(msg, media)
  const smtcHit = hasMediaSessionTitle(media)

  return {
    ok: true,
    output,
    injectToContext: true,
    events: [
      {
        id: `evt-media-${Date.now()}`,
        category: 'skill',
        sourceId: MEDIA_CO_WATCH_MANIFEST.id,
        type: 'media_co_watch:triggered',
        payload: {
          title: media.title,
          artist: media.artist,
          isPlaying: media.isPlaying,
          smtcHit,
          platform: process.platform
        },
        injectToContext: true,
        contextInjection: output,
        timestamp: new Date().toISOString()
      }
    ],
    durationMs: Date.now() - start
  }
}

export const mediaCoWatchSkill: SkillHandler = {
  manifest: MEDIA_CO_WATCH_MANIFEST,
  execute
}
