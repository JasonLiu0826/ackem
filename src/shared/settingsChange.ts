import type { AppSettings } from './types'

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
