import type { AppSettings } from '../Ackem'

/** 鐢ㄤ簬 dirty 姣旇緝锛歵rim URL/妯″瀷锛屽拷鐣ヤ粎 UI 宸紓 */
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

/** 淇濆瓨鎸夐挳 / persistPatch锛氬悎骞?patch 骞?normalize锛團IX-034锛?*/
export function mergeSettingsDraft(form: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return normalizeSettingsDraft({ ...form, ...patch })
}

/** SettingsPage.save 鍐欏叆纾佺洏鍓嶇殑 payload */
export function prepareSettingsForSave(form: AppSettings): AppSettings {
  return normalizeSettingsDraft(form)
}

/** 淇濆瓨鍚庢槸鍚﹀簲鎻愮ず銆屾湁鏈簲鐢ㄥ彉鏇淬€嶏紙form 涓庣鐩樹竴鑷村垯 false锛?*/
export function shouldOfferSettingsSave(form: AppSettings, persisted: AppSettings | null): boolean {
  return isSettingsDirty(form, persisted)
}
