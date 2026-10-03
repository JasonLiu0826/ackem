import { getSocialMeta, setSocialMeta } from '../db/repos/socialMetaRepo'
import { SOCIAL, type ContentMode } from './types'

export type SocialSettings = {
  enabled: boolean
  contentMode: ContentMode
  tickMs: number
}

function safeGet(root: string, key: string): string | null {
  try {
    return getSocialMeta(root, key)
  } catch {
    return null
  }
}

function safeSet(root: string, key: string, value: string): void {
  try {
    setSocialMeta(root, key, value)
  } catch {
    /* table may not exist until V12 is wired */
  }
}

export function getSocialSettings(root: string): SocialSettings {
  const enabledRaw = safeGet(root, 'social.enabled')
  const modeRaw = safeGet(root, 'social.contentMode')
  const tickRaw = safeGet(root, 'social.tickMs')
  return {
    enabled: enabledRaw !== 'false',
    contentMode: modeRaw === 'llm' ? 'llm' : 'template',
    tickMs: Number(tickRaw ?? SOCIAL.TICK_MS) || SOCIAL.TICK_MS,
  }
}

export function setSocialSettings(
  root: string,
  x: Partial<SocialSettings>
): SocialSettings {
  if (x.enabled !== undefined) safeSet(root, 'social.enabled', String(x.enabled))
  if (x.contentMode) safeSet(root, 'social.contentMode', x.contentMode)
  if (x.tickMs) safeSet(root, 'social.tickMs', String(x.tickMs))
  return getSocialSettings(root)
}
