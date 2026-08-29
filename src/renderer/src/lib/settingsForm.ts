import type { AppSettings } from '../ackem'

/** 用于 dirty 比较：trim URL/模型，忽略仅 UI 差异 */
export function normalizeSettingsDraft(s: AppSettings): AppSettings {
  return {
    ...s,
    openaiBaseUrl: s.openaiBaseUrl.trim(),
    anthropicBaseUrl: (s.anthropicBaseUrl ?? '').trim(),
    openforuBaseUrl: (s.openforuBaseUrl ?? '').trim(),
    openforuModel: (s.openforuModel ?? '').trim(),
    model: s.model.trim(),
    openforuApiKey: (s.openforuApiKey ?? '').trim(),
    llmExtraHeadersJson: (s.llmExtraHeadersJson ?? '').trim()
  }
}

export function settingsDraftEquals(a: AppSettings, b: AppSettings): boolean {
  const left = normalizeSettingsDraft(a)
  const right = normalizeSettingsDraft(b)
  return JSON.stringify(left) === JSON.stringify(right)
}

export function isSettingsDirty(form: AppSettings, persisted: AppSettings | null): boolean {
  if (!persisted) return true
  return !settingsDraftEquals(form, persisted)
}

/** 保存按钮 / persistPatch：合并 patch 并 normalize（FIX-034） */
export function mergeSettingsDraft(form: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return normalizeSettingsDraft({ ...form, ...patch })
}

/** SettingsPage.save 写入磁盘前的 payload */
export function prepareSettingsForSave(form: AppSettings): AppSettings {
  return normalizeSettingsDraft(form)
}

/** 保存后是否应提示「有未应用变更」（form 与磁盘一致则 false） */
export function shouldOfferSettingsSave(form: AppSettings, persisted: AppSettings | null): boolean {
  return isSettingsDirty(form, persisted)
}
