import type { SocialPresetOption } from '../../ackem'

/** 取预设中文短名：`元气 Genki` → `元气` */
export function shortPresetLabel(label: string): string {
  const zh = label.trim().split(/\s+/)[0]
  return zh || label
}

export function buildPresetShortLabelMap(presets: SocialPresetOption[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const p of presets) m.set(p.id, shortPresetLabel(p.label))
  return m
}

export async function loadAllSocialPresets(): Promise<SocialPresetOption[]> {
  const [f, m] = await Promise.all([
    window.ackem.social.listPresetsForGender('female'),
    window.ackem.social.listPresetsForGender('male'),
  ])
  const map = new Map<string, SocialPresetOption>()
  for (const p of [...f, ...m]) map.set(p.id, p)
  return [...map.values()]
}
