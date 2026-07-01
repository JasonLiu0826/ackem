import { companionProactiveSettingsEn, companionProactiveSettingsZh } from './companionProactiveSettings'
import { settingsAbilityNavEn, settingsAbilityNavZh } from './settingsAbilityNav'

export const rendererI18nOverlayZh = {
  ...companionProactiveSettingsZh,
  ...settingsAbilityNavZh
} as const

export const rendererI18nOverlayEn = {
  ...companionProactiveSettingsEn,
  ...settingsAbilityNavEn
} as const
