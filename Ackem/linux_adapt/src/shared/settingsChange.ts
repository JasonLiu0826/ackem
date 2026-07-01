import type { AppSettings } from './types'

/** 电脑助手相关设置键（变更时不应触发 embedding / 引擎缓存重建） */
export const DESKTOP_AGENT_SETTING_KEYS = [
  'desktopAgentEnabled',
  'desktopAgentRiskAccepted',
  'desktopAgentAllowAppControl',
  'desktopAgentAllowFileWrite',
  'desktopAgentAllowDownload',
  'desktopAgentAllowInstall',
  'desktopAgentAllowDocumentRead',
  'desktopAgentAllowDelete',
  'desktopAgentDownloadDir',
] as const satisfies readonly (keyof AppSettings)[]

const DESKTOP_AGENT_KEY_SET = new Set<string>(DESKTOP_AGENT_SETTING_KEYS)

function settingValue(settings: AppSettings, key: string): unknown {
  return (settings as Record<string, unknown>)[key]
}

/** 返回 prev → next 之间值发生变化的设置键 */
export function changedSettingKeys(prev: AppSettings, next: AppSettings): string[] {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  const changed: string[] = []
  for (const key of keys) {
    if (settingValue(prev, key) !== settingValue(next, key)) {
      changed.push(key)
    }
  }
  return changed
}

export function embeddingSettingsChanged(prev: AppSettings, next: AppSettings): boolean {
  const prevModel = prev.embeddingActiveModel ?? 'bge-small-zh'
  const nextModel = next.embeddingActiveModel ?? 'bge-small-zh'
  if (prevModel !== nextModel) return true
  if ((prev.embeddingRemoteUrl ?? '') !== (next.embeddingRemoteUrl ?? '')) return true
  if ((prev.embeddingRemoteModel ?? '') !== (next.embeddingRemoteModel ?? '')) return true
  return false
}

/** 是否仅有电脑助手相关字段发生变化 */
export function onlyDesktopAgentSettingsChanged(prev: AppSettings, next: AppSettings): boolean {
  const changed = changedSettingKeys(prev, next)
  return changed.length > 0 && changed.every((key) => DESKTOP_AGENT_KEY_SET.has(key))
}
